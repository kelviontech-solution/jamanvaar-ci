import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Observable, Subject, concat, concatMap, filter, from, interval, map, merge, of, takeUntil, tap } from 'rxjs';
import { DeviceAuthGuard } from '../guards/device-auth.guard';
import { CurrentDevice } from '../decorators/current-device.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeBus } from './realtime-bus';

const PING_MS = 25_000;

/**
 * One long-lived stream per device. The device authenticated with its own credential, so what it may
 * hear about (its restaurant, its branch, commands addressed to it) is derived from that, never from
 * anything the client sends. The stream re-checks the device periodically and ends when it is revoked.
 */
@Controller('api/v1/realtime')
@UseGuards(DeviceAuthGuard)
export class RealtimeController {
  constructor(
    private readonly bus: RealtimeBus,
    private readonly prisma: PrismaService
  ) {}

  @Sse('stream')
  stream(@CurrentDevice() device: Device): Observable<MessageEvent> {
    const recheckMs = Number(process.env.REALTIME_RECHECK_MS) || 30_000;
    const stop$ = new Subject<void>();

    const changes$ = this.bus.events$.pipe(
      filter((e) => RealtimeBus.isVisibleTo(e, device)),
      map((e): MessageEvent => ({ type: e.kind === 'command' ? 'command' : 'change', data: { kind: e.kind, seq: e.seq ?? null } }))
    );
    const pings$ = interval(PING_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })));

    // Re-verify the credential: a revoked, locked-out or removed device must not keep listening.
    const status$ = interval(recheckMs).pipe(
      concatMap(async () => {
        const row = await this.prisma.runAsPlatform((tx) => tx.device.findUnique({ where: { id: device.id }, select: { status: true, isLocked: true, branchId: true, restaurant: { select: { status: true, deletedAt: true } }, branch: { select: { status: true } } } }));
        const allowed = row?.status === 'ACTIVE' && !row.isLocked && row.branchId === device.branchId && row.restaurant.status === 'ACTIVE' && !row.restaurant.deletedAt && (!row.branch || row.branch.status === 'ACTIVE');
        return allowed ? null : ({ type: 'revoked', data: { reason: 'DEVICE_SCOPE_CHANGED' } } as MessageEvent);
      }),
      filter((m): m is MessageEvent => m !== null),
      tap(() => setTimeout(() => stop$.next(), 50))
    );

    return concat(
      of({ type: 'ready', data: { deviceId: device.id, serverTime: new Date().toISOString() } } as MessageEvent),
      merge(changes$, pings$, status$).pipe(takeUntil(stop$))
    );
  }
}
