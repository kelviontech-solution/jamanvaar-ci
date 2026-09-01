import { Cart, DraftCartSession, OrderType, CustomerAccount, DiningTable } from '@jamanvaar/types';

const DRAFT_SESSION_KEY = 'jamanvaar_pos_active_draft_v1';
let memoryDraftStorage: string | null = null;

export class PosRecoveryService {
  /**
   * Save active cart draft to localStorage or in-memory fallback
   */
  public static saveDraft(session: {
    terminalId: string;
    orderType: OrderType;
    selectedTable: DiningTable | null;
    selectedCustomer: CustomerAccount | null;
    guestCount: number;
    cart: Cart;
    billDiscountPercent: number;
    billDiscountFlat: number;
  }): void {
    try {
      if (!session.cart.items || session.cart.items.length === 0) {
        this.clearDraft();
        return;
      }

      const draft: DraftCartSession = {
        id: `draft-${Date.now()}`,
        terminalId: session.terminalId,
        orderType: session.orderType,
        selectedTableId: session.selectedTable?.id,
        selectedTableNumber: session.selectedTable?.tableNumber,
        guestCount: session.guestCount,
        customerPhone: session.selectedCustomer?.phone,
        customerName: session.selectedCustomer?.name,
        cart: session.cart,
        billDiscountPercent: session.billDiscountPercent,
        billDiscountFlat: session.billDiscountFlat,
        updatedAt: new Date().toISOString()
      };

      const serialized = JSON.stringify(draft);
      memoryDraftStorage = serialized;

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(DRAFT_SESSION_KEY, serialized);
      }
    } catch (err) {
      console.warn('Failed to auto-save POS draft:', err);
    }
  }

  /**
   * Check for recoverable draft session
   */
  public static loadDraft(): DraftCartSession | null {
    try {
      let raw: string | null = memoryDraftStorage;

      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(DRAFT_SESSION_KEY) || raw;
      }

      if (!raw) return null;
      const draft: DraftCartSession = JSON.parse(raw);
      if (draft && draft.cart && draft.cart.items && draft.cart.items.length > 0) {
        return draft;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Clear active draft session
   */
  public static clearDraft(): void {
    memoryDraftStorage = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(DRAFT_SESSION_KEY);
      }
    } catch (err) {
      // ignore
    }
  }
}
