import { JamanvaarDatabase } from './db';

/**
 * Self-Ordering Kiosk Customer Screen Database Instance
 * Backed by dedicated local namespace 'jamanvaar_kiosk_user_db_'
 * for Touchscreen Kiosk Hardware.
 */
export const kioskUserDb = JamanvaarDatabase.getInstanceForRole('KIOSK_USER', 'jamanvaar_kiosk_user_db_');
export default kioskUserDb;
