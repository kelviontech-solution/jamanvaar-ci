import { useEffect, useRef } from 'react';

/** Visual feedback follows committed cart values, never unrelated App renders. */
export function useKioskCartFeedback(quantity: number, total: number, visible: boolean) {
  const cartSummaryRef = useRef<HTMLButtonElement>(null);
  const cartTotalRef = useRef<HTMLSpanElement>(null);
  const previous = useRef({ quantity: 0, total });
  const hasAppeared = useRef(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = { quantity, total };
    if (quantity === 0) hasAppeared.current = false;
    const summary = cartSummaryRef.current;
    if (!visible || !summary || quantity === 0) return;
    const firstAppearance = !hasAppeared.current;
    hasAppeared.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const feedback: [HTMLElement, string][] = [];
    if (firstAppearance) {
      feedback.push([summary, 'kiosk-cart-enter']);
    } else {
      if (quantity > before.quantity) {
        feedback.push([summary, 'kiosk-cart-pulse']);
      }
      if (total !== before.total && cartTotalRef.current) {
        feedback.push([cartTotalRef.current, 'kiosk-cart-total-emphasis']);
      }
    }
    // Commit removal of earlier feedback before restarting the CSS animation.
    // This is restricted to the small dock, and never delays the cart state update.
    if (feedback.length) void summary.offsetWidth;
    feedback.forEach(([element, className]) => element.classList.add(className));
    return () => feedback.forEach(([element, className]) => element.classList.remove(className));
  }, [quantity, total, visible]);

  return { cartSummaryRef, cartTotalRef };
}
