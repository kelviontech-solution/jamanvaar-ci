import { Body, Controller, Get, Headers, HttpCode, NotFoundException, StreamableFile, Param, Post, Put, Query, Req, Res, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Device } from '@prisma/client';
import type { Request, Response } from 'express';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrRateLimitInterceptor } from './qr-rate-limit';
import { QrSessions } from './qr-session';
import { QrMetrics } from './qr-metrics';
import { QrAdmission } from './qr-resilience';
import { QrResolutionCache } from './qr-resolution-cache';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { QrBusyException } from './qr-resilience';
import { QrAdminService, generateQrSchema, GenerateQr, createTableSchema, CreateTable, updateTableSchema, UpdateTable } from './qr-admin.service';
import { QrPublicService, placeQrOrderSchema, PlaceQrOrder, quoteQrOrderSchema, QuoteQrOrder } from './qr-public.service';
import { qrSettingsSchema, QrSettingsUpdate, qrBrandingSchema, QrBrandingUpdate, qrPrintDesignSchema } from './qr-settings.service';
import { z } from 'zod';
const orderActionSchema = z.object({ action: z.enum(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'COLLECT']), version: z.number().int().min(1), reason: z.string().trim().max(300).optional() }).strict();

/**
 * The customer's endpoints. No login, no device credential: the token in the path is the whole identity, and
 * restaurant, branch and table are derived from it on the server. Nothing here accepts them from the caller.
 */
// The public endpoints use QrRateLimiter (per code, per session, per failed lookup) instead of one per-address number.
@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
@Controller('api/v1/public/qr')
export class QrPublicController {
  constructor(private readonly qr: QrPublicService, private readonly sessions: QrSessions, private readonly publications: MenuPublicationsService) {}

