import { db, JamanvaarDatabase } from './db';

/**
 * JAMANVAAR Kitchen Display System (KDS) Database Client
 * Connected directly to the single authoritative JAMANVAAR Local Core Database.
 */
export const kdsDb: JamanvaarDatabase = db;
export default kdsDb;
