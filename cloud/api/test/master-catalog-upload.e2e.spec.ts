import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

// security-audit LOW-03: master-catalog image upload used to trust the
// client-declared contentType and derive the on-disk extension from the
// client-declared fileName — a client could send contentType:'image/png',
// fileName:'x.png' with arbitrary bytes (including HTML/JS) and it would be
// written to super-admin-web's public static root unexamined. The service
// now sniffs the real file type from its magic bytes and rejects (a) SVG
// entirely (XML text that can carry a <script> tag) and (b) anything whose
// declared type doesn't match its actual bytes.
describe('Master-catalog image upload (LOW-03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ownerEmail = `test-catalog-owner-${Date.now()}@example.com`;
  const readOnlyEmail = `test-catalog-ro-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let ownerToken: string;
  let readOnlyToken: string;

  // 1x1 transparent PNG
  const realPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const uploadDir = path.resolve(process.cwd(), '../super-admin-web/public/assets/uploads/catalog');

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: ownerEmail, password, role: 'PLATFORM_OWNER' });
    await createTestPlatformUser(prisma, { email: readOnlyEmail, password, role: 'READ_ONLY' });

    ownerToken = (await platformLogin(app, ownerEmail, password)).body.accessToken;
    readOnlyToken = (await platformLogin(app, readOnlyEmail, password)).body.accessToken;
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: { in: [ownerEmail, readOnlyEmail] } } });
    await app.close();
  });

  it('accepts a real PNG and writes it to disk with a .png extension, regardless of the declared fileName', async () => {
    const res = await authed('post', '/api/v1/master-catalog/upload-image', ownerToken).send({
      fileName: 'my-dish.jpg', // deliberately mismatched — the sniffed bytes must win
      contentType: 'image/jpeg', // also deliberately mismatched
      base64Data: `data:image/png;base64,${realPngBase64}`
    });

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/\.png$/);

    const onDisk = path.join(uploadDir, path.basename(res.body.url));
    expect(fs.existsSync(onDisk)).toBe(true);
    fs.unlinkSync(onDisk);
  });

  it('rejects an SVG upload outright, even with a correct SVG contentType', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const res = await authed('post', '/api/v1/master-catalog/upload-image', ownerToken).send({
      fileName: 'dish.svg',
      contentType: 'image/svg+xml',
      base64Data: svg
    });
    expect(res.status).toBe(400);
  });

  it('rejects an HTML payload disguised as a PNG (wrong bytes, claimed contentType/fileName lie), and writes nothing to disk', async () => {
    const html = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>').toString('base64');
    const before = fs.existsSync(uploadDir) ? new Set(fs.readdirSync(uploadDir)) : new Set<string>();

    const res = await authed('post', '/api/v1/master-catalog/upload-image', ownerToken).send({
      fileName: 'totally-a-dish.png',
      contentType: 'image/png',
      base64Data: html
    });
    expect(res.status).toBe(400);

    const after = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
    expect(after.filter((f) => !before.has(f))).toEqual([]);
  });

  it('a READ_ONLY platform role cannot upload catalog images', async () => {
    const res = await authed('post', '/api/v1/master-catalog/upload-image', readOnlyToken).send({
      fileName: 'dish.png',
      contentType: 'image/png',
      base64Data: realPngBase64
    });
    expect(res.status).toBe(403);
  });
});
