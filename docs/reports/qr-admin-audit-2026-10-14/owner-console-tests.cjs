const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),state=JSON.parse(fs.readFileSync(path.join(root,'.jamanvaar/full-app-audit-2026-10-13/private-state.json')));
if(!new URL(state.databaseUrl).pathname.includes('test'))throw Error('Isolated test DB required');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:state.databaseUrl,TEST_DATABASE_URL:state.databaseUrl,JWT_ACCESS_SECRET:state.jwtSecret,PAYMENT_CREDENTIAL_ENCRYPTION_KEY:state.encryptionKey};
for(const key of Object.keys(env))if(/RAZORPAY|SMTP_|AWS_|WHATSAPP/.test(key))delete env[key];env.SMTP_HOST='';
const suites=['owner-console-plans','admin-product-access','merged-admin-access','tenant-my-applications','application-entitlements-db-catalog','plans-dynamic-entitlements','ai-assistant','qr-module','qr-mobile-payments','qr-operations','qr-ordering','qr-ordering-saas','qr-menu-control','qr-service-request-pickup-entitlement','multi-branch-dashboard','ecosystem','status-sync','entity-sync','sync-events-and-sequence','tenant-session-enforcement'];
const out=fs.createWriteStream(path.join(root,'.jamanvaar/owner-console-backend.log'));
const child=spawn(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run',...suites.map(name=>`test/${name}.e2e.spec.ts`),'--maxWorkers=1','--reporter=default'],{cwd:path.join(root,'cloud/api'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(out);child.stderr.pipe(out);child.on('exit',code=>{console.log('Owner console backend suite exit:',code);process.exitCode=code||0;});
