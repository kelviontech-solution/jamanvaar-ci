import React, { useState } from 'react';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import { usePosStore } from '../../store/posStore';
import { PosCatalog } from './PosCatalog';
import { PosCart } from '../cart/PosCart';

/** Both panes stay mounted: changing the presentation never replaces the order or local edits. */
export function PosBillingWorkspace() {
  const [cartOpen, setCartOpen] = useState(false);
  const cart = usePosStore(state => state.cart);
  const quantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return <section className="pos-billing-workspace flex-1 min-w-0 min-h-0 flex flex-col" data-cart-open={cartOpen}>
    <div className="pos-mobile-cart-bar flex items-center justify-between gap-3 mb-2 shrink-0">
      {cartOpen ? <button type="button" onClick={() => setCartOpen(false)} className="min-h-11 px-3 rounded-xl bg-white border border-jaman-border font-bold text-sm flex items-center gap-2"><ArrowLeft size={18} />Back to dishes</button> : <span className="text-sm font-bold text-jaman-navy">Choose your dishes</span>}
      <button type="button" aria-expanded={cartOpen} aria-controls="pos-order-pane" onClick={() => setCartOpen(!cartOpen)} className="min-h-11 px-3 rounded-xl bg-jaman-navy text-white font-bold text-sm flex items-center gap-2"><ShoppingBag size={18} />Order ({quantity}) · {formatINR(cart.totalPayable)}</button>
    </div>
    <div className="flex flex-1 gap-2.5 min-w-0 min-h-0 overflow-hidden">
      <div className="pos-catalog-pane flex flex-1 min-w-0 min-h-0"><PosCatalog /></div>
      <div id="pos-order-pane" className="pos-order-pane min-h-0 min-w-0"><PosCart /></div>
    </div>
  </section>;
}
