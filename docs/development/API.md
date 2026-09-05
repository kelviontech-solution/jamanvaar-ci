# JAMANVAAR API & Hardware Abstraction Layer (HAL)

## 1. Hardware Abstraction Architecture

To allow zero-downtime hardware replacements across different restaurant franchises, all peripheral interactions are abstracted behind modular service contracts.

```
┌─────────────────────────────────────────────────────────────┐
│                 APPLICATION LOGIC & UI                     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│      PaymentService         │ │       PrinterService        │
│ ┌─────────────────────────┐ │ │ ┌─────────────────────────┐ │
│ │  MockUpiPaymentGateway  │ │ │ │   ESC/POS Thermal Core  │ │
│ ├─────────────────────────┤ │ │ ├─────────────────────────┤ │
│ │  CardPosTerminalGateway │ │ │ │   Digital / QR Receipt  │ │
│ ├─────────────────────────┤ │ │ └─────────────────────────┘ │
│ │  CashAtCounterGateway   │ │ └─────────────────────────────┘
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## 2. Service Contracts

### `PaymentService`
Manages multi-gateway payment state machines with timeout handling and duplicate transaction guards.

```typescript
export interface IPaymentGateway {
  initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse>;
  verify(transactionId: string): Promise<PaymentVerificationResponse>;
  cancel(transactionId: string): Promise<boolean>;
}
```

#### UPI Dynamic QR Payload:
Formats compliant NPCI / UPI deep links:
`upi://pay?pa=jamanvaar@icici&pn=JAMANVAAR+RESTAURANT&am=719.00&tr=upi_tx_123&cu=INR`

---

### `PrinterService`
Formats standard 80mm ESC/POS direct thermal print jobs containing:
- Official restaurant header and GSTIN
- Large token number (`#101`)
- Table number / Order type
- Itemized lines with modifier breakdown and custom kitchen notes
- GST 5% tax breakdown (CGST 2.5% + SGST 2.5%) and round-off
- Auto-cutter triggers

---

### `KdsMeshService`
Pub/Sub realtime event mesh synchronizing orders between customer kiosks, admin control planes, and kitchen stations:
- `broadcastOrderCreated(order)`: Emitted when customer completes checkout.
- `advanceKitchenStatus(orderId, nextStatus)`: Advances KOT to `PREPARING` → `READY` → `COLLECTED`.
- `subscribeToOrders(callback)`: Real-time listener for status reflections.
