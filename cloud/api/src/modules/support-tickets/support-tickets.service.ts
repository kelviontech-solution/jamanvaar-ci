import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PlatformUser, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { AttachmentDto, CreateTicketDto, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, UpdateTicketDto } from './dto/ticket.dto';

export const SLA_HOURS: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168
};

const TICKET_INCLUDE = {
  assignedTo: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  restaurant: { select: { id: true, name: true } }
} as const;

/** Attachment rows without their (large) file bytes. */
export const ATTACHMENT_META = { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedByType: true, uploadedByName: true, createdAt: true } as const;

export type TicketActor = { type: 'PLATFORM' | 'RESTAURANT'; name: string };

/**
 * Evolves the Support page from search+diagnostics-only into a real
 * lightweight ticketing view — previously every support interaction was a
 * one-off audited action (resend invite, revoke device) with no persistent
 * record of the underlying issue, no assignment, and no SLA tracking.
 */
@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: PlatformNotificationsService
  ) {}

  /**
   * Every team member sees every ticket; the views narrow it. `my-work` is what the logged-in
   * member has to do today: assigned to them, still open or in progress, most urgent SLA first
   * (overdue ones sort to the top because their due time is earliest).
   */
  list(
    actor: PlatformUser,
    filters: {
      status?: TicketStatus;
      restaurantId?: string;
      assignedToId?: string;
      view?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const OPEN: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];
    const where: Prisma.SupportTicketWhereInput = {
      status: filters.status,
      restaurantId: filters.restaurantId,
      assignedToId: filters.assignedToId
    };
    switch (filters.view) {
      case 'mine':
        where.assignedToId = actor.id;
        break;
      case 'my-work':
        where.assignedToId = actor.id;
        where.status = { in: OPEN };
        break;
      case 'unassigned':
        where.assignedToId = null;
        break;
      case 'created-by-me':
        where.createdById = actor.id;
        break;
      case 'from-restaurants':
        where.source = 'RESTAURANT';
        break;
      case 'overdue':
        where.status = { in: OPEN };
        where.slaDueAt = { lt: new Date() };
        break;
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      const asNumber = Number(q.replace(/^tkt-?/i, ''));
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : [])
      ];
    }

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const page = Math.max(filters.page ?? 1, 1);
    return this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: filters.view === 'my-work' || filters.view === 'overdue' ? [{ slaDueAt: 'asc' }] : [{ status: 'asc' }, { slaDueAt: 'asc' }],
        take: limit,
        skip: (page - 1) * limit
      })
    );
  }

  /** The counts behind the tabs, computed by the database (the page used to count in the browser). */
  async summary(actor: PlatformUser) {
    const OPEN: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];
    return this.prisma.runAsPlatform(async (tx) => {
      const [all, mine, unassigned, createdByMe, overdue, fromRestaurants, grouped] = await Promise.all([
        tx.supportTicket.count(),
        tx.supportTicket.count({ where: { assignedToId: actor.id, status: { in: OPEN } } }),
        tx.supportTicket.count({ where: { assignedToId: null, status: { in: OPEN } } }),
        tx.supportTicket.count({ where: { createdById: actor.id } }),
        tx.supportTicket.count({ where: { status: { in: OPEN }, slaDueAt: { lt: new Date() } } }),
        tx.supportTicket.count({ where: { source: 'RESTAURANT', status: { in: OPEN } } }),
        tx.supportTicket.groupBy({ by: ['assignedToId'], where: { status: { in: OPEN }, assignedToId: { not: null } }, _count: { _all: true } })
      ]);
      const users = await tx.platformUser.findMany({
        where: { id: { in: grouped.map((g) => g.assignedToId as string) } },
        select: { id: true, fullName: true }
      });
      const byAssignee = grouped
        .map((g) => ({
          userId: g.assignedToId as string,
          name: users.find((u) => u.id === g.assignedToId)?.fullName ?? 'Unknown',
          openCount: g._count._all
        }))
        .sort((a, b) => b.openCount - a.openCount);
      return { all, mine, unassigned, createdByMe, overdue, fromRestaurants, byAssignee };
    });
  }

  /** A ticket may only be handed to someone who can actually log in and work it. */
  private async assertAssignable(userId: string) {
    const user = await this.prisma.runAsPlatform((tx) =>
      tx.platformUser.findUnique({ where: { id: userId }, select: { status: true } })
    );
    if (!user) throw new BadRequestException('That team member does not exist.');
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Tickets can only be assigned to active team members (this one is disabled or has not activated their account).');
    }
  }

  async getById(id: string) {
    const ticket = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findUnique({
        where: { id },
        include: {
          ...TICKET_INCLUDE,
          comments: { include: { author: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'asc' } },
          events: { orderBy: { createdAt: 'asc' } },
          attachments: { select: ATTACHMENT_META, orderBy: { createdAt: 'asc' } }
        }
      })
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(dto: CreateTicketDto, actor: PlatformUser) {
    if (dto.assignedToId) await this.assertAssignable(dto.assignedToId);
    const slaDueAt = new Date(Date.now() + SLA_HOURS[dto.priority as TicketPriority] * 60 * 60 * 1000);

    const ticket = await this.prisma.runAsPlatform(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          restaurantId: dto.restaurantId,
          subject: dto.subject,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          slaDueAt,
          assignedToId: dto.assignedToId ?? null,
          createdById: actor.id,
          source: 'PLATFORM'
        },
        include: TICKET_INCLUDE
      });
      await tx.ticketEvent.create({ data: { ticketId: created.id, type: 'CREATED', actorType: 'PLATFORM', actorName: actor.fullName, toValue: 'OPEN' } });
      return created;
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: dto.restaurantId,
      action: 'SUPPORT_TICKET_CREATED',
      category: 'SUPPORT',
      details: { ticketId: ticket.id, number: ticket.number, subject: ticket.subject, priority: ticket.priority, assignedToId: ticket.assignedToId }
    });

    if (ticket.assignedToId && ticket.assignedToId !== actor.id) {
      await this.notifyAssigned(ticket, ticket.assignedToId, actor.fullName, `create`);
    }
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findUnique({ where: { id }, include: { assignedTo: { select: { fullName: true } } } })
    );
    if (!existing) throw new NotFoundException('Ticket not found');
    if (dto.assignedToId) await this.assertAssignable(dto.assignedToId);

    const becomingResolved = dto.status && (dto.status === 'RESOLVED' || dto.status === 'CLOSED') && !existing.resolvedAt;
    const reopening = dto.status && dto.status !== 'RESOLVED' && dto.status !== 'CLOSED' && existing.resolvedAt;
    const assigneeChanged = dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId;

    const ticket = await this.prisma.runAsPlatform(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id },
        data: {
          status: dto.status,
          priority: dto.priority,
          category: dto.category,
          assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
          resolvedAt: becomingResolved ? new Date() : reopening ? null : undefined
        },
        include: TICKET_INCLUDE
      });
      const event = (type: string, fromValue: string | null, toValue: string | null, visibleToRestaurant = true) =>
        tx.ticketEvent.create({ data: { ticketId: id, type, actorType: 'PLATFORM', actorName: actor.fullName, fromValue, toValue, visibleToRestaurant } });
      if (dto.status && dto.status !== existing.status) await event('STATUS', existing.status, dto.status);
      if (dto.priority && dto.priority !== existing.priority) await event('PRIORITY', existing.priority, dto.priority);
      if (assigneeChanged) await event('ASSIGNEE', existing.assignedTo?.fullName ?? 'Unassigned', updated.assignedTo?.fullName ?? 'Unassigned', false);
      return updated;
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.restaurantId ?? undefined,
      action: 'SUPPORT_TICKET_UPDATED',
      category: 'SUPPORT',
      details: { ticketId: id, changes: dto }
    });

    if (assigneeChanged && dto.assignedToId && dto.assignedToId !== actor.id) {
      await this.notifyAssigned(ticket, dto.assignedToId, actor.fullName, `${Date.now()}`);
    }
    return ticket;
  }

  private notifyAssigned(ticket: { id: string; number: number; subject: string; restaurantId: string | null }, userId: string, byName: string, nonce: string) {
    return this.notifications.notify({
      type: 'TICKET_ASSIGNED',
      severity: 'INFO',
      title: `TKT-${String(ticket.number).padStart(6, '0')} assigned to you: ${ticket.subject}`,
      body: `Assigned by ${byName}`,
      restaurantId: ticket.restaurantId,
      targetType: 'ticket',
      targetId: ticket.id,
      link: `/tickets?open=${ticket.id}`,
      dedupeKey: `ticket-assigned:${ticket.id}:${userId}:${nonce}`,
      userId
    });
  }

  async addComment(ticketId: string, body: string, actor: PlatformUser, internal = false) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.supportTicket.findUnique({ where: { id: ticketId } }));
    if (!existing) throw new NotFoundException('Ticket not found');

    const comment = await this.prisma.runAsPlatform((tx) =>
      tx.ticketComment.create({
        data: { ticketId, authorId: actor.id, authorType: 'PLATFORM', authorName: actor.fullName, internal, body },
        include: { author: { select: { id: true, fullName: true } } }
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.restaurantId ?? undefined,
      action: 'SUPPORT_TICKET_COMMENTED',
      category: 'SUPPORT',
      details: { ticketId, internal }
    });

    return comment;
  }

  /** Shared by the platform team and restaurants; callers have already checked the caller may see this ticket. */
  async saveAttachment(ticketId: string, dto: AttachmentDto, by: TicketActor) {
    const data = Buffer.from(dto.dataBase64, 'base64');
    if (data.length === 0) throw new BadRequestException('The file is empty.');
    if (data.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(`Files can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`);
    }
    const count = await this.prisma.runAsPlatform((tx) => tx.ticketAttachment.count({ where: { ticketId } }));
    if (count >= MAX_ATTACHMENTS_PER_TICKET) {
      throw new BadRequestException(`A ticket can have at most ${MAX_ATTACHMENTS_PER_TICKET} attachments.`);
    }
    return this.prisma.runAsPlatform(async (tx) => {
      const saved = await tx.ticketAttachment.create({
        data: { ticketId, fileName: dto.fileName, mimeType: dto.mimeType, sizeBytes: data.length, data, uploadedByType: by.type, uploadedByName: by.name },
        select: ATTACHMENT_META
      });
      await tx.ticketEvent.create({ data: { ticketId, type: 'ATTACHMENT', actorType: by.type, actorName: by.name, toValue: dto.fileName } });
      return saved;
    });
  }

  async readAttachment(ticketId: string, attachmentId: string) {
    const file = await this.prisma.runAsPlatform((tx) => tx.ticketAttachment.findFirst({ where: { id: attachmentId, ticketId } }));
    if (!file) throw new NotFoundException('Attachment not found');
    return file;
  }
}
