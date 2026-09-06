import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTicketDto, UpdateTicketDto } from './dto/ticket.dto';

const SLA_HOURS: Record<TicketPriority, number> = {
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
    private readonly audit: AuditService
  ) {}

  list(filters: { status?: TicketStatus; restaurantId?: string; assignedToId?: string }) {
    return this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findMany({
        where: {
          status: filters.status,
          restaurantId: filters.restaurantId,
          assignedToId: filters.assignedToId
        },
        include: TICKET_INCLUDE,
        orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }]
      })
    );
  }

  async getById(id: string) {
    const ticket = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.findUnique({
        where: { id },
        include: {
          ...TICKET_INCLUDE,
          comments: { include: { author: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'asc' } }
        }
      })
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(dto: CreateTicketDto, actor: PlatformUser) {
    const slaDueAt = new Date(Date.now() + SLA_HOURS[dto.priority as TicketPriority] * 60 * 60 * 1000);

    const ticket = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.create({
        data: {
          restaurantId: dto.restaurantId,
          subject: dto.subject,
          description: dto.description,
          priority: dto.priority,
          slaDueAt,
          createdById: actor.id
        },
        include: TICKET_INCLUDE
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: dto.restaurantId,
      action: 'SUPPORT_TICKET_CREATED',
      category: 'SUPPORT',
      details: { ticketId: ticket.id, subject: ticket.subject, priority: ticket.priority }
    });

    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.supportTicket.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Ticket not found');

    const becomingResolved = dto.status && (dto.status === 'RESOLVED' || dto.status === 'CLOSED') && !existing.resolvedAt;
    const reopening = dto.status && dto.status !== 'RESOLVED' && dto.status !== 'CLOSED' && existing.resolvedAt;

    const ticket = await this.prisma.runAsPlatform((tx) =>
      tx.supportTicket.update({
        where: { id },
        data: {
          status: dto.status,
          priority: dto.priority,
          assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
          resolvedAt: becomingResolved ? new Date() : reopening ? null : undefined
        },
        include: TICKET_INCLUDE
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.restaurantId ?? undefined,
      action: 'SUPPORT_TICKET_UPDATED',
      category: 'SUPPORT',
      details: { ticketId: id, changes: dto }
    });

    return ticket;
  }

  async addComment(ticketId: string, body: string, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.supportTicket.findUnique({ where: { id: ticketId } }));
    if (!existing) throw new NotFoundException('Ticket not found');

    const comment = await this.prisma.runAsPlatform((tx) =>
      tx.ticketComment.create({
        data: { ticketId, authorId: actor.id, body },
        include: { author: { select: { id: true, fullName: true } } }
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.restaurantId ?? undefined,
      action: 'SUPPORT_TICKET_COMMENTED',
      category: 'SUPPORT',
      details: { ticketId }
    });

    return comment;
  }
}
