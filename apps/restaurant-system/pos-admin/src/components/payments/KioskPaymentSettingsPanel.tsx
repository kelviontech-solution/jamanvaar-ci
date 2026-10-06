import { useState } from 'react';
import { PaymentConnectionPanel } from './PaymentConnectionPanel';
import { OnlinePaymentsPanel } from './OnlinePaymentsPanel';
import type { PaymentConnectionStatus } from '../../cloud/cloudClient';

/** Shared by Restaurant Settings and the payment ledger, including kiosk-only plans. */
export function KioskPaymentSettingsPanel() {
  const [connection, setConnection] = useState<PaymentConnectionStatus | null>(null);
  return <div className="space-y-4">
    <PaymentConnectionPanel onStatusChange={setConnection} />
    {connection && connection.status !== 'NOT_CONNECTED' && <OnlinePaymentsPanel />}
  </div>;
}
