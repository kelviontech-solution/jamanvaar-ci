// Audit-only: create a fresh, localhost-only database. Never modify existing databases or print credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const workspace=path.resolve(__dirname,'../../..'),root='C:/Users/OMSANJ~1/AppData/Local/Temp/jamanvaar-assessment-a6e13aaf01f1';
(async()=>{
 const cfg=require('dotenv').parse(fs.readFileSync(path.join(workspace,'cloud/api/.env'))),admin=new URL(cfg.DATABASE_URL),test=new URL(cfg.TEST_DATABASE_URL);
 for(const url of [admin,test])if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Localhost-only QA required');
 const role=decodeURIComponent(test.username),databaseName='jamanvaar_ecosystem_test_'+Date.now();if(!/^[a-z_][a-z0-9_]*$/i.test(role))throw Error('Invalid QA role');
 const {Client}=require('pg'),db=new Client({connectionString:admin.href});await db.connect();
 try{const row=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];if(!row||row.rolsuper||row.rolbypassrls)throw Error('Non-bypass role required');await db.query(`CREATE DATABASE "${databaseName}" OWNER "${role}"`);}finally{await db.end();}
 test.pathname='/'+databaseName;
 const state={databaseName,databaseUrl:test.href};fs.writeFileSync(path.join(workspace,'.jamanvaar/ecosystem-assessment-private.json'),JSON.stringify(state));
 const env={...process.env,NODE_ENV:'test',DATABASE_URL:test.href,TEST_DATABASE_URL:test.href,JWT_ACCESS_SECRET:crypto.randomBytes(40).toString('base64url'),SEED_DEMO_DATA:'false',SEED_SUPER_ADMIN_EMAIL:'assessment-bootstrap@example.invalid',SEED_SUPER_ADMIN_PASSWORD:crypto.randomBytes(30).toString('base64url'),SMTP_HOST:''};
 for(const name of Object.keys(env))if(/RAZORPAY|CASHFREE|AWS_SECRET|JAMANVAAR_SERVICE_SECRET/.test(name))delete env[name];
 const run=args=>{const r=spawnSync(process.execPath,args,{cwd:path.join(root,'cloud/api'),env,encoding:'utf8'});let output=(r.stdout||'')+(r.stderr||'');for(const value of [admin.href,test.href,decodeURIComponent(admin.password),decodeURIComponent(test.password),env.SEED_SUPER_ADMIN_PASSWORD,env.JWT_ACCESS_SECRET])if(value)output=output.split(value).join('[REDACTED]');process.stdout.write(output);if(r.status!==0)throw Error('QA preparation command failed');};
 run([path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy']);
 run([path.join(root,'node_modules/ts-node/dist/bin.js'),'--transpile-only','prisma/seed.ts']);
 console.log('Fresh frozen-commit QA database prepared; non-bypass role; credentials in ignored local state.');
})().catch(e=>{console.error(e.message==='Localhost-only QA required'?e.message:e.constructor.name+': QA preparation failed; credential details suppressed');process.exitCode=1;});
