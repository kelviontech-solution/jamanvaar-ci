const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [root,privateState,...tests]=process.argv.slice(2);
const state=JSON.parse(fs.readFileSync(privateState,'utf8'));
if(!/test/i.test(new URL(state.databaseUrl).pathname)) throw Error('Dedicated test database required');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:state.databaseUrl,TEST_DATABASE_URL:state.databaseUrl,JWT_ACCESS_SECRET:'AssessmentOnly-ThrowawaySecret-2026-10-11-Mr8Z2u',SMTP_HOST:''};
for(const name of Object.keys(env)) if(/RAZORPAY|CASHFREE|AWS_SECRET|JAMANVAAR_SERVICE_SECRET/.test(name)) delete env[name];
const r=spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','--config','cloud/api/vitest.config.ts',...tests],{cwd:root,env,stdio:'inherit'});
process.exit(r.status ?? 1);
