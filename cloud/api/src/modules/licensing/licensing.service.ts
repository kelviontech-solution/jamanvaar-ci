import { createPrivateKey, createSign } from 'crypto';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface LicenseCertificatePayload {
  restaurantId: string;
  tier: string;
  entitlements: Record<string, unknown>;
  expiresAt: string;
  issuedAt: string;
  /** The id of the signing key, so keys can be rotated (BUG-076). */
  kid: string;
}

export interface IssuedLicenseCertificate {
  payload: string; // base64url(JSON)
  signature: string; // base64url(DER ECDSA signature over `payload`)
}

/**
 * ENT-001 / SEC-002 fix: an offline restaurant's local runtime previously trusted
 * any plaintext tier string a UI button (or devtools) supplied — Super Admin's
 * plan assignment had no real enforcement path. This service is the one place
 * that can mint a certificate a local app will accept: it always reads the
 * restaurant's real, current subscription from Postgres, never a client-supplied
 * tier, and signs the result with an ECDSA P-256 private key that never leaves
 * this server. Clients verify with the matching public key only — they cannot
 * forge a certificate even with full access to the shipped frontend bundle.
 */
@Injectable()
export class LicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private getPrivateKey() {
    const b64 = this.config.get<string>('LICENSE_SIGNING_PRIVATE_KEY_B64');
    if (!b64) {
      throw new ServiceUnavailableException(
        'Offline license certificate signing is not configured on this server (LICENSE_SIGNING_PRIVATE_KEY_B64 unset)'
      );
    }
    const pem = Buffer.from(b64, 'base64').toString('utf8');
    return createPrivateKey({ key: pem, format: 'pem' });
  }

  /**
   * Web Crypto's ECDSA verify (used client-side, see packages/business/src/license_certificate.ts)
   * expects the raw IEEE-P1363 (r||s, fixed-length) signature format, not Node's
   * ASN.1 DER default — dsaEncoding must be set explicitly on both sign and verify
   * or the two sides will never agree on a signature that both consider valid.
   */
  private sign(payloadJson: string): string {
    const signer = createSign('SHA256');
    signer.update(payloadJson);
    signer.end();
    return signer.sign({ key: this.getPrivateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }

  /**
   * Issues a certificate for a restaurant's currently active subscription.
   * Platform-context only — this is meant to be called by Super Admin (for a
   * dealer/offline restaurant) or, in a future phase, a tenant-authed caller
   * for their own restaurant. Never accepts a caller-supplied tier.
   */
  async issueCertificate(restaurantId: string, actor: PlatformUser): Promise<IssuedLicenseCertificate> {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const subscription = await tx.subscription.findFirst({
        where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) {
        throw new NotFoundException('No active or trial subscription — cannot issue a license certificate');
      }

      const payload: LicenseCertificatePayload = {
        restaurantId,
        tier: subscription.plan.tier,
        entitlements: subscription.plan.entitlements as Record<string, unknown>,
        expiresAt: subscription.expiresAt.toISOString(),
        issuedAt: new Date().toISOString(),
        kid: this.config.get<string>('LICENSE_SIGNING_KEY_ID') || 'k1'
      };

      const payloadJson = JSON.stringify(payload);
      const payloadB64 = Buffer.from(payloadJson).toString('base64url');
      const signature = this.sign(payloadJson);

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId,
          action: 'LICENSE_CERTIFICATE_ISSUED',
          category: 'LICENSING',
          details: { tier: payload.tier, expiresAt: payload.expiresAt }
        },
        tx
      );

      return { payload: payloadB64, signature };
    });
  }
}
