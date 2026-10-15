import {describe,it,expect} from 'vitest';
import {estimateWait} from './wait-estimate';
describe('preparation estimates',()=>{
 it('labels sparse history as a configured estimate',()=>expect(estimateWait([],[],12)).toMatchObject({estimateMinutes:12,sampleCount:0,basis:'CONFIGURED_PREPARATION_TIME'}));
 it('uses real preparation history and excludes implausible times',()=>{const createdAt=new Date('2026-10-15T10:00:00Z');const samples=[5,10,15,20,25,10000].map(minutes=>({createdAt,items:[],meta:{operationHistory:[{status:'READY',at:new Date(createdAt.getTime()+minutes*60000).toISOString()}]}}));expect(estimateWait([],samples,12)).toMatchObject({sampleCount:5,estimateMinutes:20,basis:'RECENT_PREPARATION_HISTORY'});});
 it('increases an estimate for backlog and excludes completed orders',()=>{const active=Array.from({length:6},()=>({status:'PREPARING',items:[{quantity:2,kitchenStatus:'COOKING'}]}));expect(estimateWait([...active,{status:'COMPLETED',items:[]}],[],10)).toMatchObject({estimateMinutes:30,backlogOrders:6,backlogUnits:12});});
});
