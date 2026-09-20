/**
 * Whether the seed script should create the sample "Demo Restaurant" tenant (with a demo owner and invoice).
 * It is for local development and tests. A production database gets only the platform's own data (plans,
 * settings, the super admin) unless someone explicitly asks for the demo with SEED_DEMO_DATA=true.
 */
export function shouldSeedDemoData(env: Record<string, string | undefined>): boolean {
  const explicit = env.SEED_DEMO_DATA?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return env.NODE_ENV !== 'production';
}
