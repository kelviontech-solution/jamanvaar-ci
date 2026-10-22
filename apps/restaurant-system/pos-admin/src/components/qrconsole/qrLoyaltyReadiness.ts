export interface LoyaltySetupConfig {
  qrChannelEnabled: boolean;
  phoneVerificationReady: boolean;
  program: { enabled: boolean; earnPoints: number; perRupeesSpent: number };
  rewards: Array<{ id?: string; name: string; pointsCost: number; discountAmount: number; discountKind?: string; isActive: boolean; expiresAt?: string | null; deleted?: boolean }>;
}
export function qrLoyaltyReadiness(config: LoyaltySetupConfig, now = Date.now()) {
  const loginReady = config.qrChannelEnabled && config.phoneVerificationReady;
  const earningRuleReady = config.program.enabled && Number.isSafeInteger(config.program.earnPoints) && config.program.earnPoints > 0 && Number.isFinite(config.program.perRupeesSpent) && config.program.perRupeesSpent > 0;
  const activeRewards = config.rewards.filter(reward => reward.isActive && !reward.deleted && Number.isSafeInteger(reward.pointsCost) && reward.pointsCost > 0 && Number.isFinite(reward.discountAmount) && reward.discountAmount > 0 && (!reward.expiresAt || Date.parse(reward.expiresAt) > now));
  const earningReady = loginReady && earningRuleReady;
  return { loginReady, earningRuleReady, earningReady, rewardsReady: loginReady && config.program.enabled && activeRewards.length > 0, activeRewards };
}
