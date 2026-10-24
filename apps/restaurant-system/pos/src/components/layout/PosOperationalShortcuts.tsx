import { LayoutGrid, Receipt, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useStaffLanguage } from '@jamanvaar/ui';
import { usePosStore } from '../../store/posStore';

/** The existing everyday-task actions, shared by the billing and other POS workspaces. */
export function PosOperationalShortcuts() {
  const { t } = useStaffLanguage();
  const { setActiveTab, setOrderInboxMode } = usePosStore();
  return (
    <nav aria-label="Everyday tasks" className="flex flex-wrap items-center gap-1 max-w-full shrink-0">
      {([
        { id: 'MENU', label: 'Billing', icon: UtensilsCrossed },
        { id: 'ORDERS', label: 'Orders', icon: ShoppingBag },
        { id: 'TABLES', label: 'Tables', icon: LayoutGrid },
        { id: 'ORDERS', label: 'Collect', icon: Receipt }
      ] as const).map(item => (
        <button
          key={item.label} type="button"
          onClick={() => {
            setOrderInboxMode(item.label === 'Collect' ? 'COLLECTIONS' : 'ALL');
            setActiveTab(item.id);
          }}
          className="min-h-10 rounded-xl px-2.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-jaman-navy flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <item.icon size={18} className="shrink-0" aria-hidden="true" />
          {t(item.label)}
        </button>
      ))}
    </nav>
  );
}
