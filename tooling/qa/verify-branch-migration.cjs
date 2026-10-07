const fs=require('node:fs'),p=require('node:path'),{Client}=require('pg');
const root=p.resolve(__dirname,'../..'),s=JSON.parse(fs.readFileSync(p.join(root,'.jamanvaar/browser-audit/private-state.json')));
if(!/test/i.test(new URL(s.databaseUrl).pathname))throw Error('Dedicated test database required');
const u=new URL(s.databaseUrl);for(const k of ['schema','connection_limit','pool_timeout'])u.searchParams.delete(k);
const client=new Client({connectionString:u.toString()});
(async()=>{await client.connect();await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE "Branch" ("restaurantId" text NOT NULL,id text PRIMARY KEY)');
  for(const name of ['Device','User','ActivationKey','SyncedOrder','Order','QrCode','QrSettings','InventoryMovement'])await client.query(`CREATE TEMP TABLE "${name}" ("restaurantId" text NOT NULL,"branchId" text)`);
  await client.query(fs.readFileSync(p.join(root,'cloud/api/prisma/migrations/20261007160000_branch_membership_constraints/migration.sql'),'utf8'));
  await client.query(`INSERT INTO "Branch" VALUES ('A','a'),('B','b')`);
  for(const name of ['Device','User','ActivationKey','SyncedOrder','Order','QrCode','QrSettings','InventoryMovement']){
    await client.query('SAVEPOINT check_membership');await client.query(`INSERT INTO "${name}" VALUES ('A','a'),('A',null)`);await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('SET CONSTRAINTS ALL DEFERRED');await client.query('RELEASE SAVEPOINT check_membership');
    await client.query('SAVEPOINT check_membership');let denied=false;try{await client.query(`INSERT INTO "${name}" VALUES ('A','b')`);await client.query('SET CONSTRAINTS ALL IMMEDIATE');}catch(e){if(e.code!=='23503')throw e;denied=true;}await client.query('ROLLBACK TO SAVEPOINT check_membership');if(!denied)throw Error(name+' accepted a foreign branch');
    console.log('PASS '+name+': valid/null branch accepted; foreign tenant branch rejected');
  }
  await client.query('ROLLBACK');console.log('Migration verified on transaction-local temporary tables; application data unchanged.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>client.end());
