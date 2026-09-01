import { Cart, MenuItem, Order, SelectedModifier } from './domain';
import { OrderType, PaymentMethod } from './enums';

export interface CreateOrderRequest {
  idempotencyKey: string;
  kioskId: string;
  sessionId: string;
  orderType: OrderType;
  tableId?: string;
  tableNumber?: string;
  guestCount?: number;
  customerPhone?: string;
  customerName?: string;
  cart: Cart;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order: Order;
  tokenNumber: string;
  estimatedWaitMinutes: number;
  qrReceiptUrl?: string;
  message?: string;
}

export interface PaymentInitiationRequest {
  idempotencyKey: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
}

export interface PaymentInitiationResponse {
  transactionId: string;
  status: 'WAITING_FOR_USER' | 'PROCESSING' | 'SUCCESS';
  qrCodeData?: string;
  instructions?: string;
}

export interface PaymentVerificationResponse {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED';
  receiptPayload?: string;
}

export interface ApplyCouponRequest {
  code: string;
  cartSubtotal: number;
  customerPhone?: string;
}

export interface ApplyCouponResponse {
  isValid: boolean;
  discountAmount: number;
  message?: string;
}
