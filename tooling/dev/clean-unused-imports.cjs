/** Compiler-guided import cleanup. Keep runtime module side effects; never remove statements, hooks or public APIs. */
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const apply = process.argv.includes('--apply');
const printer = ts.createPrinter();
let filesChanged = 0, removedBindings = 0;
for (const configFile of ['tsconfig.json','cloud/api/tsconfig.json']) {
  const configPath = path.join(root,configFile);
  const read = ts.readConfigFile(configPath,ts.sys.readFile);
  if (read.error) throw Error('Cannot read TypeScript configuration');
  const parsed = ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(configPath));
  const program = ts.createProgram(parsed.fileNames,{...parsed.options,noUnusedLocals:true,noUnusedParameters:true,noEmit:true});
  const diagnostics = program.getSemanticDiagnostics().filter(d => d.code === 6133 || d.code === 6192);
  for (const source of program.getSourceFiles()) {
    const relative = path.relative(root,source.fileName).replaceAll('\\','/');
    if (!/^(apps|cloud|packages)\//.test(relative) || !relative.includes('/src/') || source.isDeclarationFile || relative.includes('node_modules')) continue;
    const unused = diagnostics.filter(d => d.file === source);
    const edits = [];
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !node.importClause) continue;
      const relevant = unused.filter(d => d.start >= node.getStart(source) && d.start < node.end);
      if (!relevant.length) continue;
      const allUnused = relevant.some(d => d.code === 6192);
      const isUnused = name => allUnused || relevant.some(d => d.start >= name.getStart(source) && d.start < name.end);
      const clause = node.importClause;
      const defaultName = clause.name && !isUnused(clause.name) ? clause.name : undefined;
      let bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const kept = bindings.elements.filter(e => !isUnused(e.name));
        removedBindings += bindings.elements.length - kept.length;
        bindings = kept.length ? ts.factory.updateNamedImports(bindings,kept) : undefined;
      } else if (bindings && isUnused(bindings.name)) {removedBindings++;bindings = undefined;}
      if (clause.name && !defaultName) removedBindings++;
      const nextClause = defaultName || bindings ? ts.factory.updateImportClause(clause,clause.isTypeOnly,defaultName,bindings) : undefined;
      const next = !nextClause && clause.isTypeOnly ? undefined : ts.factory.updateImportDeclaration(node,node.modifiers,nextClause,node.moduleSpecifier,node.attributes);
      const replacement = next ? printer.printNode(ts.EmitHint.Unspecified,next,source) : '';
      edits.push({start:node.getStart(source),end:node.end,replacement});
    }
    if (!edits.length) continue;
    let text = source.text;
    for (const edit of edits.sort((a,b) => b.start-a.start)) text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
    if (text !== source.text) {filesChanged++;if(apply) fs.writeFileSync(source.fileName,text);}
  }
}
console.log(JSON.stringify({apply,filesChanged,removedBindings,scope:'Unused import bindings only. Runtime side-effect imports are retained.'}));
