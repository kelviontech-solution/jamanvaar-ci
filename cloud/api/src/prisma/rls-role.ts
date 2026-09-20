export interface DbRoleAttributes {
  name: string;
  superuser: boolean;
  bypassRls: boolean;
}

export type RlsAssessment = { enforced: true } | { enforced: false; fatal: boolean; message: string };

/**
 * Postgres superusers and roles with BYPASSRLS ignore row-level security even when it is FORCED,
 * which turns every tenant-isolation policy into decoration. Production must run as an ordinary
 * role (see DATABASE_URL in .env.example); anywhere else this only warns, so local development
 * against a default `postgres` install keeps working.
 */
export function assessRlsRole(role: DbRoleAttributes, nodeEnv: string | undefined): RlsAssessment {
  if (!role.superuser && !role.bypassRls) return { enforced: true };
  const why = role.superuser ? 'a superuser' : 'a role with BYPASSRLS';
  const message =
    `Row-level security is not enforced: the API is connected as "${role.name}", ${why}. ` +
    'Tenant isolation then depends only on the application adding the right filters. ' +
    'Connect as a dedicated non-superuser role without BYPASSRLS.';
  return { enforced: false, fatal: nodeEnv === 'production', message };
}
