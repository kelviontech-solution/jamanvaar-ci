const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const entries=[
 ['apps/restaurant-system/pos/src/components/menu/PosProductCard.tsx',['hasRequiredModifiers','handleCardClick']],
 ['apps/restaurant-system/pos/src/components/menu/CashierSpeedBar.tsx',['setCustomizingItem']],
 ['apps/restaurant-system/pos/src/store/posStore.ts',['setOrderNotes: (','recallHeldOrder: (','deliveryStatus: \'SENT\'','loadOrderForSettlement: (','recoverDraftSession: ()']],
 ['apps/restaurant-system/pos/src/services/recoveryService.ts',['saveDraft','const draft:']],
 ['apps/restaurant-system/pos/src/components/cart/PosOrderNotesModal.tsx',['const [customText']],
 ['apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx',['const handleSettleOrder','const isUnconfirmedKioskUpi','fall through to manual settlement','loadOrderForSettlement']],
 ['apps/restaurant-system/pos/src/components/layout/PosHeader.tsx',['loadOrderForSettlement']],
 ['apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx',['const handleDirectChannelAmountChange','const secondary =','Confirm and settle payment']],
 ['apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx',['hasInteracted','}, 6000)']],
 ['packages/ui/src/ThermalReceiptView.tsx',['Self-Order Kiosk','POS: ${']],
 ['packages/api/src/printer.ts',['Self-Order Kiosk']],
 ['apps/kiosk-system/kiosk-user/src/App.tsx',['const handleSelectItem','const addToCartDirect','totalAmount: result.amount','setAppliedCoupon(null); setRedeemedPoints','No SMS gateway configured','Enter coupon code','Math.min(loggedInAccount.loyaltyPoints','Kitchen tickets']],
 ['apps/qr-guest/src/App.tsx',['sessionStorage.getItem','recommendationIds.map','function useQuote','function Checkout','MENU_CHANGED','Payment due at counter:']],
 ['apps/qr-guest/src/cart.ts',['MAX_LINE_QUANTITY','export function addLine']],
 ['apps/qr-guest/src/Operations.tsx',['.catch(() => {})','if (!options?.serviceEnabled) return null']],
 ['apps/qr-guest/src/paymentProgress.ts',['CANCELLED']],
 ['apps/qr-guest/src/api.ts',['sessionStorage.getItem','function imageSrc']]
];
const records=entries.map(([file,anchors])=>{const raw=fs.readFileSync(path.join(root,file));const lines=raw.toString().split(/\r?\n/);return {file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),anchors:anchors.map(anchor=>({anchor,line:lines.findIndex(l=>l.includes(anchor))+1})).filter(a=>a.line>0)};});
const snapshot={at:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTree:'Dirty; existing application changes were preserved. This audit adds scripts and documentation only.',files:records};
fs.writeFileSync(path.join(__dirname,'SOURCE_SNAPSHOT.json'),JSON.stringify(snapshot,null,2));
fs.writeFileSync(path.join(__dirname,'SOURCE_INDEX.md'),'# Source evidence\n\nCaptured '+snapshot.at+' against HEAD `'+snapshot.head+'` plus the existing dirty working tree. SHA-256 hashes are in [SOURCE_SNAPSHOT.json](SOURCE_SNAPSHOT.json). Browser evidence uses the locally built working tree; this is not a clean-commit or production acceptance claim.\n\n'+records.map(r=>'## '+r.file+'\n\n'+r.anchors.map(a=>'- [`'+a.anchor+'` — line '+a.line+'](../../../'+r.file+'#L'+a.line+')').join('\n')).join('\n\n')+'\n');
console.log('SOURCE_SNAPSHOT',records.length,'files');
