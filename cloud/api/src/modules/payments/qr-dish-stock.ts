import { ConflictException } from '@nestjs/common';
import { Prisma, SyncedOrder } from '@prisma/client';
type Tx=Prisma.TransactionClient;
type Allocation={entityId:string;quantity:number;itemId:string};
/** Counted dishes reuse MENU_ITEM / BRANCH_MENU_OVERRIDE. Ingredient movements stay in the existing inventory ledger. */
export async function reserveQrDishStock(tx:Tx,restaurantId:string,branchId:string,externalOrderId:string,lines:Array<{itemId:string;quantity:number}>) {
 const quantityByItem=new Map<string,number>();for(const line of lines)quantityByItem.set(line.itemId,(quantityByItem.get(line.itemId)??0)+line.quantity);
 const allocations:Allocation[]=[],consumed:Record<string,number>={};
 for(const [itemId,quantity] of quantityByItem){
   const base=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId,entityType:'MENU_ITEM',externalId:itemId}}});
   const override=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId,entityType:'BRANCH_MENU_OVERRIDE',externalId:branchId+':'+itemId}}});
   const target=typeof (override?.payload as any)?.stockQuantity==='number'?override:base,p=target?.payload as Record<string,any>;
   if(!target||typeof p?.stockQuantity!=='number')continue;
   if(!Number.isSafeInteger(p.stockQuantity)||p.stockQuantity<quantity)throw new ConflictException({code:'ITEM_UNAVAILABLE',message:'There are not enough portions of a selected dish. Please review your cart.'});
   await tx.syncedEntity.update({where:{id:target.id},data:{payload:{...p,stockQuantity:p.stockQuantity-quantity,updatedAt:new Date().toISOString()},syncVersion:{increment:1}}});
   if(override===target&&base)await tx.syncedEntity.update({where:{id:base.id},data:{syncVersion:{increment:1}}});
   allocations.push({entityId:target.id,itemId,quantity});
   lines.forEach((line,index)=>{if(line.itemId===itemId)consumed[itemId+':'+index]=line.quantity;});
 }
 if(allocations.length)await tx.syncedEntity.create({data:{restaurantId,entityType:'QR_DISH_STOCK_ALLOCATION',externalId:externalOrderId,payload:{branchId,state:'RESERVED',allocations,at:new Date().toISOString()}}});
 return consumed;
}
/** Financial/kitchen retries cannot reserve or restore the same counted portions twice. */
export async function reconcileQrDishStock(tx:Tx,order:SyncedOrder){
 if(order.source!=='QR'||!['CANCELLED','VOID','VOIDED','REFUNDED'].includes(order.status))return;
 const row=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId:order.restaurantId,entityType:'QR_DISH_STOCK_ALLOCATION',externalId:order.externalOrderId}}});
 const p=row?.payload as any;if(!row||p.state==='RESTORED')return;
 for(const allocation of p.allocations as Allocation[]){const item=await tx.syncedEntity.findFirst({where:{id:allocation.entityId,restaurantId:order.restaurantId}});const stock=item?.payload as any;if(!item||typeof stock.stockQuantity!=='number')continue;await tx.syncedEntity.update({where:{id:item.id},data:{payload:{...stock,stockQuantity:stock.stockQuantity+allocation.quantity,updatedAt:new Date().toISOString()},syncVersion:{increment:1}}});if(item.entityType==='BRANCH_MENU_OVERRIDE'){const base=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId:order.restaurantId,entityType:'MENU_ITEM',externalId:allocation.itemId}}});if(base)await tx.syncedEntity.update({where:{id:base.id},data:{syncVersion:{increment:1}}});}}
 await tx.syncedEntity.update({where:{id:row.id},data:{payload:{...p,state:'RESTORED',restoredAt:new Date().toISOString()},syncVersion:{increment:1}}});
}
