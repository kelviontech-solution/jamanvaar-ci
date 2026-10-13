import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateIncidentDto, AddIncidentUpdateDto } from './dto/incident.dto';

interface IncidentUpdateEntry {
  status: string;
  message: string;
  at: string;
}

/**
 * Super Admin feature request: public/internal status history. "Platform Online" on every page is a
 * live badge with no memory -- nothing records what broke, when, or how long it took. This gives
 * Super Admin an incident log with a timestamped timeline per incident (open -> status updates ->
 * resolved), a real paper trail for a dispute or a retro, not just the current instant's health.
 */
@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async open(dto: CreateIncidentDto, actor: PlatformUser) {
    const firstUpdate: IncidentUpdateEntry = { status: 'INVESTIGATING', message: dto.message, at: new Date().toISOString() };
    const incident = await this.prisma.runAsPlatform((tx) =>
      tx.platformIncident.create({
        data: { title: dto.title, severity: dto.severity, status: 'INVESTIGATING', updates: [firstUpdate] as unknown as Prisma.InputJsonValue, createdById: actor.id }
      })
    );
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'INCIDENT_OPENED',
      category: 'INCIDENTS',
      details: { incidentId: incident.id, title: incident.title, severity: incident.severity }
    });
    return incident;
  }

  async list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.platformIncident.findMany({
        orderBy: { startedAt: 'desc' },
        include: { createdBy: { select: { id: true, fullName: true, email: true } } }
      })
    );
  }

  async addUpdate(id: string, dto: AddIncidentUpdateDto, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.platformIncident.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Incident not found');
    if (existing.status === 'RESOLVED') throw new ForbiddenException('This incident is already resolved');

    const entry: IncidentUpdateEntry = { status: dto.status, message: dto.message, at: new Date().toISOString() };
    const updates = [...(existing.updates as unknown as IncidentUpdateEntry[]), entry];
    const updated = await this.prisma.runAsPlatform((tx) =>
      tx.platformIncident.update({
        where: { id },
        data: { status: dto.status, updates: updates as unknown as Prisma.InputJsonValue, ...(dto.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}) }
      })
    );
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: dto.status === 'RESOLVED' ? 'INCIDENT_RESOLVED' : 'INCIDENT_UPDATED',
      category: 'INCIDENTS',
      details: { incidentId: id, status: dto.status, message: dto.message }
    });
    return updated;
  }
}
