import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogInput {
  actorType: AuditActorType;
  actorId?: string;
  restaurantId?: string;
  action: string;
  category: string;
  details?: Record<string, unknown>;
}

/**
 * Audit writes never carry passwords, tokens, or password hashes — callers
 * pass only identifiers and business-meaningful fields in `details`.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client` lets a caller write the audit row inside the same transaction as
   * the action it's recording (e.g. restaurant creation) — pass a
   * `Prisma.TransactionClient` from inside `runAsPlatform`/`runAsTenant`.
   * Defaults to a standalone write for actions with no tenant-scoped data
   * (e.g. login/logout).
   */
  async log(input: AuditLogInput, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        restaurantId: input.restaurantId,
        action: input.action,
        category: input.category,
        details: input.details as Prisma.InputJsonValue | undefined
      }
    });
  }
}
