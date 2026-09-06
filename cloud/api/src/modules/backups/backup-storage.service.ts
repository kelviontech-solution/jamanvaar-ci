import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadedBackup {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Backup destination for §06/§17 of the audit: previously "no off-device
 * storage exists anywhere in the monorepo." Uses the S3 API rather than a
 * single vendor SDK — AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean
 * Spaces, and MinIO (self-hosted) all speak it, so whichever one you already
 * have an account with works by setting BACKUP_S3_ENDPOINT (omit for real
 * AWS S3) plus the usual bucket/region/credential env vars. Degrades to a
 * clear 503 — not a silent no-op — when unconfigured, the same pattern as
 * LicensingService for the signing key.
 */
@Injectable()
export class BackupStorageService {
  constructor(private readonly config: ConfigService) {}

  private isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('BACKUP_S3_BUCKET') &&
        this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID') &&
        this.config.get<string>('BACKUP_S3_SECRET_ACCESS_KEY')
    );
  }

  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Backup storage is not configured on this server (set BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY — and BACKUP_S3_ENDPOINT if using a non-AWS S3-compatible provider)'
      );
    }
    const endpoint = this.config.get<string>('BACKUP_S3_ENDPOINT');
    return new S3Client({
      region: this.config.get<string>('BACKUP_S3_REGION') ?? 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: this.config.get<string>('BACKUP_S3_FORCE_PATH_STYLE') === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('BACKUP_S3_SECRET_ACCESS_KEY')!
      }
    });
  }

  get configured(): boolean {
    return this.isConfigured();
  }

  async upload(restaurantId: string, jsonPayload: string): Promise<UploadedBackup> {
    const client = this.getClient();
    const bucket = this.config.get<string>('BACKUP_S3_BUCKET')!;
    const compressed = gzipSync(Buffer.from(jsonPayload, 'utf8'));
    const checksumSha256 = createHash('sha256').update(compressed).digest('hex');
    const storageKey = `restaurants/${restaurantId}/${Date.now()}-${checksumSha256.slice(0, 12)}.json.gz`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: compressed,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        Metadata: { restaurantId, checksumSha256 }
      })
    );

    return { storageKey, sizeBytes: compressed.byteLength, checksumSha256 };
  }

  async getSignedDownloadUrl(storageKey: string, expiresInSeconds = 300): Promise<string> {
    const client = this.getClient();
    const bucket = this.config.get<string>('BACKUP_S3_BUCKET')!;
    const command = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /** Used by restore-verification / integration tests, not the download flow (which streams the raw object via a signed URL). */
  async downloadAndDecompress(storageKey: string): Promise<string> {
    const client = this.getClient();
    const bucket = this.config.get<string>('BACKUP_S3_BUCKET')!;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    const bytes = await res.Body!.transformToByteArray();
    return gunzipSync(Buffer.from(bytes)).toString('utf8');
  }
}
