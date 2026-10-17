// Execute the existing report engine against a small in-memory dataset, without database writes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../../..');
const entry=path.join(root,'apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine.ts');
const mockDb={menuItems:[{id:'pizza',name:'Pizza',kitchenStation:'Pizza Oven'}],kots:[{orderId:'test-order',station:'Pizza Oven',createdAt:'2026-10-16T10:00:00Z',readyAt:'2026-10-16T10:10:00Z'}]};
const m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(path.dirname(entry));const original=m.require.bind(m);
m.require=id=>id==='@jamanvaar/database'?{db:mockDb,isUnpaidOpenOrder:()=>false}:id==='@jamanvaar/utils'?{formatDate:d=>String(d)}:original(id);
m._compile(esbuild.transformSync(fs.readFileSync(entry,'utf8'),{loader:'ts',format:'cjs'}).code,entry);
const output=m.exports.ReportDataEngine.getStationPerformance([{id:'test-order',orderStatus:'COMPLETED',items:[{menuItemId:'pizza',name:'Pizza',quantity:2}]}]);
const station={test:'Configured Pizza Oven station omitted from kitchen station performance',stationNames:output.map(r=>r.stationName),customStationPresent:output.some(r=>r.stationName==='Pizza Oven'),totalItemsCounted:output.reduce((s,r)=>s+r.itemsCount,0),actualItems:2};
const OriginalDate=Date,previousTZ=process.env.TZ;process.env.TZ='UTC';
mockDb.restaurant={timezone:'Asia/Kolkata',businessDayCutoffHour:0};
global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-10-16T10:00:00Z']));}};
const range=m.exports.ReportDataEngine.getDateRange('TODAY');global.Date=OriginalDate;if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ;
const results={station,dateRange:{test:'Reports Today uses device midnight rather than configured restaurant timezone',deviceTimezone:'UTC',restaurantTimezone:'Asia/Kolkata',cutoffHour:0,actualStart:range.startDate.toISOString(),expectedRestaurantMidnight:'2026-10-15T18:30:00.000Z'}};
fs.writeFileSync(path.join(__dirname,'evidence/SOURCE_PROBES.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
