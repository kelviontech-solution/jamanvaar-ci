import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadedBackup {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
  encrypted: boolean;
}

/** First bytes of every encrypted object, so a reader can tell it apart from plain gzip. */
const MAGIC = Buffer.from('JVBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Backup destination (BUG-071/074).
 *
 * - **S3-compatible bucket** (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO) when
 *   BACKUP_S3_* are set: off-site, the setup for production.
 * - **This server's own disk** (BACKUP_LOCAL_DIR, default ./data/backups) otherwise, so backups work out
 *   of the box on a small install. It is clearly reported as not off-site.
 *
 * Every object is gzip-compressed and, when BACKUP_ENCRYPTION_KEY_B64 (32 bytes, base64) is set,
 * encrypted with AES-256-GCM before it leaves this process, so a bucket or disk leak exposes nothing.
 * The recorded checksum is over the stored bytes, so verification detects any change to them.
 */
@Injectable()
export class BackupStorageService {
  private readonly logger = new Logger(BackupStorageService.name);

  constructor(private readonly config: ConfigService) {}

  // ---- configuration -----------------------------------------------------------------------

  private s3Configured(): boolean {
    return Boolean(
      this.config.get<string>('BACKUP_S3_BUCKET') &&
        this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID') &&
        this.config.get<string>('BACKUP_S3_SECRET_ACCESS_KEY')
    );
  }

  private localDir(): string {
    return resolve(this.config.get<string>('BACKUP_LOCAL_DIR') || join(process.cwd(), 'data', 'backups'));
  }

  private encryptionKey(): Buffer | null {
    const b64 = this.config.get<string>('BACKUP_ENCRYPTION_KEY_B64');
    if (!b64) return null;
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      this.logger.warn('BACKUP_ENCRYPTION_KEY_B64 must be 32 bytes (base64); backups will NOT be encrypted until it is fixed.');
      return null;
    }
    return key;
  }

  /** Where backups go and how well they are protected, for the health card. Never returns key material. */
  describe() {
    const s3 = this.s3Configured();
    const encrypted = this.encryptionKey() !== null;
    return {
      storageMode: (s3 ? 's3' : 'local') as 's3' | 'local',
      offsite: s3,
      encryptionEnabled: encrypted,
      storageNote: s3
        ? `Stored in the S3-compatible bucket "${this.config.get<string>('BACKUP_S3_BUCKET')}".${encrypted ? '' : ' Not encrypted by the API: set BACKUP_ENCRYPTION_KEY_B64.'}`
        : `Stored on this server's own disk. Set the BACKUP_S3_* variables for off-site copies.${encrypted ? '' : ' Not encrypted: set BACKUP_ENCRYPTION_KEY_B64.'}`
    };
  }

  /** Writes and removes a probe object, so "is storage working" is answered by trying it. */
  async checkHealth(): Promise<{ ok: boolean; error?: string } & ReturnType<BackupStorageService['describe']>> {
    const info = this.describe();
    const key = `health/probe-${Date.now()}.txt`;
    try {
      await this.put(key, Buffer.from('ok'), 'text/plain', false);
      await this.delete(key);
      return { ok: true, ...info };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), ...info };
    }
  }

  // ---- backends ----------------------------------------------------------------------------

  private getClient(): S3Client {
    const endpoint = this.config.get<string>('BACKUP_S3_ENDPOINT');
    return new S3Client({
      region: this.config.get<string>('BACKUP_S3_REGION') || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: this.config.get<string>('BACKUP_S3_FORCE_PATH_STYLE') === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('BACKUP_S3_SECRET_ACCESS_KEY')!
      }
    });
  }

  private localPath(storageKey: string): string {
    const root = this.localDir();
    const full = resolve(root, storageKey);
    if (full !== root && !full.startsWith(root + sep)) throw new ServiceUnavailableException('Invalid storage key');
    return full;
  }

  private async put(storageKey: string, body: Buffer, contentType: string, gzip: boolean, meta: Record<string, string> = {}) {
    if (this.s3Configured()) {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.config.get<string>('BACKUP_S3_BUCKET')!,
          Key: storageKey,
          Body: body,
          ContentType: contentType,
          ...(gzip ? { ContentEncoding: 'gzip' } : {}),
          Metadata: meta
        })
      );
      return;
    }
    const file = this.localPath(storageKey);
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  // ---- encryption --------------------------------------------------------------------------

  private encrypt(plain: Buffer, key: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
  }

  private decrypt(stored: Buffer, key: Buffer): Buffer {
    const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = stored.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
    const body = stored.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }

  private isEncrypted(stored: Buffer): boolean {
    return stored.length > MAGIC.length && stored.subarray(0, MAGIC.length).equals(MAGIC);
  }

  // ---- public API --------------------------------------------------------------------------

  async upload(restaurantId: string, jsonPayload: string): Promise<UploadedBackup> {
    const compressed = gzipSync(Buffer.from(jsonPayload, 'utf8'));
    const key = this.encryptionKey();
    const stored = key ? this.encrypt(compressed, key) : compressed;
    const checksumSha256 = createHash('sha256').update(stored).digest('hex');
    const storageKey = `restaurants/${restaurantId}/${Date.now()}-${checksumSha256.slice(0, 12)}.json.gz${key ? '.enc' : ''}`;

    await this.put(storageKey, stored, key ? 'application/octet-stream' : 'application/json', !key, { restaurantId, checksumSha256 });
    return { storageKey, sizeBytes: stored.byteLength, checksumSha256, encrypted: key !== null };
  }

  /** A pre-signed link, only possible for an unencrypted object in an S3 bucket. Otherwise null: use the API file route. */
  async getSignedDownloadUrl(storageKey: string, encrypted: boolean, expiresInSeconds = 300): Promise<string | null> {
    if (!this.s3Configured() || encrypted) return null;
    const command = new GetObjectCommand({ Bucket: this.config.get<string>('BACKUP_S3_BUCKET')!, Key: storageKey });
    return getSignedUrl(this.getClient(), command, { expiresIn: expiresInSeconds });
  }

  /** The stored bytes exactly as written (still compressed, and encrypted when it was). Verification hashes these. */
  async downloadRaw(storageKey: string): Promise<Buffer> {
    if (this.s3Configured()) {
      const res = await this.getClient().send(new GetObjectCommand({ Bucket: this.config.get<string>('BACKUP_S3_BUCKET')!, Key: storageKey }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return fs.readFile(this.localPath(storageKey));
  }

  /** The original JSON text. Throws if an encrypted object was tampered with (the GCM tag will not match). */
  async downloadAndDecompress(storageKey: string): Promise<string> {
    return this.plainFromRaw(await this.downloadRaw(storageKey));
  }

  plainFromRaw(raw: Buffer): string {
    let compressed = raw;
    if (this.isEncrypted(raw)) {
      const key = this.encryptionKey();
      if (!key) throw new ServiceUnavailableException('This backup is encrypted but BACKUP_ENCRYPTION_KEY_B64 is not set on this server');
      compressed = this.decrypt(raw, key);
    }
    return gunzipSync(compressed).toString('utf8');
  }

  async delete(storageKey: string): Promise<void> {
    if (!storageKey) return;
    if (this.s3Configured()) {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.config.get<string>('BACKUP_S3_BUCKET')!, Key: storageKey }));
      return;
    }
    await fs.rm(this.localPath(storageKey), { force: true });
  }
}
