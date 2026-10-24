import React from 'react';
import { Utensils, ShoppingBag, Bike, Ticket } from 'lucide-react';
import { usePosStore } from '../../store/posStore';
import { PosTableGrid } from './PosTablePickerModal';

/**
 * Step one of a dine-in bill: choose the table before any dish is picked. It fills the whole
 * billing workspace; choosing a table (or switching to a takeaway-style order) reveals the menu.
 */
export const PosTableSelectionScreen: React.FC = () => {
  const { setOrderType, setActiveTab } = usePosStore() as any;
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-jaman-border overflow-hidden" data-testid="pos-table-selection">
      <div className="px-5 pt-4 pb-3 border-b border-jaman-border flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <Utensils className="w-6 h-6 text-jaman-saffronText" aria-hidden="true" />
            <span>Select a table</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">Pick the table first, then add dishes. Running tables continue their open order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Not a dine-in order?">
          <span className="text-xs font-semibold text-slate-600 mr-1">Not dine-in?</span>
          {([['TAKEAWAY', 'Takeaway', ShoppingBag], ['DELIVERY', 'Delivery', Bike], ['TOKEN', 'Token', Ticket]] as const).map(([type, label, Icon]) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              className="min-h-[40px] px-3 rounded-xl border border-jaman-border bg-white hover:border-jaman-saffron text-xs font-bold text-jaman-navy inline-flex items-center gap-1.5"
            >
              <Icon className="w-4 h-4 text-jaman-saffronText" aria-hidden="true" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveTab('TABLES')}
            className="min-h-[40px] px-3 rounded-xl text-xs font-bold text-slate-700 hover:text-jaman-saffronText underline"
          >
            Full floor plan
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <PosTableGrid large />
      </div>
    </div>
  );
};
