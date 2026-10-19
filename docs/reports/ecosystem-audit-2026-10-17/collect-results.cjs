const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../../..'),privateDir=path.join(root,'.jamanvaar/ecosystem-audit-2026-10-17');
const clean=s=>s.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database URL redacted]').replace(/Bearer\s+[A-Za-z0-9_.-]+/g,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[token redacted]');
const results={at:new Date().toISOString(),rootInitial:{files:321,passedFiles:312,failedFiles:9,tests:2249,passed:2238,failed:11,durationSeconds:816.84},checks:[]};
for(const name of ['root-tests-rerun','api-tests','probes']){
 const file=path.join(privateDir,name+'.json');if(!fs.existsSync(file))throw Error('Missing completed result '+name);const d=JSON.parse(fs.readFileSync(file,'utf8'));
 results.checks.push({name,success:d.success,files:d.testResults.length,passedFiles:d.testResults.filter(f=>f.status==='passed').length,failedFiles:d.testResults.filter(f=>f.status==='failed').length,tests:d.numTotalTests,passed:d.numPassedTests,failed:d.numFailedTests,skipped:d.numPendingTests,durationSeconds:Math.round((Math.max(...d.testResults.map(f=>f.endTime||0))-d.startTime)/1000),failedCases:d.testResults.flatMap(f=>(f.assertionResults||[]).filter(a=>a.status==='failed').map(a=>({file:path.relative(root,f.name).replaceAll('\\','/'),title:a.fullName,reason:clean((a.failureMessages?.[0]||'').split('\n')[0].slice(0,250))}))),filesStatus:d.testResults.map(f=>({file:path.relative(root,f.name).replaceAll('\\','/'),status:f.status,passed:f.assertionResults?.filter(a=>a.status==='passed').length,failed:f.assertionResults?.filter(a=>a.status==='failed').length}))});
}
results.typechecks={root:{exit:1,errorCount:8},apiAll:{exit:1,errorCount:10},apiProductionSource:{exit:0}};
results.frontendBundles={passed:['super','admin','pos','kiosk','captain','kds','qr'],scope:'Vite bundling; public assets not fully copied; native packages not built'};
results.npmProductionAdvisories={info:0,low:0,moderate:0,high:0,critical:0};
fs.writeFileSync(path.join(__dirname,'TEST_SUMMARY.json'),JSON.stringify(results,null,2));
const perf=path.join(root,'docs/reports/multi-branch-2026-10-07/PERFORMANCE.json');fs.copyFileSync(perf,path.join(__dirname,'MULTI_BRANCH_MEASUREMENT.json'));
console.log(JSON.stringify(results.checks.map(({name,files,tests,passed,failed,skipped,durationSeconds})=>({name,files,tests,passed,failed,skipped,durationSeconds})),null,2));
const api=results.checks.find(c=>c.name==='api-tests');console.log('SELECTED_API_CASES',JSON.stringify(api.filesStatus.filter(f=>/tenant-isolation|security-hardening|security-audit-regressions|payments-webhook|payments-refund|inventory-ledger.e2e|sync-chaos|sync-events-and-sequence|activation-redeem|realtime-stream/.test(f.file))));
