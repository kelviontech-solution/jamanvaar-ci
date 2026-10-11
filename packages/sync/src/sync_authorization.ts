/** Operations requiring a currently verified person on the authoritative server. Branch Core holds no server signing secret. */
export function requiresCloudOrderAuthorization(event: { status?: unknown; paymentStatus?: unknown; meta?: unknown }): boolean {
  const status = typeof event.status === 'string' ? event.status.toUpperCase() : '';
  const payment = typeof event.paymentStatus === 'string' ? event.paymentStatus.toUpperCase() : '';
  const meta = event.meta && typeof event.meta === 'object' ? event.meta as Record<string, unknown> : {};
  return ['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'].includes(status) || payment === 'REFUNDED' || meta.statusCorrection === true || typeof meta.refundAmountPaise === 'number';
}
