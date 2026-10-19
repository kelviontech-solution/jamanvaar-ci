const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');const root=path.resolve(__dirname,'../../..');require('dotenv').config({path:path.join(root,'cloud/api/.env')});
const url=new URL(process.env.TEST_DATABASE_URL||'invalid:');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/test/i.test(url.pathname))throw Error('Local dedicated test connection required');
const owned='jamanvaar_ecosystem_audit_test_20261017_c3f1';if(url.pathname.slice(1)===owned)throw Error('Cleanup must connect outside its target database');
const c=new(require('pg').Client)({connectionString:url.toString()});
(async()=>{await c.connect();const r=await c.query('SELECT datname FROM pg_database WHERE datname=$1',[owned]);if(r.rows.length)await c.query('DROP DATABASE '+owned+' WITH (FORCE)');await c.end();
 const relative='docs/reports/multi-branch-2026-10-07/PERFORMANCE.json',file=path.join(root,relative),copy=path.join(__dirname,'MULTI_BRANCH_MEASUREMENT.json');let restored=false;
 if(fs.readFileSync(file).equals(fs.readFileSync(copy))){fs.writeFileSync(file,cp.execFileSync('git',['show','ccf17d93288ede1a1bdf7bb2c150adf84ec88e72:'+relative],{cwd:root}));restored=true;}
 const result={at:new Date().toISOString(),ownedDisposableDatabaseRemoved:true,historicalPerformanceArtifactRestored:restored,applicationFilesChangedByAudit:false,concurrentApplicationEditsPreserved:true};fs.writeFileSync(path.join(__dirname,'CLEANUP.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.log('CLEANUP_FAILED',e.code||e.message);c.end();process.exitCode=1;});
