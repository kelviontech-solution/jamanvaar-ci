import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Device } from "@prisma/client";
import { z } from "zod";
import { CurrentDevice } from "../../common/decorators/current-device.decorator";
import { DeviceAuthGuard } from "../../common/guards/device-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { QrRateLimitInterceptor } from "./qr-rate-limit";
import { QrPublicService } from "./qr-public.service";
import { QrAdvancedService, qrAdvancedSchema } from "./qr-advanced.service";
import { QrPromotionsService, promotionSchema } from "./qr-promotions.service";
import { QrLoyaltyService } from "./qr-loyalty.service";
const updateSchema = z
  .object({ changes: qrAdvancedSchema, version: z.number().int().min(0) })
  .strict();
const cashSchema = z
  .object({
    amountPaise: z.number().int().positive(),
    version: z.number().int().positive(),
    idempotencyKey: z
      .string()
      .min(8)
      .max(80)
      .regex(/^[\w-]+$/),
  })
  .strict();
const feedbackSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    categories: z
      .array(z.enum(["FOOD", "ACCURACY", "SERVICE", "OVERALL"]))
      .max(4)
      .optional(),
  })
  .strict();
const propagationSchema = z
  .object({
    changes: qrAdvancedSchema,
    branchIds: z.array(z.string().uuid()).min(1).max(200),
    versions: z.record(z.number().int().min(0)).optional(),
  })
  .strict();

@Controller("api/v1/restaurant/qr/advanced")
@UseGuards(DeviceAuthGuard)
export class QrAdvancedController {
  constructor(
    private readonly advanced: QrAdvancedService,
    private readonly promotions: QrPromotionsService,
  ) {}
  @Get("promotions") promotionsList(@CurrentDevice() device: Device) {
    return this.promotions.list(device);
  }
  @Post("promotions")
  @UsePipes(new ZodValidationPipe(promotionSchema))
  createPromotion(
    @CurrentDevice() device: Device,
    @Body() body: z.infer<typeof promotionSchema>,
  ) {
    return this.promotions.save(device, body);
  }
  @Put("promotions/:id")
  @UsePipes(
    new ZodValidationPipe(
      z
        .object({
          promotion: promotionSchema,
          version: z.number().int().positive(),
        })
        .strict(),
    ),
  )
  updatePromotion(
    @CurrentDevice() device: Device,
    @Param("id") id: string,
    @Body()
    body: { promotion: z.infer<typeof promotionSchema>; version: number },
  ) {
    return this.promotions.save(device, body.promotion, id, body.version);
  }
  @Get() configuration(@CurrentDevice() device: Device) {
    return this.advanced.configuration(device);
  }
  @Get("stock") stock(@CurrentDevice() device:Device,@Query('branchId') branchId?:string){return this.advanced.countedStock(device,branchId);}
  @Put() @UsePipes(new ZodValidationPipe(updateSchema)) update(
    @CurrentDevice() device: Device,
    @Body() body: z.infer<typeof updateSchema>,
  ) {
    return this.advanced.update(device, body.changes, body.version);
  }
  @Post("inherit")
  @HttpCode(200)
  @UsePipes(
    new ZodValidationPipe(
      z.object({ version: z.number().int().min(0) }).strict(),
    ),
  )
  inherit(@CurrentDevice() device: Device, @Body() body: { version: number }) {
    return this.advanced.inherit(device, body.version);
  }
  @Post("propagation")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(propagationSchema))
  propagate(
    @CurrentDevice() device: Device,
    @Body() body: z.infer<typeof propagationSchema>,
  ) {
    return this.advanced.propagation(
      device,
      body.changes,
      body.branchIds,
      body.versions,
    );
  }
  @Get("feedback") feedback(@CurrentDevice() device: Device, @Query("from") from?: string, @Query("to") to?: string, @Query("rating") rating?: string) {
    return this.advanced.feedbackReport(device, { from, to, rating });
  }
  @Get("notifications") notifications(@CurrentDevice() device: Device) {
    return this.advanced.notifications(device);
  }
  @Get("orders/:id/ledger") ledger(
    @CurrentDevice() device: Device,
    @Param("id") id: string,
  ) {
    return this.advanced.ledger(device, id);
  }
  @Post("orders/:id/cash")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(cashSchema))
  cash(
    @CurrentDevice() device: Device,
    @Param("id") id: string,
    @Body() body: z.infer<typeof cashSchema>,
  ) {
    return this.advanced.collect(device, id, body);
  }
  @Post("orders/:id/refund-cash")
  @HttpCode(200)
  @UsePipes(
    new ZodValidationPipe(
      cashSchema.extend({ reason: z.string().trim().min(3).max(300) }),
    ),
  )
  refundCash(
    @CurrentDevice() device: Device,
    @Param("id") id: string,
    @Body() body: z.infer<typeof cashSchema> & { reason: string },
  ) {
    return this.advanced.refund(device, id, body);
  }
}

@Controller("api/v1/public/qr")
@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
export class QrAdvancedPublicController {
  constructor(
    private readonly advanced: QrAdvancedService,
    private readonly qr: QrPublicService,
    private readonly loyalty: QrLoyaltyService,
  ) {}
  @Get(":token/loyalty") async loyaltyAccount(
    @Param("token") token: string,
    @Req() req: { qrSession?: string },
  ) {
    const ctx = await this.qr.resolve(token);
    return this.loyalty.account(
      ctx.restaurant.id,
      ctx.branch.id,
      req.qrSession,
    );
  }
  @Post(":token/loyalty/send-code")
  @HttpCode(200)
  @UsePipes(
    new ZodValidationPipe(z.object({ phone: z.string().max(20) }).strict()),
  )
  async sendCode(
    @Param("token") token: string,
    @Req() req: { qrSession?: string },
    @Body() body: { phone: string },
  ) {
    const ctx = await this.qr.resolve(token);
    return this.loyalty.sendOtp(
      ctx.restaurant.id,
      ctx.branch.id,
      body.phone,
      req.qrSession,
    );
  }
  @Post(":token/loyalty/verify")
  @HttpCode(200)
  @UsePipes(
    new ZodValidationPipe(
      z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
    ),
  )
  async verifyCode(
    @Param("token") token: string,
    @Req() req: { qrSession?: string },
    @Body() body: { code: string },
  ) {
    const ctx = await this.qr.resolve(token);
    return this.loyalty.verify(
      ctx.restaurant.id,
      ctx.branch.id,
      body.code,
      req.qrSession,
    );
  }
  @Get(":token/history") async history(
    @Param("token") token: string,
    @Req() req: { qrSession?: string },
  ) {
    const ctx = await this.qr.resolve(token);
    return this.advanced.history(
      ctx.restaurant.id,
      ctx.branch.id,
      req.qrSession,
    );
  }
  @Post("orders/:publicOrderId/feedback")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(feedbackSchema))
  feedback(
    @Param("publicOrderId") id: string,
    @Body() body: z.infer<typeof feedbackSchema>,
  ) {
    return this.advanced.feedback(id, body);
  }
}
