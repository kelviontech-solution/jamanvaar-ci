// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { openQrCheckout } from '../apps/qr-guest/src/checkout';
import { QrApi, type Placed } from '../apps/qr-guest/src/api';
const order={publicOrderId:'JQ-opaque',orderNumber:'QR-1',status:'PENDING_PAYMENT',total:250,table:'TN1',placedAt:new Date().toISOString(),payment:{status:'PENDING',url:null,expiresAt:null,checkout:{key:'rzp_test_public',orderId:'order_server',amount:25000,currency:'INR'}}} as Placed;
let options: any;
function sdk(){window.Razorpay=class {constructor(o:any){options=o;}open(){}on(){}};}
afterEach(()=>{delete window.Razorpay;vi.restoreAllMocks();});
it('uses only the server checkout amount/order and returns pending when the guest dismisses',async()=>{
 sdk();const result=openQrCheckout(order);await Promise.resolve();await Promise.resolve();expect(options.amount).toBe(25000);expect(options.order_id).toBe('order_server');options.modal.ondismiss();expect(await result).toBe(order);
});
it('verifies through the server and handles repeated callback delivery only once',async()=>{
 sdk();const server={...order,status:'RECEIVED',paymentStatus:'SUCCESS'} as Placed;const verify=vi.spyOn(QrApi,'verifyPayment').mockResolvedValue(server);
 const result=openQrCheckout(order);await Promise.resolve();await Promise.resolve();await options.handler({razorpay_payment_id:'pay_sdk',razorpay_signature:'signed'});await options.handler({razorpay_payment_id:'pay_sdk',razorpay_signature:'signed'});
 expect(await result).toBe(server);expect(verify).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledWith(order.publicOrderId,'pay_sdk','signed');
});
it('a successful-looking SDK callback with failed server verification never becomes paid',async()=>{
 sdk();vi.spyOn(QrApi,'verifyPayment').mockRejectedValue(Error('No captured payment'));const result=openQrCheckout(order);const rejection=expect(result).rejects.toThrow('do not pay again');await Promise.resolve();await Promise.resolve();await options.handler({razorpay_payment_id:'pay_bad',razorpay_signature:'wrong'});await rejection;
});
