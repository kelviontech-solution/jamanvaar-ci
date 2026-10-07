/** Catalog, customer and supplier records are shared; these operational records have branch ownership. */
export const BRANCH_ENTITY_TYPES = new Set(['DINING_TABLE', 'INVENTORY_ITEM', 'RECIPE', 'KIOSK_CONFIGURATION', 'SHIFT', 'CASH_MOVEMENT', 'RESERVATION', 'SERVICE_MESSAGE', 'PAYMENT_TRANSACTION', 'CUSTOMER_FEEDBACK']);
export const BRANCH_FILTER_TYPES = new Set([...BRANCH_ENTITY_TYPES, 'STAFF_USER', 'MENU_ITEM']);
