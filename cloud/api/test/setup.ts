import 'dotenv/config';
import 'reflect-metadata';

// Never run the suite against the development database: use the dedicated test database when one is
// configured. It is owned by a non-superuser role, so row-level security is genuinely enforced.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Tests must never send real email, whatever SMTP settings the developer's .env holds.
process.env.SMTP_HOST = '';
