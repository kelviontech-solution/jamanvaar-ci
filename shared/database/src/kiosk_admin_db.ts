import { JamanvaarDatabase } from './db';

/**
 * Kiosk Fleet Admin Database Instance
 * Backed by dedicated local namespace 'jamanvaar_kiosk_admin_db_'
 * for Kiosk Fleet Manager stations.
 */
export const kioskAdminDb = JamanvaarDatabase.getInstanceForRole('KIOSK_ADMIN', 'jamanvaar_kiosk_admin_db_');
export default kioskAdminDb;
