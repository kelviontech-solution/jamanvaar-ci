#!/usr/bin/env node
/**
 * One-time key ceremony for offline licence certificates and emergency extensions (BUG-076).
 *
 *   node scripts/generate-license-key.js
 *
 * Prints, for a NEW P-256 pair:
 *   1. LICENSE_SIGNING_PRIVATE_KEY_B64  -> the API environment / secrets store. Never commit it.
 *   2. LICENSE_PUBLIC_KEY_JWK           -> packages/business/src/license_certificate.ts
 *
 * The apps verify certificates with the public key compiled into them, so the pair you use in
 * production must match the one in the apps you ship. Generating a new pair invalidates every
 * certificate signed by the old one until the apps are rebuilt with the new public key.
 */
const { generateKeyPairSync } = require('crypto');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = publicKey.export({ format: 'jwk' });

console.log('# Keep this secret (API environment / secrets store):');
console.log(`LICENSE_SIGNING_PRIVATE_KEY_B64=${Buffer.from(pem).toString('base64')}`);
console.log('');
console.log('# Public half, safe to publish; goes into packages/business/src/license_certificate.ts:');
console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, null, 2));
