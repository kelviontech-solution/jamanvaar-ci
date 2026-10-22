import { describe, expect, it } from 'vitest';
import { qrLoyaltyReadiness, type LoyaltySetupConfig } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/qrLoyaltyReadiness';
const now = Date.parse('2026-10-22T12:00:00Z');
const reward = { id:'reward-a', name:'Dinner reward', isActive:true, pointsCost:150, discountAmount:50, discountKind:'FIXED' };
const config: LoyaltySetupConfig = { qrChannelEnabled:true, phoneVerificationReady:true, program:{ enabled:true, earnPoints:10, perRupeesSpent:100 }, rewards:[reward] };
describe('QR customer program readiness', () => {
  it('distinguishes working login and earning from missing rewards', () => {
    expect(qrLoyaltyReadiness({...config,rewards:[]},now)).toMatchObject({loginReady:true,earningReady:true,rewardsReady:false});
  });
  it('rejects inactive, expired, malformed and deleted rewards', () => {
    const rewards = [{...reward,isActive:false},{...reward,expiresAt:'2026-10-21T12:00:00Z'},{...reward,expiresAt:'invalid'},{...reward,pointsCost:0},{...reward,discountAmount:0},{...reward,deleted:true}];
    expect(qrLoyaltyReadiness({...config,rewards},now)).toMatchObject({rewardsReady:false,activeRewards:[]});
  });
  it('recognizes existing item rewards that checkout supports', () => {
    expect(qrLoyaltyReadiness({...config,rewards:[{...reward,discountKind:'ITEM'}]},now).rewardsReady).toBe(true);
  });
  it('treats exact expiry as expired and future expiry as available', () => {
    expect(qrLoyaltyReadiness({...config,rewards:[{...reward,expiresAt:new Date(now).toISOString()}]},now).rewardsReady).toBe(false);
    expect(qrLoyaltyReadiness({...config,rewards:[{...reward,expiresAt:new Date(now+1000).toISOString()}]},now).rewardsReady).toBe(true);
  });
  it('does not declare earning ready when the program is paused or has no earning rate', () => {
    expect(qrLoyaltyReadiness({...config,program:{...config.program,enabled:false}},now)).toMatchObject({loginReady:true,earningReady:false,rewardsReady:false});
    expect(qrLoyaltyReadiness({...config,program:{...config.program,earnPoints:0}},now)).toMatchObject({earningReady:false,rewardsReady:true});
  });
  it('requires both branch access and phone delivery, while preserving configured rules', () => {
    for(const override of [{qrChannelEnabled:false},{phoneVerificationReady:false}])expect(qrLoyaltyReadiness({...config,...override},now)).toMatchObject({loginReady:false,earningRuleReady:true,earningReady:false,rewardsReady:false});
  });
  it('declares ready only when a usable reward, earning rule and login all exist', () => {
    expect(qrLoyaltyReadiness(config,now)).toMatchObject({loginReady:true,earningReady:true,rewardsReady:true,activeRewards:[reward]});
  });
});
