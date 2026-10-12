const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const after = process.argv.includes('--after');
const out = path.join(__dirname, 'evidence', ...(after ? ['after'] : []));
fs.mkdirSync(out, { recursive: true });
const rel = p => path.relative(root, p).replaceAll('\\', '/');
const directories = ['apps/restaurant-system/pos-admin/src','apps/restaurant-system/pos/src','apps/restaurant-system/captain/src','apps/restaurant-system/kds/src','apps/kiosk-system/kiosk-user/src','apps/qr-guest/src','cloud/super-admin-web/src','cloud/api/src',...fs.readdirSync(path.join(root,'packages')).filter(n=>fs.existsSync(path.join(root,'packages',n,'src'))).map(n=>`packages/${n}/src`),'packages/tauri-plugin-apk-updater/guest-js'];
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):/\.[cm]?[jt]sx?$/.test(x.name)&&!x.name.endsWith('.d.ts')?[path.join(dir,x.name)]:[]);
const files = [...new Set(directories.flatMap(d=>walk(path.join(root,d))))];
const config = p => {const f=ts.readConfigFile(p,ts.sys.readFile);if(f.error)throw Error('Cannot read TS config');return ts.parseJsonConfigFileContent(f.config,ts.sys,path.dirname(p));};
const frontend = config(path.join(root,'tsconfig.json'));
const api = config(path.join(root,'cloud/api/tsconfig.json'));
const cache=ts.createModuleResolutionCache(root,p=>p,frontend.options);
const graph=new Map();const metrics=[];const patterns=[];const unresolved=[];
for(const file of files){
 const text=fs.readFileSync(file,'utf8');const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);const edges=new Set();let any=0;let dialogCallCandidates=0;
 const add=(specifier,pos)=>{const options=file.includes(path.join('cloud','api'))?api.options:frontend.options;const result=ts.resolveModuleName(specifier,file,options,ts.sys,cache).resolvedModule;if(result){let resolved=result.resolvedFileName;try{resolved=fs.realpathSync(resolved);}catch{}if(resolved.startsWith(root+path.sep)&&!resolved.includes(path.sep+'node_modules'+path.sep))edges.add(resolved);}else if(specifier.startsWith('.')||specifier.startsWith('@jaman'))unresolved.push({file:rel(file),line:source.getLineAndCharacterOfPosition(pos).line+1,specifier});};
 const visit=node=>{
  if(node.kind===ts.SyntaxKind.AnyKeyword)any++;
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))add(node.moduleSpecifier.text,node.pos);
  if(ts.isCallExpression(node)){
   if((node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))add(node.arguments[0].text,node.pos);
   const name=node.expression.getText(source);if(/^(window\.)?(alert|confirm|prompt)$/.test(name)){dialogCallCandidates++;patterns.push({kind:'dialog-call-candidate',file:rel(file),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,name});}
  }
  ts.forEachChild(node,visit);
 };visit(source);graph.set(file,edges);
 const lines=text.split(/\r?\n/);lines.forEach((line,index)=>{for(const [kind,re] of [['follow-up-marker',/\b(TODO|FIXME|HACK|placeholder|mock|hardcoded|stub)\b/i],['small-type',/text-\[(?:8|9|10|11)px\]/]])if(re.test(line))patterns.push({kind,file:rel(file),line:index+1});});
 metrics.push({file:rel(file),lines:lines.length,explicitAnyKeywords:any,dialogCallCandidates});
}
const entries=['apps/restaurant-system/pos-admin/src/main.tsx','apps/restaurant-system/pos-admin/src/qr/main.tsx','apps/restaurant-system/pos/src/main.tsx','apps/restaurant-system/captain/src/main.tsx','apps/restaurant-system/kds/src/main.tsx','apps/kiosk-system/kiosk-user/src/main.tsx','apps/qr-guest/src/main.tsx','cloud/super-admin-web/src/main.tsx','cloud/api/src/main.ts'];
const reachable=new Set();const traverse=file=>{if(reachable.has(file))return;reachable.add(file);for(const target of graph.get(file)||[])traverse(target);};entries.map(x=>path.join(root,x)).forEach(traverse);
const candidates=files.filter(f=>!reachable.has(f)).map(file=>({file:rel(file),reason:'Not reachable from the nine declared runtime entry points through resolved static imports, exports or literal dynamic imports/requires. May still be a worker, external entry, test-used/public library export, or runtime-discovered module; do not delete without checking.'}));
const summary={checkedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Source audit only; no app code changed. Current working tree includes existing unrelated changes. Dialog-call candidates are syntax matches; run scan-unused.cjs for symbol-resolved DOM calls and unused declaration evidence.',files:files.length,entries,reachableFiles:files.filter(f=>reachable.has(f)).length,unreachableCandidates:candidates,unresolved,largestFiles:[...metrics].sort((a,b)=>b.lines-a.lines).slice(0,25),totals:{explicitAnyKeywords:metrics.reduce((a,b)=>a+b.explicitAnyKeywords,0),dialogCallCandidates:metrics.reduce((a,b)=>a+b.dialogCallCandidates,0),smallTypeLines:patterns.filter(x=>x.kind==='small-type').length},metrics,patterns};
if (after) summary.scope = 'Post-implementation source scan of the current working tree. Scanner is read-only. Existing unrelated changes are preserved. Dialog-call candidates require symbol resolution; reachability candidates are not proven dead modules.';
fs.writeFileSync(path.join(out,'SOURCE_SCAN.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({files:summary.files,reachable:summary.reachableFiles,candidates:candidates.length,unresolved:unresolved.length,totals:summary.totals,largestFiles:summary.largestFiles.slice(0,10)},null,2));
console.log('Run scan-unused.cjs next for compiler unused declarations and symbol-resolved browser dialog calls.');
