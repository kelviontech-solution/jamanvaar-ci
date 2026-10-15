const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const state=JSON.parse(fs.readFileSync(path.join(root,'.jamanvaar/full-app-audit-2026-10-13/private-state.json')));
if(!new URL(state.databaseUrl).pathname.includes('test'))throw Error('Isolated test database required');
async function main(){
 const {Client}=require('pg'),c=new Client({connectionString:state.databaseUrl});await c.connect();try{await c.query(fs.readFileSync(path.join(root,'cloud/api/prisma/migrations/20261015160000_qr_restaurant_page/migration.sql'),'utf8'));}finally{await c.end();}
 const env={...process.env,NODE_ENV:'test',DATABASE_URL:state.databaseUrl,TEST_DATABASE_URL:state.databaseUrl,JWT_ACCESS_SECRET:state.jwtSecret,PAYMENT_CREDENTIAL_ENCRYPTION_KEY:state.encryptionKey};for(const k of Object.keys(env))if(/RAZORPAY|SMTP_|AWS_|WHATSAPP/.test(k))delete env[k];
 const rootSuite=process.argv[2]==='root';
 const args=rootSuite?['--testTimeout=30000']:process.argv[2]==='regression'?['test/qr-ordering-saas.e2e.spec.ts','test/qr-operations.e2e.spec.ts','test/qr-mobile-payments.e2e.spec.ts','test/qr-menu-control.e2e.spec.ts']:['test/qr-restaurant-page.e2e.spec.ts'];
 const mode=process.argv[2]||'backend',out=fs.createWriteStream(path.join(root,'.jamanvaar/qr-page-'+mode+'.log'));
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run',...args,rootSuite?'--maxWorkers=2':'--maxWorkers=1'],{cwd:rootSuite?root:path.join(root,'cloud/api'),env,windowsHide:true});child.stdout.pipe(out);child.stderr.pipe(out);child.on('close',resolve);});
 fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'evidence','verification-'+mode+'.json'),JSON.stringify({at:new Date().toISOString(),exitCode:code},null,2));console.log('QR page '+mode,code===0?'PASS':'FAIL');if(code)process.exitCode=1;
}
main().catch(()=>{console.error('Verification failed. Private connection details withheld.');process.exitCode=1;});
