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
import {
  QrOperationsService,
  qrOperationsSchema,
} from "./qr-operations.service";
@Controller("api/v1/restaurant/qr/operations")
@UseGuards(DeviceAuthGuard)
export class QrOperationsController {
  constructor(private readonly ops: QrOperationsService) {}
  @Get() configuration(@CurrentDevice() d: Device) {
    return this.ops.configuration(d);
  }
  @Put()
  @UsePipes(
    new ZodValidationPipe(
      z
        .object({
          changes: qrOperationsSchema,
          version: z.number().int().min(0),
        })
        .strict(),
    ),
  )
  update(
    @CurrentDevice() d: Device,
    @Body() b: { changes: z.infer<typeof qrOperationsSchema>; version: number },
  ) {
    return this.ops.update(d, b.changes, b.version);
  }
  @Get("analytics") analytics(
    @CurrentDevice() d: Device,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.ops.analytics(d, from, to);
  }
  @Get("health") health(@CurrentDevice() d: Device) {
    return this.ops.health(d);
  }
  @Get("requests") requests(@CurrentDevice() d: Device) {
    return this.ops.staffRequests(d);
  }
  @Post("requests/:id/action")
  @HttpCode(200)
  @UsePipes(
    new ZodValidationPipe(
      z
        .object({
          status: z.enum([
            "ACKNOWLEDGED",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
          ]),
          version: z.number().int().positive(),
          assignedDeviceId: z.string().uuid().optional(),
        })
        .strict(),
    ),
  )
  action(
    @CurrentDevice() d: Device,
    @Param("id") id: string,
    @Body() b: { status: string; version: number; assignedDeviceId?: string },
  ) {
    return this.ops.act(d, id, b);
  }
}
@Controller("api/v1/public/qr/:token/operations")
@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
export class QrOperationsPublicController {
  constructor(
    private readonly ops: QrOperationsService,
    private readonly qr: QrPublicService,
  ) {}
  @Get() async options(@Param("token") t: string) {
    return this.ops.publicOptions(await this.qr.resolve(t));
  }
  @Get("requests") async requests(
    @Param("token") t: string,
    @Req() req: { qrSession?: string },
  ) {
    return this.ops.requests(await this.qr.resolve(t), req.qrSession);
  }
  @Post("requests")
  @UsePipes(
    new ZodValidationPipe(
      z
        .object({
          typeId: z.string().regex(/^[A-Z0-9_-]{1,30}$/),
          note: z.string().trim().max(300).optional(),
          idempotencyKey: z
            .string()
            .min(8)
            .max(80)
            .regex(/^[\w-]+$/),
        })
        .strict(),
    ),
  )
  async request(
    @Param("token") t: string,
    @Req() req: { qrSession?: string },
    @Body() b: { typeId: string; note?: string; idempotencyKey: string },
  ) {
    return this.ops.createRequest(await this.qr.resolve(t), req.qrSession, b);
  }
  @Get("slots") async slots(@Param("token") t: string) {
    return this.ops.slots(await this.qr.resolve(t));
  }
}
