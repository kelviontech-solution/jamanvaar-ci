/** Read-only source inventory and preservation checks for the admin consistency audit. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript'),postcss=require('postcss');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/reports/admin-consistency-2026-10-15');
const roots=['cloud/super-admin-web/src','apps/restaurant-system/pos-admin/src','packages/ui/src'];
fs.mkdirSync(out,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const inventory=[],selectors=new Map(),preservation={};
for(const base of roots)for(const file of files(path.join(root,base)).filter(f=>/\.(tsx?|css)$/.test(f))){
 const source=fs.readFileSync(file,'utf8'),relative=path.relative(root,file).replaceAll('\\','/');
 const item={file:relative,lines:source.split('\n').length,imports:[],exports:[],jsx:{},routes:[],uiClasses:[]};
 if(file.endsWith('.css')){
  postcss.parse(source,{from:file}).walkRules(rule=>{for(const selector of rule.selectors){if(!selectors.has(selector))selectors.set(selector,[]);selectors.get(selector).push({file:relative,line:rule.source.start.line,context:rule.parent.type==='atrule'?rule.parent.params:'base',declarations:rule.nodes.filter(n=>n.type==='decl').map(n=>n.prop+':'+n.value)});}});
 }else{
  const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const structural=[],handlers=[];
  function visit(node){
   if(ts.isImportDeclaration(node))item.imports.push(node.moduleSpecifier.text);
   if((ts.isFunctionDeclaration(node)||ts.isVariableStatement(node)||ts.isClassDeclaration(node))&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))item.exports.push(node.name?.text||node.declarationList?.declarations.map(d=>d.name.getText(parsed)).join(','));
   if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
    const tag=node.tagName.getText(parsed);item.jsx[tag]=(item.jsx[tag]||0)+1;structural.push(tag);
    for(const attribute of node.attributes.properties){
     if(!ts.isJsxAttribute(attribute))continue;
     const name=attribute.name.getText(parsed);
     if(name==='path'&&attribute.initializer&&ts.isStringLiteral(attribute.initializer))item.routes.push(attribute.initializer.text);
     if(name==='className'&&attribute.initializer&&ts.isStringLiteral(attribute.initializer))item.uiClasses.push(attribute.initializer.text);
     // Include every existing prop except presentation-only style and className.
     if(!['className','style'].includes(name))handlers.push(tag+':'+attribute.getText(parsed));
    }
   }
   ts.forEachChild(node,visit);
  }visit(parsed);
  const program=ts.transform(parsed,[context=>{const visit=node=>ts.isJsxAttribute(node)&&['className','style'].includes(node.name.getText(parsed))?undefined:ts.visitEachChild(node,visit,context);return file=>ts.visitNode(file,visit);}]);
  const nonPresentation=ts.createPrinter({removeComments:true}).printFile(program.transformed[0]);program.dispose();
  preservation[relative]={sourceHash:crypto.createHash('sha256').update(source).digest('hex'),structureHash:crypto.createHash('sha256').update(JSON.stringify(structural)).digest('hex'),behaviorPropsHash:crypto.createHash('sha256').update(JSON.stringify(handlers)).digest('hex'),nonPresentationHash:crypto.createHash('sha256').update(nonPresentation).digest('hex'),jsx:item.jsx};
 }
 inventory.push(item);
}
const collisionCandidates=[...selectors].filter(([selector,entries])=>/^(\.(?:modal|field|form-|page-|toolbar|btn|card|data-table|pagination)|input|select|button)/.test(selector)&&new Set(entries.map(e=>e.file)).size>1).map(([selector,entries])=>({selector,entries}));
fs.writeFileSync(path.join(out,'source-inventory.json'),JSON.stringify({roots,files:inventory,cssCollisionCandidates:collisionCandidates},null,2));
const snapshot=path.join(out,'preservation-before.json');
if(process.argv.includes('--verify')){
 const before=JSON.parse(fs.readFileSync(snapshot,'utf8'));
 const changes=Object.entries(preservation).filter(([file,value])=>before[file]?.sourceHash!==value.sourceHash).map(([file,value])=>({file,structurePreserved:before[file]?.structureHash===value.structureHash,behaviorPropsPreserved:before[file]?.behaviorPropsHash===value.behaviorPropsHash,nonPresentationProgramPreserved:before[file]?.nonPresentationHash===value.nonPresentationHash}));
 if(changes.some(c=>!c.structurePreserved||!c.behaviorPropsPreserved||!c.nonPresentationProgramPreserved))process.exitCode=1;
 fs.writeFileSync(path.join(out,'preservation-after.json'),JSON.stringify(changes,null,2));console.log(JSON.stringify(changes,null,2));
}else if(!fs.existsSync(snapshot))fs.writeFileSync(snapshot,JSON.stringify(preservation,null,2));
else {const before=JSON.parse(fs.readFileSync(snapshot,'utf8'));for(const[file,value]of Object.entries(preservation))if(before[file]?.sourceHash===value.sourceHash&&!before[file].nonPresentationHash)before[file].nonPresentationHash=value.nonPresentationHash;fs.writeFileSync(snapshot,JSON.stringify(before,null,2));}
console.log(JSON.stringify({files:inventory.length,byRoot:roots.map(base=>({base,files:inventory.filter(i=>i.file.startsWith(base)).length})),routes:inventory.flatMap(i=>i.routes).length,cssCollisions:collisionCandidates.map(c=>({selector:c.selector,files:[...new Set(c.entries.map(e=>e.file))]}))},null,2));
