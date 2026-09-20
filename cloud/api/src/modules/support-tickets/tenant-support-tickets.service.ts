import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketPriority, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { AttachmentDto, TenantCreateTicketDto } from './dto/ticket.dto';
import { ATTACHMENT_META, SLA_HOURS, SupportTicketsService } from './support-tickets.service';

const ticketNumber = (n: number) => `TKT-${String(n).padStart(6, '0')}`;

/**
 * A restaurant's own view of support (BUG-088). Every query is scoped to the restaurant in the
 * session, so a restaurant can neither read nor write another's tickets; internal notes and internal
 * events (assignments) are never returned.
 */
@Injectable()
export class TenantSupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: SupportTicketsService,
    private readonly notifications: PlatformNotificationsService,
    private readonly audit: AuditService
  ) {}

  private actor(user: User) {
    return { type: 'RESTAURANT' as const, name: user.fullName };
  }

  async create(user: User, dto: TenantCreateTicketDto) {
    const restaurantId = user.restaurantId;
    if (dto.branchId) {
      const branch = await this.prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirst({ where: { id: dto.branchId, restaurantId }, select: { id: true } }));
      if (!branch) throw new BadRequestException('That branch does not belong to your restaurant.');
    }
    if (dto.deviceId) {
      const device = await this.prisma.runAsTenant(restaurantId, (tx) => tx.device.findFirst({ where: { id: dto.deviceId, restaurantId }, select: { id: true } }));
      if (!device) throw new BadRequestException('That device does not belong to your restaurant.');
    }

    const slaDueAt = new Date(Date.now() + SLA_HOURS[dto.priority as TicketPriority] * 60 * 60 * 1000);
    const { ticket, restaurantName } = await this.prisma.runAsPlatform(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          restaurantId,
          subject: dto.subject,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          slaDueAt,
          source: 'RESTAURANT',
          raisedByUserId: user.id,
          raisedByName: user.fullName,
          raisedByEmail: user.email,
          branchId: dto.branchId ?? null,
          deviceId: dto.deviceId ?? null
        }
      });
      await tx.ticketEvent.create({ data: { ticketId: created.id, type: 'CREATED', actorType: 'RESTAURANT', actorName: user.fullName, toValue: 'OPEN' } });
      const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
      return { ticket: created, restaurantName: restaurant?.name ?? 'A restaurant' };
    });

    await this.audit.log({
      actorType: 'TENANT',
      actorId: user.id,
      restaurantId,
      action: 'SUPPORT_TICKET_CREATED',
      category: 'SUPPORT',
      details: { ticketId: ticket.id, number: ticket.number, category: dto.category, priority: dto.priority, source: 'RESTAURANT' }
    });

    await this.notifications.notify({
      type: 'TICKET_CREATED',
      severity: dto.priority === 'URGENT' || dto.priority === 'HIGH' ? 'WARNING' : 'INFO',
      title: `${restaurantName}: new ${dto.priority.toLowerCase()} ticket, ${dto.subject}`,
      body: `${ticketNumber(ticket.number)} · ${dto.category.replace('_', ' ').toLowerCase()} · from ${user.fullName}`,
      restaurantId,
      targetType: 'ticket',
      targetId: ticket.id,
      link: `/tickets?open=${ticket.id}`,
      dedupeKey: `ticket-created:${ticket.id}`
    });
    return ticket;
  }

  list(user: User) {
    return this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findMany({
        where: { restaurantId: user.restaurantId },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
        select: { id: true, number: true, subject: true, category: true, priority: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true }
      })
    );
  }

  private async own(user: User, id: string) {
    const ticket = await this.prisma.runAsPlatform((tx) => tx.supportTicket.findFirst({ where: { id, restaurantId: user.restaurantId } }));
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async get(user: User, id: string) {
    await this.own(user, id);
    const ticket = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId },
        select: {
          id: true, number: true, subject: true, description: true, category: true, priority: true, status: true,
          branchId: true, deviceId: true, slaDueAt: true, createdAt: true, updatedAt: true, resolvedAt: true, raisedByName: true,
          comments: { where: { internal: false }, orderBy: { createdAt: 'asc' }, select: { id: true, body: true, authorType: true, authorName: true, createdAt: true } },
          events: { where: { visibleToRestaurant: true }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, actorType: true, actorName: true, fromValue: true, toValue: true, createdAt: true } },
          attachments: { select: ATTACHMENT_META, orderBy: { createdAt: 'asc' } }
        }
      })
    );
    return ticket;
  }

  async addComment(user: User, id: string, body: string) {
    const ticket = await this.own(user, id);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('This ticket is closed. Please raise a new ticket.');
    }
    const reopen = ticket.status === 'RESOLVED';

    const comment = await this.prisma.runAsPlatform(async (tx) => {
      const created = await tx.ticketComment.create({
        data: { ticketId: id, authorType: 'RESTAURANT', authorName: user.fullName, internal: false, body },
        select: { id: true, body: true, authorType: true, authorName: true, createdAt: true }
      });
      if (reopen) {
        await tx.supportTicket.update({ where: { id }, data: { status: 'OPEN', resolvedAt: null } });
        await tx.ticketEvent.create({ data: { ticketId: id, type: 'STATUS', actorType: 'RESTAURANT', actorName: user.fullName, fromValue: ticket.status, toValue: 'OPEN' } });
      } else {
        await tx.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } });
      }
      return created;
    });

    const restaurant = await this.prisma.runAsPlatform((tx) => tx.restaurant.findUnique({ where: { id: user.restaurantId }, select: { name: true } }));
    await this.notifications.notify({
      type: 'TICKET_COMMENT',
      severity: reopen ? 'WARNING' : 'INFO',
      title: `${restaurant?.name ?? 'A restaurant'} ${reopen ? 'reopened' : 'replied to'} ${ticketNumber(ticket.number)}`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
      restaurantId: user.restaurantId,
      targetType: 'ticket',
      targetId: id,
      link: `/tickets?open=${id}`,
      dedupeKey: `ticket-comment:${comment.id}`,
      // The person working it hears first; an unassigned ticket alerts the whole team.
      userId: ticket.assignedToId
    });
    return comment;
  }

  async addAttachment(user: User, id: string, dto: AttachmentDto) {
    await this.own(user, id);
    return this.tickets.saveAttachment(id, dto, this.actor(user));
  }

  async readAttachment(user: User, id: string, attachmentId: string) {
    await this.own(user, id);
    return this.tickets.readAttachment(id, attachmentId);
  }
}
