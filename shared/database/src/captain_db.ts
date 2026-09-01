import { db, JamanvaarDatabase } from './db';

/**
 * JAMANVAAR Captain Floor Service Database Client
 * Connected directly to the single authoritative JAMANVAAR Local Core Database.
 */
export const captainDb: JamanvaarDatabase = db;
export default captainDb;
