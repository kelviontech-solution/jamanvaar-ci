import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAnnouncementDto } from './dto/announcement.dto';

/**
 * Super Admin feature request: platform-wide announcement / broadcast to restaurant owners
 * (maintenance windows, new features, policy changes) -- distinct from PlatformNotification, which
 * is the internal team's own "something needs attention" feed. v1 scope: Super Admin authors and
 * manages announcements here; `activeForRestaurants()` is the tenant-facing read a restaurant-side
 * app can call to show a banner (not wired into any specific restaurant-facing app in this change --
 * see the Super Admin page's own note on that boundary).
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateAnnouncementDto, actor: PlatformUser) {
    const announcement = await this.prisma.runAsPlatform((tx) =>
      tx.platformAnnouncement.create({
        data: {
          title: dto.title,
          body: dto.body,
          severity: dto.severity,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdById: actor.id
        }
      })
    );
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'ANNOUNCEMENT_PUBLISHED',
      category: 'ANNOUNCEMENTS',
      details: { announcementId: announcement.id, title: announcement.title, severity: announcement.severity }
    });
    return announcement;
  }

  async list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.platformAnnouncement.findMany({
        orderBy: { publishedAt: 'desc' },
        include: { createdBy: { select: { id: true, fullName: true, email: true } } }
      })
    );
  }

  async withdraw(id: string, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.platformAnnouncement.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Announcement not found');
    if (existing.withdrawnAt) throw new ForbiddenException('Already withdrawn');
    const updated = await this.prisma.runAsPlatform((tx) =>
      tx.platformAnnouncement.update({ where: { id }, data: { withdrawnAt: new Date() } })
    );
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'ANNOUNCEMENT_WITHDRAWN',
      category: 'ANNOUNCEMENTS',
      details: { announcementId: id, title: existing.title }
    });
    return updated;
  }

  /** What a restaurant-facing app would call to show a banner: published, not withdrawn, not expired. */
  async activeForRestaurants() {
    const now = new Date();
    return this.prisma.runAsPlatform((tx) =>
      tx.platformAnnouncement.findMany({
        where: { withdrawnAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { publishedAt: 'desc' },
        select: { id: true, title: true, body: true, severity: true, publishedAt: true }
      })
    );
  }
}
