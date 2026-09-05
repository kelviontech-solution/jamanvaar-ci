/**
 * JAMANVAAR System Constants and Defaults
 */

export const APP_CONSTANTS = {
  APP_NAME: 'JAMANVAAR Kiosk',
  ADMIN_APP_NAME: 'JAMANVAAR Admin Control Plane',
  COMPANY_NAME: 'Kelviontech',
  CURRENCY_SYMBOL: '₹',
  CURRENCY_CODE: 'INR',
  DEFAULT_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'hi', 'gu'] as const,

  // Kiosk Session & Idle Timeouts (in seconds)
  DEFAULT_IDLE_TIMEOUT_SECONDS: 60,
  IDLE_WARNING_DURATION_SECONDS: 15,
  PAYMENT_TIMEOUT_SECONDS: 180,
  AUTO_RESET_AFTER_COMPLETION_SECONDS: 20,

  // Default Restaurant & Outlet identity
  DEFAULT_RESTAURANT_ID: 'rest-jamanvaar-main',
  DEFAULT_OUTLET_ID: 'out-ahmedabad-central',
  DEFAULT_KIOSK_ID: 'KIOSK-01',

  // Order & Token Generation
  DEFAULT_TOKEN_PREFIX: '',
  DEFAULT_TOKEN_START: 101,
  DEFAULT_ESTIMATED_PREP_MINUTES: 15,

  // Tax defaults (GST in India: 2.5% CGST + 2.5% SGST = 5%)
  DEFAULT_CGST_PERCENT: 2.5,
  DEFAULT_SGST_PERCENT: 2.5,
  DEFAULT_IGST_PERCENT: 5.0,

  // Storage Keys for Local State & Cache
  STORAGE_KEYS: {
    AUTH_TOKEN: 'jamanvaar_admin_jwt',
    CURRENT_USER: 'jamanvaar_admin_user',
    DEVICE_CONFIG: 'jamanvaar_kiosk_device_config',
    ACTIVE_SESSION: 'jamanvaar_kiosk_session',
    OFFLINE_OUTBOX: 'jamanvaar_sync_outbox',
    MENU_CACHE: 'jamanvaar_menu_cache',
    LANGUAGE_PREF: 'jamanvaar_lang_pref',
    ACCESSIBILITY_PREF: 'jamanvaar_a11y_pref',
    SAVED_CART: 'jamanvaar_active_cart'
  }
} as const;

export const RESTAURANT_DEFAULT_STATIONS = [
  'Main Kitchen',
  'Tandoor',
  'Beverage',
  'Dessert',
  'South Indian',
  'Continental'
] as const;

