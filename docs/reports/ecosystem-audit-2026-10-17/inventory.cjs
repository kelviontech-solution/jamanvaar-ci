const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..'),out=__dirname;
const text=f=>fs.readFileSync(path.join(root,f),'utf8');
function walk(dir,accept){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['node_modules','target','dist','gen'].includes(e.name)?[]:walk(dir+'/'+e.name,accept)):accept(e.name)?[dir+'/'+e.name]:[]);}
function decorators(node){return (ts.canHaveDecorators(node)?ts.getDecorators(node):[])||[];}
function call(d,name){return ts.isCallExpression(d.expression)&&d.expression.expression.getText()===name?d.expression:null;}
const routes=[];
for(const file of walk('cloud/api/src',n=>n.endsWith('controller.ts')||n.endsWith('controllers.ts'))){
 const source=ts.createSourceFile(file,text(file),ts.ScriptTarget.Latest,true);
 for(const node of source.statements){if(!ts.isClassDeclaration(node))continue;
  const classDec=decorators(node),prefixCall=classDec.map(d=>call(d,'Controller')).find(Boolean);if(!prefixCall)continue;
  const prefix=prefixCall.arguments[0]?.text??prefixCall.arguments[0]?.getText()??'';
  for(const method of node.members){if(!ts.isMethodDeclaration(method))continue;
   for(const d of decorators(method)){for(const verb of ['Get','Post','Put','Patch','Delete','Sse']){const endpoint=call(d,verb);if(!endpoint)continue;
    const suffix=endpoint.arguments[0]?.text??endpoint.arguments[0]?.getText()??'';
    routes.push({file,line:source.getLineAndCharacterOfPosition(method.getStart(source)).line+1,class:node.name?.text,handler:method.name.getText(source),verb,prefix,suffix,declaredGuards:[...classDec,...decorators(method)].map(d=>call(d,'UseGuards')).filter(Boolean).map(c=>c.arguments.map(a=>a.getText(source)).join(',')),note:'Declaration inventory only; service authorization/signatures/global guards also need inspection.'});
   }}
  }
 }
}
fs.writeFileSync(path.join(out,'ROUTE_INVENTORY.json'),JSON.stringify({at:new Date().toISOString(),count:routes.length,routes},null,2));
const paths=[
 'cloud/api/src/modules/order-sync/order-sync.service.ts','cloud/api/src/modules/order-sync/order-rules.ts','cloud/api/src/modules/order-sync/order-merge.ts','cloud/api/src/modules/order-sync/order-sync-admission.ts',
 'cloud/api/src/modules/payments/payments.service.ts','cloud/api/src/modules/payments/order-payment-ledger.ts','cloud/api/src/modules/payments/razorpay-gateway.service.ts','cloud/api/src/modules/entity-sync/entity-sync.service.ts',
 'cloud/api/src/modules/backups/backups.service.ts','cloud/api/src/modules/backups/backup-storage.service.ts','cloud/api/src/modules/reports/reports.service.ts',
 'cloud/api/src/common/guards/device-auth.guard.ts','cloud/api/src/common/guards/platform-auth.guard.ts','cloud/api/src/common/security/branch-license.ts','cloud/api/src/prisma/prisma.service.ts','cloud/api/src/common/realtime/realtime-bus.ts','cloud/api/src/common/realtime/realtime.controller.ts',
 'cloud/api/prisma/schema.prisma','cloud/api/prisma/migrations/20261006040000_entity_recovery_sequence/migration.sql',
 'packages/database/src/durable/durable_storage.ts','packages/database/src/durable/browser_boot.ts','packages/database/src/db.ts','packages/database/src/key_value_store.ts','packages/database/src/tenant_isolation.ts','packages/sync/src/outbox.ts','packages/sync/src/device_gate.ts','packages/api/src/printer.ts',
 'apps/restaurant-system/captain/src/store/captainStore.ts','apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx','apps/restaurant-system/pos/src/store/posStore.ts','apps/restaurant-system/pos/src/components/cart/PosCart.tsx','apps/kiosk-system/kiosk-user/src/App.tsx','apps/qr-guest/src/App.tsx','apps/restaurant-system/kds/src/App.tsx',
 'apps/restaurant-system/pos/src-tauri/src/lib.rs','.github/workflows/quality-security.yml','docker-compose.yml','cloud/api/test/sync-chaos.e2e.spec.ts','apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx','packages/types/src/domain.ts'
];
const files=paths.map(file=>{const contents=text(file);return {file,sha256:crypto.createHash('sha256').update(contents).digest('hex'),lines:contents.split(/\r?\n/).length};});
const baseline={at:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/),files};
fs.writeFileSync(path.join(out,'SOURCE_SNAPSHOT.json'),JSON.stringify(baseline,null,2));
fs.writeFileSync(path.join(out,'SOURCE_INDEX.md'),'# Source evidence\n\nHEAD `'+baseline.head+'`; current file hashes and concurrent changes are recorded in [SOURCE_SNAPSHOT.json](SOURCE_SNAPSHOT.json). The route inventory does not assert exhaustive manual review.\n\n'+files.map(f=>'- ['+f.file+'](../../../'+f.file+') — '+f.lines+' lines').join('\n')+'\n');
console.log('INVENTORY',routes.length,'HTTP/SSE declarations;',files.length,'source hashes');
