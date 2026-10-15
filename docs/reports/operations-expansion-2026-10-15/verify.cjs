const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'../../..'),privateDir=path.join(root,'.jamanvaar/full-app-audit-2026-10-13'),state=JSON.parse(fs.readFileSync(path.join(privateDir,'private-state.json')));
if(!new URL(state.databaseUrl).pathname.includes('test'))throw Error('Isolated test database required');
const vitest=path.join(root,'node_modules/vitest/vitest.mjs'),tsc=path.join(root,'node_modules/typescript/bin/tsc');
async function run(name,args,cwd=root,env=process.env){return new Promise(resolve=>{const log=fs.createWriteStream(path.join(root,'.jamanvaar/ops-'+name+'.log'));const child=spawn(process.execPath,args,{cwd,env,windowsHide:true});child.stdout.pipe(log);child.stderr.pipe(log);child.on('exit',code=>{console.log(name,code===0?'PASS':'FAIL',code);resolve({name,exitCode:code});});});}
async function main(){const mode=process.argv[2];let results=[];
 if(mode==='backend'){const env={...process.env,NODE_ENV:'test',DATABASE_URL:state.databaseUrl,TEST_DATABASE_URL:state.databaseUrl,JWT_ACCESS_SECRET:state.jwtSecret,PAYMENT_CREDENTIAL_ENCRYPTION_KEY:state.encryptionKey};for(const k of Object.keys(env))if(/RAZORPAY|SMTP_|AWS_|WHATSAPP/.test(k))delete env[k];results.push(await run('backend',[vitest,'run','test/operations-expansion.e2e.spec.ts','src/modules/operations/operations-policy.spec.ts','src/modules/operations/operations-analytics.spec.ts','--maxWorkers=1'],path.join(root,'cloud/api'),env));}
 if(mode==='types'){for(const app of ['apps/restaurant-system/pos-admin','apps/restaurant-system/pos','apps/restaurant-system/kds','apps/restaurant-system/captain','apps/kiosk-system/kiosk-user'])results.push(await run('types-'+path.basename(app),[tsc,'--noEmit','-p',app+'/tsconfig.json']));}
 if(mode==='builds')results.push(await run('builds',[path.join(root,'docs/reports/full-app-browser-audit-2026-10-13/build-apps.cjs'),'admin','pos','kiosk','captain','kds'],root,{...process.env,JAMANVAAR_QA_SKIP_PUBLIC:'1'}));
 if(mode==='root')results.push(await run('root-tests',[vitest,'run','--maxWorkers=2','--testTimeout=30000']));
 if(!results.length)throw Error('Choose backend, types, builds or root');
 fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'evidence','verification-'+mode+'.json'),JSON.stringify({checks:results},null,2));if(results.some(r=>r.exitCode!==0))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
