export * from '/apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts?original';
export async function cloudQrAccount(){return{role:'OWNER',branchId:'branch-a',restaurantId:'restaurant-a'};}
export async function fetchCloudBranches(){return structuredClone(window.__experience.branches);}
export async function fetchSupportTickets(){return [];}
export function isCloudConnected(){return true;}
export function isCloudLoggedIn(){return true;}
export async function fetchMenuDraftStatus(){return{publishedVersion:1,hasUnpublishedChanges:false,errors:[],warnings:[]};}
export async function fetchLaunchAcceptance(){return{verified:false,record:null};}
export async function qrApi(url,init={}){
 const f=window.__experience,p=new URL(url,location.origin).pathname,body=typeof init.body==='string'?JSON.parse(init.body):init.body;
 const base='/api/v1/restaurant/qr', now=new Date().toISOString();
 const entitlement={enabled:true,source:'PLAN',limits:{},planName:'QR Engage',validUntil:null};
 if(p.endsWith('/ai-config'))return{state:'OFF'};
 if(p.endsWith('/entitlement'))return entitlement;
 if(p.endsWith('/branches'))return structuredClone(f.branches);
 if(p.endsWith('/qr-page/launch'))return{pageEnabled:!!f.page.published?.enabled,health:{checks:[],scope:'Main Dining'},testCurrent:false,currentPublication:f.page.publishedAt,branchRequired:true,recentOrders:[]};
 if(p.endsWith('/qr-page/engagement'))return{counts:{},description:'Website activity'};
 if(p.endsWith('/qr-page/publish')){if(f.failPublish)throw Error('Connection interrupted. Your website was not published.');if(body.version!==f.page.version)throw Error('Draft version changed');f.page.published=structuredClone(f.page.draft);f.page.publishedAt=now;f.page.version++;f.publishes++;f.page.shareUrl=location.origin+'/q/site/riverhouse-fixture';f.page.sharePath='/q/site/riverhouse-fixture';return structuredClone(f.page);}
 if(p.endsWith('/qr-page')){if(init.method==='PUT'){f.page.draft=structuredClone(body.content);f.page.version++;f.saves++;}return structuredClone(f.page);}
 if(p.endsWith('/qr-page/print-design'))return{version:1,design:{template:'website',accent:'#A84816',instruction:'Scan to visit our restaurant',footer:'Menu · Story · Contact',showLogo:true,layout:'CARD'}};
 if(p.endsWith('/qr-page/print-data')){if(!f.page.published?.enabled)throw Error('Publish your website first');return{restaurantName:'River House Kitchen',branchName:'Main Dining',tableLabel:'VISIT OUR WEBSITE',tagline:'Menu · Story · Contact',url:f.page.shareUrl,design:{template:'website',accent:'#A84816',instruction:'Scan to visit our restaurant',footer:'Menu · Story · Contact',showLogo:true,layout:'CARD'}};}
 if(p.endsWith('/overview'))return{entitlement,tables:2,activeTables:2,codesGenerated:2,activeCodes:2,publicBaseUrlConfigured:true,today:{scans:12,menuViews:10,ordersPlaced:4,ordersPending:0,ordersCompleted:4,failedAttempts:0,sales:900,paidSales:900,averageOrderValue:225,ordersByTable:[]}};
 if(p.endsWith('/order-list'))return{rows:[],total:0,nextCursor:null};
 if(p.endsWith('/orders')||p.endsWith('/reservations'))return [];
 if(p.endsWith('/tables'))return[1,2].map(n=>({tableId:'table-'+n,displayNumber:String(n),branchId:'branch-a',branchName:'Main Dining',capacity:4,isActive:true,qr:{id:'code-'+n,status:'ACTIVE',url:location.origin+'/q/fixture-table-token',version:1}}));
 if(p.endsWith('/menu-codes'))return{rows:[],total:0,nextCursor:null,menuOnlyEnabled:true,publicBaseUrlConfigured:true};
 if(p.includes('/codes/')&&p.endsWith('/print-data'))return{restaurantName:'River House Kitchen',branchName:'Main Dining',tableLabel:'Table 1',tagline:'Scan to order',url:location.origin+'/q/fixture-table-token'};
 if(p.endsWith('/print-design'))return{template:'minimal',accent:'#A84816',instruction:'Scan to order',footer:'Freshly made for you',showLogo:true,layout:'CARD'};
 if(p.includes('/entity-sync/')){const type=p.split('/').pop(),rows=type==='MENU_ITEM'?f.items:type==='MENU_CATEGORY'?f.categories:[];return{entities:rows.map(row=>({externalId:row.id,payload:row})),hasMore:false,latestSeq:1};}
 if(p.endsWith('/menu/preview'))return{items:f.items,categories:f.categories,hidden:[]};
 if(p.endsWith('/menu-status'))return{branchId:'branch-a',branchName:'Main Dining',checkedAt:now,publishedAt:now,publishedVersion:1,counts:{draft:3,live:3,afterPublish:3},review:{checksum:'fixture',publishedVersion:1,hasUnpublishedChanges:false,errors:[],warnings:[],changes:{added:[],updated:[],removed:[],optionGroups:[]}},notices:[],rows:f.items.map(i=>({...i,livePrice:i.price,state:'LIVE',live:true,afterPublishVisible:true,reason:'',afterPublishReason:'',canRestoreBranchPause:false})),liveItems:f.items,removedSinceDraft:[]};
 if(p.endsWith('/draft-status'))return{publishedVersion:1,publishedAt:now,hasUnpublishedChanges:false};
 if(p.endsWith('/settings'))return{allowCustomerNotes:true,allowModifiers:true,allowCash:true,allowOnlinePayment:false,showOrderStatus:true,requireCustomerName:false,requireCustomerPhone:false,rules:{hours:[],pausedUntil:null,minimumOrderPaise:0,preparationMinutes:20,maxPendingOrders:0,maxOrdersPerWindow:0,windowMinutes:5,customerInstructions:'',paymentInstructions:'',orderingModes:['DINE_IN','TAKEAWAY']}};
 if(p.endsWith('/payment-readiness'))return{available:true,enabled:true,guestAvailable:true,planAllowed:true,commissionBps:200};
 if(p.endsWith('/branding'))return{welcomeTitle:'River House Kitchen',welcomeMessage:'Welcome to our kitchen',footerMessage:'Thank you',orderButtonLabel:'Order now',accentColor:'#A84816',logoUrl:'',coverUrl:'',backgroundColor:'#faf5eb',layout:'CARDS',contactMessage:''};
 if(p.endsWith('/operations/requests'))return{requests:[],quietNow:false};
 if(p.endsWith('/operations/health'))return{ready:true,completed:6,total:6,checks:[],scope:'Main Dining'};
 if(p.endsWith('/operations/attention'))return{scope:'branch-a',checkedAt:now,serviceAvailable:true,total:0,urgent:0,servicePending:0,items:[]};
 if(p.endsWith('/operations/analytics'))return{items:[],byCategory:[],byHour:[],byMode:[],requestCounts:{},trend:[],funnel:{menuViews:10,ordersPlaced:4},conversion:{percent:40,denominator:10},costCoverage:{message:'No cost data yet'},definitions:'Confirmed order activity',dateBasis:'Restaurant time'};
 if(p.endsWith('/operations'))return{version:1,settings:{serviceEnabled:true,requestTypes:[{id:'WAITER',label:'Call waiter',enabled:true}],quietHours:[],pickupEnabled:true,asapEnabled:true,pickupHours:[],closedDates:[],pickupInstructions:'Collect at counter',slotMinutes:30,capacityPerSlot:10,minimumLeadMinutes:20,maximumDaysAhead:7,overdueMinutes:5,expireMinutes:120,tableCooldownSeconds:60},capabilities:{capabilities:f.capabilities}};
 if(p.endsWith('/advanced')){if(init.method==='PUT'){Object.assign(f.settings,body.changes);f.writes.push(body);}return{version:1+f.writes.length,settings:f.settings,capabilities:f.capabilities,overrideKeys:[],module:{planName:'QR Engage',limits:{}},usage:{activeCodes:2,activeBranches:1},identity:{reason:'OK'}};}
 if(p.endsWith('/advanced/feedback'))return{feedback:[],total:0,distribution:[],average:null};
 if(p.endsWith('/advanced/notifications'))return{enabled:true,alerts:[],quiet:false};
 if(p.endsWith('/advanced/promotions'))return [];
 if(p.endsWith('/advanced/stock'))return{branchId:'branch-a',items:f.items.map(i=>({itemId:i.id,name:i.name,stockQuantity:null,source:'MANUAL'}))};
 if(p.endsWith('/crm/program'))return{canManageProgram:true,qrChannelEnabled:true,phoneVerificationReady:true,program:{version:1,enabled:true,earnPoints:10,perRupeesSpent:100},rewards:[]};
 if(p.endsWith('/crm'))return{rows:[],total:0,nextCursor:null};
 if(p.endsWith('/receipts'))return{scope:'branch-a',version:1,design:{heading:'Your bill',thankYou:'Thank you for dining with us',footer:'Visit again',contact:'',accent:'#A84816',showTaxBreakup:true,showCustomer:true,showNotes:true}};
 if(p.endsWith('/workflows/payment-acceptance'))return{health:{checks:[]},version:1,record:null,verifiedOrders:[]};
 if(p.endsWith('/workflows/reconciliation'))return{timezone:'Asia/Kolkata',from:now,to:now,collectedPaise:0,refundedPaise:0,netPaise:0,groups:[],entries:[],nextCursor:null};
 if(p.endsWith('/workflows/pickup-calendar'))return{timezone:'Asia/Kolkata',enabled:true,capacity:10,slots:[],orders:[]};
 if(p.endsWith('/workflows/print-inventory'))return{codes:[]};
 if(p.endsWith('/analytics'))return{timezone:'Asia/Kolkata',from:now,to:now,metrics:new Proxy({},{get:()=>0}),byCode:[],byBranch:[],trend:[],popular:[],payments:[]};
 if(p.endsWith('/tenant/operations/context'))return{viewerId:'owner',restaurant:{name:'River House Kitchen',currency:'INR'},branch:{id:'branch-a',name:'Main Dining',timezone:'Asia/Kolkata'},apps:['QR_ORDERING'],role:'OWNER',menuVersion:1,publishedDishes:3,devices:[],orders:[],generatedAt:now};
 f.unexpected.push(url);throw Error('Unexpected fixture request '+url);
}
export const request=qrApi;
