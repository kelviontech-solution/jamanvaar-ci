const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'../../..');const outputDir=path.join(__dirname,'evidence',...(process.argv.includes('--after')?['after']:[]));const scan=JSON.parse(fs.readFileSync(path.join(outputDir,'SOURCE_SCAN.json'),'utf8'));
const files=scan.metrics.map(x=>path.join(root,x.file));const unused=[];const nativeCalls=[];
for(const label of ['frontend','api']){
 const configPath=path.join(root,label==='api'?'cloud/api/tsconfig.json':'tsconfig.json');const read=ts.readConfigFile(configPath,ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(configPath));
 const sources=files.filter(f=>label==='api'?f.includes(path.join('cloud','api')):!f.includes(path.join('cloud','api')));const allowed=new Set(sources.map(f=>path.normalize(f).toLowerCase()));
 const program=ts.createProgram(sources,{...parsed.options,noUnusedLocals:true,noUnusedParameters:true,noEmit:true});const checker=program.getTypeChecker();
 for(const d of program.getSemanticDiagnostics())if([6133,6192,6196,6138].includes(d.code)&&d.file&&allowed.has(path.normalize(d.file.fileName).toLowerCase()))unused.push({file:path.relative(root,d.file.fileName).replaceAll('\\','/'),line:d.file.getLineAndCharacterOfPosition(d.start||0).line+1,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});
 for(const source of program.getSourceFiles())if(allowed.has(path.normalize(source.fileName).toLowerCase())){
  const visit=node=>{if(ts.isCallExpression(node)&&/^(window\.)?(alert|confirm|prompt)$/.test(node.expression.getText(source))){const sym=checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression)?node.expression.name:node.expression);if(sym?.declarations?.some(d=>/lib\.dom\.d\.ts$/.test(d.getSourceFile().fileName)))nativeCalls.push({file:path.relative(root,source.fileName).replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,name:node.expression.getText(source)});}ts.forEachChild(node,visit);};visit(source);
 }
 console.log(`${label}: ${unused.length} cumulative unused declarations; ${nativeCalls.length} DOM dialog calls`);
}
fs.writeFileSync(path.join(outputDir,'UNUSED_DECLARATIONS.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Compiler-detected unused locals/imports/parameters in the scanned source; path normalization handles Windows TS paths. Candidates are not deleted and do not prove a whole feature is unused.',count:unused.length,diagnostics:unused},null,2));
fs.writeFileSync(path.join(outputDir,'NATIVE_DIALOGS.json'),JSON.stringify({scope:'Calls whose resolved symbol is declared in lib.dom.d.ts. Imported custom useConfirm callbacks are excluded.',count:nativeCalls.length,calls:nativeCalls},null,2));
