import React from 'react';
import { db, PrinterRepository } from '@jamanvaar/database';
import { Printer } from 'lucide-react';

/**
 * Relocated from kiosk-admin's Hardware tab — genuinely missing from pos-admin (grepped: no
 * kitchen-station printer routing anywhere else in this app), not kiosk-specific: any restaurant
 * with multiple kitchen stations (tandoor, bar, dessert) benefits from routing KOTs by station.
 */
export const KitchenPrinterRoutingPanel: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const roles = [
    { role: 'KITCHEN' as const, label: 'Main Kitchen / Curry Station' },
    { role: 'TANDOOR' as const, label: 'Tandoor Section' },
    { role: 'BAR' as const, label: 'Beverages Bar' },
    { role: 'DESSERT' as const, label: 'Dessert Counter' }
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-jaman-ivory border border-jaman-border flex items-center justify-center text-jaman-saffron">
          <Printer className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-jaman-navy">Kitchen Printer Routing</h3>
          <p className="text-xs text-[#4A5568]">Which physical printer handles each kitchen station's tickets</p>
        </div>
      </div>

      <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border text-xs space-y-3">
        {roles.map(({ role, label }) => {
          const assigned = db.configuredPrinters.find((p) => p.role === role);
          return (
            <div key={role} className="flex items-center justify-between gap-2">
              <label className="text-[#8C9BAE] font-semibold shrink-0">{label}:</label>
              <select
                value={assigned?.id || ''}
                onChange={(e) => {
                  const newPrinterId = e.target.value;
                  db.configuredPrinters.forEach((p) => {
                    if (p.role === role && p.id !== newPrinterId) {
                      PrinterRepository.updatePrinter(p.id, { role: undefined });
                    }
                  });
                  if (newPrinterId) {
                    const updated = PrinterRepository.updatePrinter(newPrinterId, { role });
                    if (updated) showToast(`${label} tickets will now print on: ${updated.name}`);
                  }
                }}
                className="flex-1 bg-white border border-jaman-border rounded-xl px-2 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none"
              >
                <option value="">Unassigned (falls back to default printer)</option>
                {db.configuredPrinters.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};
