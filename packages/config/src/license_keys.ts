/**
 * The public keys terminals trust to verify signed licence certificates and emergency offline
 * extensions (BUG-076). More than one can be listed, so a key can be rotated: sign new certificates
 * with the new key, keep the old key here until every certificate it signed has expired, then remove it.
 * Only PUBLIC keys ever live here; the matching private key exists only on the API server.
 *
 * Certificates carry the `kid` of the key that signed them. One without a kid (issued before key ids
 * existed) is checked against every key.
 */
export interface LicensePublicKey {
  kid: string;
  jwk: JsonWebKey;
}

/** True in a production build (Vite sets `import.meta.env.PROD`); false in development, tests and plain Node. */
const isProductionBundle = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;

const DEVELOPMENT_KEYS: LicensePublicKey[] = [
  {
    // Development key: its private half lives only in cloud/api/.env on the development machine.
    // It is trusted in development and test builds ONLY; a production bundle never carries it.
    kid: 'k2',
    jwk: { kty: 'EC', crv: 'P-256', x: 'zaCC1jlvmsNZsUPrz-bolMm0waKF_wYV8WimmIZvmM4', y: 'GDKm_kViW0jh8XnjVAhTwjR7DIA13cmxhuoPw7Cn5FQ' }
  }
];

export const LICENSE_PUBLIC_KEYS: LicensePublicKey[] = [
  {
    kid: 'k1',
    jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'cvAVNFm6l4nVknr2vjaQ21EzZby6m2bXIlG3jcWoVX0',
      y: 'bafQoC8ZaiXpkinCfXSPMJUjsqt3v0UvAbUFWZwLfsg'
    }
  },
  ...(isProductionBundle ? [] : DEVELOPMENT_KEYS)
];
