// Runs the actual compiled AppModule on an isolated DB. Only email delivery is captured locally.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, '.jamanvaar/browser-audit');
const state = JSON.parse(fs.readFileSync(path.join(dir, 'private-state.json')));
// Prisma eagerly reads .env at import time. Load it BEFORE sanitizing environment values.
require('@prisma/client');
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: state.databaseUrl, JWT_ACCESS_SECRET: state.jwtSecret, PAYMENT_CREDENTIAL_ENCRYPTION_KEY: state.encryptionKey, PORT: String(state.port), SMTP_HOST: '', BACKUP_SCHEDULE: 'off', BACKUP_LOCAL_DIR: path.join(dir, 'backups'), QR_ORDER_BASE_URL: 'http://localhost:5190' });
for (const key of Object.keys(process.env)) if (/RAZORPAY|SMTP_|AWS_|WHATSAPP|JAMANVAAR_SERVICE_SECRET|BACKUP_S3/.test(key)) delete process.env[key];
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return Promise.reject(Error('External network blocked by browser QA harness'));
  return nativeFetch(input, init);
};
if (state.simulatedGateway) {
  process.env.RAZORPAY_KEY_ID = 'qa_simulated_key';
  process.env.RAZORPAY_KEY_SECRET = state.jwtSecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = state.jwtSecret;
}
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(path.join(root, 'cloud/api/dist/src/app.module'));
const { EmailService } = require(path.join(root, 'cloud/api/dist/src/modules/notifications/email.service'));
const { installBodyParsers } = require(path.join(root, 'cloud/api/dist/src/common/body-limits'));
const { corsFor } = require(path.join(root, 'cloud/api/dist/src/common/cors'));
const { redactUrl } = require(path.join(root, 'cloud/api/dist/src/common/request-context'));
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  installBodyParsers(app);
  app.use(require('helmet')({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(require('cookie-parser')());
  const allowedOrigins = [5174, 5175, 5176, 5177, 5179, 5180, 5190, 5284, 5286].map(p => `http://localhost:${p}`);
  app.enableCors((req, cb) => cb(null, corsFor({ allowedOrigins, qrOrigins: ['http://localhost:5190'] }, req.url, req.headers.origin)));
  app.get(EmailService).send = async (to, subject, html) => {
    const match = /(\d{6})<\/span>/.exec(html);
    const emails = fs.existsSync(path.join(dir, 'private-mail.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'private-mail.json'))) : {};
    emails[to] = { otp: match?.[1], subject, html };
    fs.writeFileSync(path.join(dir, 'private-mail.json'), JSON.stringify(emails));
    return true;
  };
  if (state.simulatedGateway) {
    const { RazorpayGatewayService } = require(path.join(root, 'cloud/api/dist/src/modules/payments/razorpay-gateway.service'));
    const gateway = app.get(RazorpayGatewayService);
    gateway.createUpiQr = async input => ({ qrId: `qa_qr_${input.paymentRef}`, imageUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="15" y="110" font-size="16">QA SIMULATED QR</text></svg>'), status: 'active' });
    gateway.listQrPayments = async () => [];
    gateway.createRefund = async input => ({ refundId: `qa_refund_${input.receipt}`, status: 'processed', amountPaise: input.amountPaise });
  }
  // Signature validation remains the actual gateway implementation with a throw-away QA secret.
  app.use((req, res, next) => {
    const t = performance.now();
    res.on('finish', () => fs.appendFileSync(path.join(dir, 'server-timings.jsonl'), JSON.stringify({ method: req.method, endpoint: redactUrl(req.originalUrl), status: res.statusCode, ms: +(performance.now() - t).toFixed(2) }) + '\n'));
    next();
  });
  await app.listen(state.port, '127.0.0.1');
  fs.writeFileSync(path.join(dir, 'server-ready.json'), JSON.stringify({ port: state.port }));
  console.log(`Audit API listening on ${state.port}. Real auth, signatures, RLS, rate limits; external networking blocked; gateway ${state.simulatedGateway ? 'SIMULATED' : 'unconfigured'}.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(); });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
