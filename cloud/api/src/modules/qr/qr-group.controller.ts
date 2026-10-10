import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { QrRateLimitInterceptor } from "./qr-rate-limit";
import { qrOrderLineSchema } from "./qr-public.service";
import { QrGroupService } from "./qr-group.service";
const linesSchema = z
  .object({
    items: z.array(qrOrderLineSchema).max(50),
    version: z.number().int().min(0),
  })
  .strict();
const submitSchema = z
  .object({
    version: z.number().int().positive(),
    paymentMethod: z.enum(["CASH_AT_COUNTER", "ONLINE"]),
    expectedTotalPaise: z.number().int().min(0),
  })
  .strict();
@Controller("api/v1/public/qr/:token/groups")
@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
export class QrGroupController {
  constructor(private readonly groups: QrGroupService) {}
  @Post() create(
    @Param("token") token: string,
    @Req() req: { qrSession?: string },
  ) {
    return this.groups.create(token, req.qrSession);
  }
  @Get(":id") read(
    @Param("token") token: string,
    @Param("id") id: string,
    @Req() req: { qrSession?: string },
  ) {
    return this.groups.read(token, id, req.qrSession);
  }
  @Post(":id/join") @HttpCode(200) join(
    @Param("token") token: string,
    @Param("id") id: string,
    @Req() req: { qrSession?: string },
  ) {
    return this.groups.join(token, id, req.qrSession);
  }
  @Put(":id/items") @UsePipes(new ZodValidationPipe(linesSchema)) items(
    @Param("token") token: string,
    @Param("id") id: string,
    @Req() req: { qrSession?: string },
    @Body() body: z.infer<typeof linesSchema>,
  ) {
    return this.groups.contribution(
      token,
      id,
      body.items,
      body.version,
      req.qrSession,
    );
  }
  @Post(":id/leave") @HttpCode(200) leave(
    @Param("token") token: string,
    @Param("id") id: string,
    @Req() req: { qrSession?: string },
  ) {
    return this.groups.leave(token, id, req.qrSession);
  }
  @Post(":id/submit") @UsePipes(new ZodValidationPipe(submitSchema)) submit(
    @Param("token") token: string,
    @Param("id") id: string,
    @Req() req: { qrSession?: string },
    @Body() body: z.infer<typeof submitSchema>,
  ) {
    return this.groups.submit(
      token,
      id,
      body.version,
      body.paymentMethod,
      body.expectedTotalPaise,
      req.qrSession,
    );
  }
}
