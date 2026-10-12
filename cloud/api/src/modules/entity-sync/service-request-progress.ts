import { z } from 'zod';
const call = z.object({id: z.string().min(1).max(128),kind:z.literal('CALL_STAFF'),recipient:z.enum(['COUNTER','POS','MANAGER','CAPTAIN','ALL']),senderName:z.string().max(160),presetText:z.string().max(2000),customNote:z.string().max(2000).optional(),tableNumber:z.string().max(100).optional(),createdAt:z.string().datetime(),branchId:z.string().max(128).optional(),status:z.enum(['SENT','ACCEPTED','RESOLVED']).optional(),updatedAt:z.string().datetime().optional()}).passthrough();
export function serviceRequestProgress(incoming: Record<string, unknown>, previous: Record<string, unknown> | null, externalId: string, deviceId?: string, deviceType?: string) {
  if (incoming.kind !== 'CALL_STAFF' && previous?.kind !== 'CALL_STAFF') {
    if (deviceType === 'KIOSK') throw new Error('A guest kiosk can only request staff assistance');
    return incoming;
  }
  const value = call.parse(incoming);
  if (value.id !== externalId) throw new Error('Service request identity mismatch');
  const status = value.status || 'SENT';
  if (!previous) {
    if (status !== 'SENT') throw new Error('A request must be sent before acknowledgement');
    return {...value,status:'SENT',requesterDeviceId:deviceId,updatedAt:new Date().toISOString()};
  }
  if (deviceType === 'KIOSK') {
    if (previous.requesterDeviceId !== deviceId || status !== 'SENT') throw new Error('Guests cannot acknowledge service requests');
    return previous; // Lost response retries cannot reset staff acknowledgement.
  }
  if (!['POS','POS_ADMIN','KIOSK_ADMIN','CAPTAIN'].includes(deviceType || '')) throw new Error('Only service staff can acknowledge a request');
  const rank = {SENT:0,ACCEPTED:1,RESOLVED:2};
  const before = previous.status === 'RESOLVED' ? 'RESOLVED' : previous.status === 'ACCEPTED' ? 'ACCEPTED' : 'SENT';
  if (rank[status] <= rank[before]) return previous;
  if (status === 'RESOLVED' && before !== 'ACCEPTED') throw new Error('Accept this request before completing it');
  return {...previous,status,updatedAt:new Date().toISOString(),[status === 'ACCEPTED' ? 'acceptedByDeviceId' : 'resolvedByDeviceId']:deviceId};
}
