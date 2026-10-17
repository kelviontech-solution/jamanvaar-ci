# Source evidence

Captured 2026-10-17T06:31:02.009Z against HEAD `1fbe9342ffb31a9dbc61275ca65341bb0950fcb8` plus the existing dirty working tree. SHA-256 hashes are in [SOURCE_SNAPSHOT.json](SOURCE_SNAPSHOT.json). Browser evidence uses the locally built working tree; this is not a clean-commit or production acceptance claim.

## apps/restaurant-system/pos/src/components/menu/PosProductCard.tsx

- [`hasRequiredModifiers` — line 24](../../../apps/restaurant-system/pos/src/components/menu/PosProductCard.tsx#L24)
- [`handleCardClick` — line 30](../../../apps/restaurant-system/pos/src/components/menu/PosProductCard.tsx#L30)

## apps/restaurant-system/pos/src/components/menu/CashierSpeedBar.tsx

- [`setCustomizingItem` — line 11](../../../apps/restaurant-system/pos/src/components/menu/CashierSpeedBar.tsx#L11)

## apps/restaurant-system/pos/src/store/posStore.ts

- [`setOrderNotes: (` — line 141](../../../apps/restaurant-system/pos/src/store/posStore.ts#L141)
- [`recallHeldOrder: (` — line 181](../../../apps/restaurant-system/pos/src/store/posStore.ts#L181)
- [`deliveryStatus: 'SENT'` — line 1306](../../../apps/restaurant-system/pos/src/store/posStore.ts#L1306)
- [`loadOrderForSettlement: (` — line 225](../../../apps/restaurant-system/pos/src/store/posStore.ts#L225)
- [`recoverDraftSession: ()` — line 227](../../../apps/restaurant-system/pos/src/store/posStore.ts#L227)

## apps/restaurant-system/pos/src/services/recoveryService.ts

- [`saveDraft` — line 10](../../../apps/restaurant-system/pos/src/services/recoveryService.ts#L10)
- [`const draft:` — line 32](../../../apps/restaurant-system/pos/src/services/recoveryService.ts#L32)

## apps/restaurant-system/pos/src/components/cart/PosOrderNotesModal.tsx

- [`const [customText` — line 26](../../../apps/restaurant-system/pos/src/components/cart/PosOrderNotesModal.tsx#L26)

## apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx

- [`const handleSettleOrder` — line 94](../../../apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx#L94)
- [`const isUnconfirmedKioskUpi` — line 103](../../../apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx#L103)
- [`fall through to manual settlement` — line 124](../../../apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx#L124)
- [`loadOrderForSettlement` — line 131](../../../apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx#L131)

## apps/restaurant-system/pos/src/components/layout/PosHeader.tsx

- [`loadOrderForSettlement` — line 292](../../../apps/restaurant-system/pos/src/components/layout/PosHeader.tsx#L292)

## apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx

- [`const handleDirectChannelAmountChange` — line 278](../../../apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx#L278)
- [`const secondary =` — line 284](../../../apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx#L284)
- [`Confirm and settle payment` — line 1212](../../../apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx#L1212)

## apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx

- [`hasInteracted` — line 28](../../../apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx#L28)
- [`}, 6000)` — line 39](../../../apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx#L39)

## packages/ui/src/ThermalReceiptView.tsx

- [`Self-Order Kiosk` — line 25](../../../packages/ui/src/ThermalReceiptView.tsx#L25)
- [`POS: ${` — line 197](../../../packages/ui/src/ThermalReceiptView.tsx#L197)

## packages/api/src/printer.ts

- [`Self-Order Kiosk` — line 13](../../../packages/api/src/printer.ts#L13)

## apps/kiosk-system/kiosk-user/src/App.tsx

- [`const handleSelectItem` — line 1048](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L1048)
- [`const addToCartDirect` — line 1064](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L1064)
- [`totalAmount: result.amount` — line 1379](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L1379)
- [`setAppliedCoupon(null); setRedeemedPoints` — line 1389](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L1389)
- [`No SMS gateway configured` — line 1866](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L1866)
- [`Enter coupon code` — line 3053](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L3053)
- [`Math.min(loggedInAccount.loyaltyPoints` — line 3093](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L3093)
- [`Kitchen tickets` — line 3442](../../../apps/kiosk-system/kiosk-user/src/App.tsx#L3442)

## apps/qr-guest/src/App.tsx

- [`sessionStorage.getItem` — line 50](../../../apps/qr-guest/src/App.tsx#L50)
- [`recommendationIds.map` — line 313](../../../apps/qr-guest/src/App.tsx#L313)
- [`function useQuote` — line 412](../../../apps/qr-guest/src/App.tsx#L412)
- [`function Checkout` — line 473](../../../apps/qr-guest/src/App.tsx#L473)
- [`MENU_CHANGED` — line 517](../../../apps/qr-guest/src/App.tsx#L517)
- [`Payment due at counter:` — line 620](../../../apps/qr-guest/src/App.tsx#L620)

## apps/qr-guest/src/cart.ts

- [`MAX_LINE_QUANTITY` — line 25](../../../apps/qr-guest/src/cart.ts#L25)
- [`export function addLine` — line 37](../../../apps/qr-guest/src/cart.ts#L37)

## apps/qr-guest/src/Operations.tsx

- [`.catch(() => {})` — line 22](../../../apps/qr-guest/src/Operations.tsx#L22)
- [`if (!options?.serviceEnabled) return null` — line 65](../../../apps/qr-guest/src/Operations.tsx#L65)

## apps/qr-guest/src/paymentProgress.ts

- [`CANCELLED` — line 5](../../../apps/qr-guest/src/paymentProgress.ts#L5)

## apps/qr-guest/src/api.ts

- [`sessionStorage.getItem` — line 67](../../../apps/qr-guest/src/api.ts#L67)
- [`function imageSrc` — line 57](../../../apps/qr-guest/src/api.ts#L57)