  /** A published menu picture. Its address is the hash of its bytes, so the browser may keep it for a year. */
  @Get('images/:hash')
  async image(@Param('hash') hash: string, @Res({ passthrough: true }) res: Response) {
    const img = await this.publications.image(hash);
    if (!img) throw new NotFoundException('Picture not found');
    res.setHeader('Content-Type', img.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${hash}"`);
    return new StreamableFile(Buffer.from(img.data));
  }

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

  @Post('orders/:publicOrderId/payment')
  @HttpCode(200)
  retryPayment(@Param('publicOrderId') publicOrderId: string) {
    return this.qr.retryPayment(publicOrderId);
  }

  @Post('orders/:publicOrderId/counter-payment')
  @HttpCode(200)
  switchToCounter(@Param('publicOrderId') publicOrderId: string) {
    return this.qr.switchToCounter(publicOrderId);
  }

  @Post('orders/:publicOrderId/verify-payment')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(z.object({ paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/).max(128), signature: z.string().regex(/^[a-f0-9]{64}$/i) }).strict()))
  verifyCheckout(@Param('publicOrderId') publicOrderId: string, @Body() body: { paymentId: string; signature: string }) {
    return this.qr.verifyCheckout(publicOrderId, body);
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
  quote(@Param('token') token: string, @Body() body: QuoteQrOrder, @Req() req: Request & { qrSession?: string }) {
    return this.qr.quote(token, body, req.qrSession);
  }

  @Post(':token/events')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(z.object({ type: z.enum(['QR_CART_CREATED', 'QR_CHECKOUT_STARTED', 'QR_ITEM_ADDED', 'QR_ITEM_VIEWED']),itemId:z.string().max(100).optional() }).strict()))
  event(@Param('token') token: string, @Body() body: { type: 'QR_CART_CREATED' | 'QR_CHECKOUT_STARTED' | 'QR_ITEM_ADDED' | 'QR_ITEM_VIEWED';itemId?:string }, @Req() req: Request & { qrSession?: string }) {
    return this.qr.guestEvent(token, body.type, req.qrSession,body.itemId);
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
    return this.qr.overview(device.restaurantId, device.branchId);
  }

  @Get('branches')
  branches(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.listBranches(device.restaurantId, device.branchId);
  }

  @Get('tables')
  tables(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.listTables(device.restaurantId, device.branchId);
  }

  @Post('tables')
  @UsePipes(new ZodValidationPipe(createTableSchema))
  createTable(@CurrentDevice() device: Device, @Body() body: CreateTable) {
    this.qr.assertConsole(device);
    return this.qr.createTable(device, body);
  }

  @Put('tables/:tableId')
  @UsePipes(new ZodValidationPipe(updateTableSchema))
  updateTable(@CurrentDevice() device: Device, @Param('tableId') tableId: string, @Body() body: UpdateTable) {
    this.qr.assertConsole(device);
    return this.qr.updateTable(device, tableId, body);
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
    return this.qr.printData(device.restaurantId, id, device.branchId);
  }

  @Get('orders')
  orders(@CurrentDevice() device: Device, @Query('branchId') branchId?: string, @Query('limit') limit?: string) {
    this.qr.assertConsole(device);
    return this.qr.listOrders(device.restaurantId, { branchId: this.qr.scopedBranch(device, branchId), limit: limit ? Number(limit) : undefined });
  }

  @Post('orders/:id/action')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(orderActionSchema))
  orderAction(@CurrentDevice() device: Device, @Param('id') id: string, @Body() body: z.infer<typeof orderActionSchema>) {
    this.qr.assertConsole(device);
    return this.qr.manageOrder(device, id, body);
  }

  @Get('analytics')
  analytics(@CurrentDevice() device: Device, @Query('from') from?: string, @Query('to') to?: string, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.analytics(device, from, to, branchId);
  }

  @Post('settings/inherit')
  @HttpCode(200)
  inherit(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.inheritSettings(device, branchId);
  }

  @Get('tables/:tableId/orders')
  tableOrders(@CurrentDevice() device: Device, @Param('tableId') tableId: string) {
    this.qr.assertConsole(device);
    return this.qr.tableOrders(device.restaurantId, tableId, device.branchId);
  }

  @Get('branding')
  branding(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.getBranding(device.restaurantId);
  }

  @Get('print-design')
  printDesign(@CurrentDevice() device: Device) {
    this.qr.assertConsole(device);
    return this.qr.getPrintDesign(device.restaurantId);
  }

  @Put('print-design')
  @UsePipes(new ZodValidationPipe(qrPrintDesignSchema))
  savePrintDesign(@CurrentDevice() device: Device, @Body() body: z.infer<typeof qrPrintDesignSchema>) {
    this.qr.assertConsole(device);
    return this.qr.savePrintDesign(device, body);
  }

  @Put('branding')
  @UsePipes(new ZodValidationPipe(qrBrandingSchema))
  updateBranding(@CurrentDevice() device: Device, @Body() body: QrBrandingUpdate) {
    this.qr.assertConsole(device);
    return this.qr.updateBranding(device, body);
  }

  @Get('settings')
  getSettings(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.getSettings(device.restaurantId, this.qr.scopedBranch(device, branchId));
  }

  @Get('settings/payment-readiness')
  paymentReadiness(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.paymentReadiness(device.restaurantId, this.qr.scopedBranch(device, branchId));
  }

  @Put('settings')
  @UsePipes(new ZodValidationPipe(qrSettingsSchema))
  putSettings(@CurrentDevice() device: Device, @Body() body: QrSettingsUpdate, @Query('branchId') branchId?: string) {
    this.qr.assertConsole(device);
    return this.qr.updateSettings(device, body, branchId);
  }
}

/** Operating figures for platform staff: this instance's request outcomes, latency, admission control and caches. */
@Controller('api/v1/qr-ordering/runtime')
@UseGuards(PlatformAuthGuard)
export class QrRuntimeController {
  constructor(private readonly metrics: QrMetrics, private readonly admission: QrAdmission, private readonly cache: QrResolutionCache<{ restaurant: { id: string } }>) {}

  @Get()
  runtime() {
    return { ...this.metrics.snapshot(), admission: this.admission.stats, resolutionCache: this.cache.stats };
  }
}
