// Separate QA port: leave any existing developer API process untouched.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const entry=path.resolve(__dirname,'../full-app-browser-audit-2026-10-13/isolated-api.cjs');
const port=Number(process.env.JAMANVAAR_ADMIN_FLOW_PORT||4012);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local QA port');
const source=fs.readFileSync(entry,'utf8').replaceAll('state.port',String(port));
const runner=new Module(entry,module);runner.filename=entry;runner.paths=Module._nodeModulePaths(path.dirname(entry));runner._compile(source,entry);
