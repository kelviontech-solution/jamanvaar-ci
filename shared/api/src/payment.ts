import {
  PaymentInitiationRequest,
  PaymentInitiationResponse,
  PaymentMethod,
  PaymentStatus,
  PaymentVerificationResponse
} from '@jamanvaar/types';
import { generateUUID, sleep } from '@jamanvaar/utils';

export interface IPaymentGateway {
  initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse>;
  verify(transactionId: string): Promise<PaymentVerificationResponse>;
  cancel(transactionId: string): Promise<boolean>;
}

export class MockUpiPaymentGateway implements IPaymentGateway {
  async initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    const txId = `upi_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    // Format standard UPI Deep Link payload: upi://pay?pa=jamanvaar@icici&pn=JAMANVAAR&am=xxx&tr=xxx
    const upiUri = `upi://pay?pa=jamanvaar@icici&pn=JAMANVAAR+RESTAURANT&am=${req.amount.toFixed(2)}&tr=${txId}&tn=Kiosk+Order+${req.orderId}&cu=INR`;

    return {
      transactionId: txId,
      status: 'WAITING_FOR_USER',
      qrCodeData: upiUri,
      instructions: 'Scan with GPay, PhonePe, Paytm or BHIM'
    };
  }

  async verify(transactionId: string): Promise<PaymentVerificationResponse> {
    await sleep(600);
    return {
      transactionId,
      status: 'SUCCESS',
      receiptPayload: JSON.stringify({ rrn: '987654321012', authCode: 'AUTH88' })
    };
  }

  async cancel(_transactionId: string): Promise<boolean> {
    return true;
  }
}

export class MockCardPosTerminalGateway implements IPaymentGateway {
  async initiate(_req: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    const txId = `pos_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      transactionId: txId,
      status: 'WAITING_FOR_USER',
      instructions: 'Please tap, insert or swipe your card on the POS terminal'
    };
  }

  async verify(transactionId: string): Promise<PaymentVerificationResponse> {
    await sleep(800);
    return {
      transactionId,
      status: 'SUCCESS',
      receiptPayload: JSON.stringify({ cardLast4: '4242', scheme: 'VISA', approvalCode: 'AP9921' })
    };
  }

  async cancel(_transactionId: string): Promise<boolean> {
    return true;
  }
}

export class CashAtCounterGateway implements IPaymentGateway {
  async initiate(_req: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    const txId = `cash_tx_${Date.now()}`;
    return {
      transactionId: txId,
      status: 'SUCCESS',
      instructions: 'Please pay cash at Billing Counter 1 when collecting your food token'
    };
  }

  async verify(transactionId: string): Promise<PaymentVerificationResponse> {
    return {
      transactionId,
      status: 'SUCCESS'
    };
  }

  async cancel(_transactionId: string): Promise<boolean> {
    return true;
  }
}

export class PaymentService {
  private static gateways: Record<PaymentMethod, IPaymentGateway> = {
    UPI_QR: new MockUpiPaymentGateway(),
    UPI: new MockUpiPaymentGateway(),
    CARD_TERMINAL: new MockCardPosTerminalGateway(),
    CARD: new MockCardPosTerminalGateway(),
    CASH_AT_COUNTER: new CashAtCounterGateway(),
    CASH: new CashAtCounterGateway(),
    WALLET: new MockUpiPaymentGateway(),
    NET_BANKING: new MockUpiPaymentGateway(),
    SPLIT: new CashAtCounterGateway(),
    CREDIT: new CashAtCounterGateway()
  };

  public static async startPayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    const gw: IPaymentGateway = this.gateways[req.method] || this.gateways.UPI_QR;
    return await gw.initiate(req);
  }

  public static async checkPaymentStatus(method: PaymentMethod, transactionId: string): Promise<PaymentVerificationResponse> {
    const gw: IPaymentGateway = this.gateways[method] || this.gateways.UPI_QR;
    return await gw.verify(transactionId);
  }

  public static async cancelPayment(method: PaymentMethod, transactionId: string): Promise<boolean> {
    const gw: IPaymentGateway = this.gateways[method] || this.gateways.UPI_QR;
    return await gw.cancel(transactionId);
  }
}
