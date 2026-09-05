import { db, JamanvaarDatabase } from './db';

/**
 * POS Cashier Terminal Database Client
 * Connected directly to the single authoritative JAMANVAAR Local Core Database.
 */
export const posDb: JamanvaarDatabase = db;
export default posDb;
