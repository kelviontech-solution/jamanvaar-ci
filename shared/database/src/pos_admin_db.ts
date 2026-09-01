import { db, JamanvaarDatabase } from './db';

/**
 * POS Admin Center Database Client
 * Connected directly to the single authoritative JAMANVAAR Local Core Database.
 */
export const posAdminDb: JamanvaarDatabase = db;
export default posAdminDb;
