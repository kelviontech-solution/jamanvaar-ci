/** bcrypt work factor for NEW password hashes. Existing hashes keep verifying at whatever cost they were made with. Tests use a cheap cost. */
export const BCRYPT_COST = process.env.NODE_ENV === 'test' ? 4 : 12;
