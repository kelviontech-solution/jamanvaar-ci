import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Device } from '@prisma/client';
import type { Request, Response } from 'express';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrRateLimitInterceptor } from './qr-rate-limit';
import { QrSessions } from './qr-session';
import { QrBusyException } from './qr-resilience';
import { QrAdminService, generateQrSchema, GenerateQr } from './qr-admin.service';
import { QrPublicService, placeQrOrderSchema, PlaceQrOrder, quoteQrOrderSchema, QuoteQrOrder } from './qr-public.service';
import { qrSettingsSchema, QrSettingsUpdate } from './qr-settings.service';

/**
 * The customer's endpoints. No login, no device credential: the token in the path is the whole identity, and
 * restaurant, branch and table are derived from it on the server. Nothing here accepts them from the caller.
 */
// The public endpoints use QrRateLimiter (per code, per session, per failed lookup) instead of one per-address number.
@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
@Controller('api/v1/public/qr')
export class QrPublicController {
  constructor(private readonly qr: QrPublicService, private readonly sessions: QrSessions) {}

  /** A signed customer session for this browser. Called once; the guest page keeps it and sends it back. */
  @Post('session')
  @HttpCode(200)
  session() {
    return { session: this.sessions.issue() };
  }

  // Declared before ':token' routes so "orders" is never read as a token.
  @Get('orders/:publicOrderId')
  status(@Param('publicOrderId') publicOrderId: string) {
    return this.qr.orderStatus(publicOrderId);
  }

  @Get(':token')
  describe(@Param('token') token: string, @Req() req: Request & { qrSession?: string }) {
    return this.qr.describe(token, req.qrSession);
  }

  @Get(':token/menu')
  async menu(@Param('token') token: string, @Req() req: Request & { qrSession?: string }, @Res({ passthrough: true }) res: Response) {
    const menu = await this.qr.menu(token, req.qrSession);
    res.setHeader('ETag', `"${menu.etag}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (req.headers['if-none-match'] === `"${menu.etag}"`) {
      res.status(304);
      return;
    }
    return menu;
  }

  @Post(':token/quote')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(quoteQrOrderSchema))
  quote(@Param('token') token: string, @Body() body: QuoteQrOrder) {
    return this.qr.quote(token, body);
  }

  @Post(':token/orders')
  @UsePipes(new ZodValidationPipe(placeQrOrderSchema))
  async place(@Param('token') token: string, @Body() body: PlaceQrOrder, @Req() req: Request & { qrSession?: string }, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.qr.placeOrder(token, body, req.qrSession);
    } catch (e) {
      if (e instanceof QrBusyException) res.setHeader('Retry-After', String(e.retryAfterSeconds));
      throw e;
    }
  }
}

/** Restaurant Admin's QR management. The restaurant is the authenticated console's own; there is no restaurant id in any request. */
@Controller('api/v1/restaurant/qr')
@UseGuards(DeviceAuthGuard)
export class QrRestaurantController {
  constructor(private readonly qr: QrAdminService) {}

  @Get('entitlement')
  entitlement(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.entitlement(device.restaurantId);
  }

  @Get('overview')
  overview(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.overview(device.restaurantId);
  }

  @Get('branches')
  branches(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.listBranches(device.restaurantId);
  }

  @Get('tables')
  tables(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.listTables(device.restaurantId);
  }

  @Post('tables/:tableId/generate')
  @UsePipes(new ZodValidationPipe(generateQrSchema.omit({ tableId: true })))
  generate(@CurrentDevice() device: Device, @Param('tableId') tableId: string, @Body() body: Omit<GenerateQr, 'tableId'>) {
    this.qr.assertConsole(device);
    return this.qr.generate(device, { ...body, tableId });
  }

  /** A menu-only code (no table), for a menu card. */
  @Post('menu-codes')
  @UsePipes(new ZodValidationPipe(generateQrSchema))
  menuCode(@CurrentDevice() device: Device, @Body() body: GenerateQr) {
    this.qr.assertConsole(device);
    return this.qr.generate(device, { ...body, mode: 'MENU_ONLY', tableId: undefined });
  }

  @Post('codes/:id/regenerate')
  @HttpCode(201)
  regenerate(@CurrentDevice() device: Device, @Param('id') id: string) {
    this.qr.assertConsole(device);
    return this.qr.regenerate(device, id);
  }

  @Post('codes/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentDevice() device: Device, @Param('id') id: string) {
    this.qr.assertConsole(device);
    return this.qr.revoke(device, id);
  }

  @Post('codes/:id/disable')
  @HttpCode(200)
  disable(@CurrentDevice() device: Device, @Param('id') id: string) {
    this.qr.assertConsole(device);
    return this.qr.disable(device, id);
  }

  @Post('codes/:id/enable')
  @HttpCode(200)
  enable(@CurrentDevice() device: Device, @Param('id') id: string) {
    this.qr.assertConsole(device);
    return this.qr.enable(device, id);
  }

  @Get('codes/:id/print-data')
  printData(@CurrentDevice() device: Device, @Param('id') id: string) {
    this.qr.assertConsole(device);
    return this.qr.printData(device.restaurantId, id);
  }

  @Get('orders')
  orders(@CurrentDevice() device: Device, @Query('branchId') branchId?: string, @Query('limit') limit?: string) {
    this.qr.assertConsole(device);
    return this.qr.listOrders(device.restaurantId, { branchId, limit: limit ? Number(limit) : undefined });
  }

  @Get('settings')
  getSettings(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.getSettings(device.restaurantId, branchId);
  }

  @Put('settings')
  @UsePipes(new ZodValidationPipe(qrSettingsSchema))
  putSettings(@CurrentDevice() device: Device, @Body() body: QrSettingsUpdate, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.updateSettings(device, body, branchId);
  }
}
