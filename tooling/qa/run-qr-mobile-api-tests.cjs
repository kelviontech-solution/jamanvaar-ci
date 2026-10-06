const fs=require('node:fs'),p=require('node:path'),{spawnSync}=require('node:child_process');
const root=p.resolve(__dirname,'../..'),s=JSON.parse(fs.readFileSync(p.join(root,'.jamanvaar/browser-audit/private-state.json')));
if(!/test/i.test(new URL(s.databaseUrl).pathname))throw Error('Dedicated test database required');
const env={...process.env,NODE_ENV:'test',TEST_DATABASE_URL:s.databaseUrl,DATABASE_URL:s.databaseUrl,JWT_ACCESS_SECRET:s.jwtSecret,PAYMENT_CREDENTIAL_ENCRYPTION_KEY:s.encryptionKey,SMTP_HOST:'',BACKUP_SCHEDULE:'off'};
for(const k of Object.keys(env))if(/RAZORPAY|AWS_|WHATSAPP|JAMANVAAR_SERVICE_SECRET/.test(k))delete env[k];
const files=process.argv.slice(2);
const r=spawnSync(process.execPath,[p.join(root,'node_modules/vitest/vitest.mjs'),'run','--config','cloud/api/vitest.config.ts',...(files.length?files:['cloud/api/test/qr-mobile-payments.e2e.spec.ts','cloud/api/test/qr-ordering-saas.e2e.spec.ts','cloud/api/test/qr-live-availability.e2e.spec.ts','cloud/api/test/qr-menu-control.e2e.spec.ts','cloud/api/test/qr-ordering.e2e.spec.ts','cloud/api/test/payments-webhook.e2e.spec.ts','cloud/api/test/whatsapp-channel-payments.e2e.spec.ts']),'--reporter=default','--reporter=json','--outputFile=../../logs/qr-mobile-api-tests.json'],{cwd:root,env,stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;
