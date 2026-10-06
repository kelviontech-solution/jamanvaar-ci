import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { DeviceSyncThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { StaffApprovalService } from './staff-approval.service';

const verifySchema = z.object({ pin: z.string().regex(/^\d{4,8}$/) }).strict();
const approvalSchema = verifySchema.extend({ scope: z.object({ action: z.literal('REFUND'), paymentId: z.string().uuid(), amountPaise: z.number().int().positive(), idempotencyKey: z.string().min(8).max(128) }).strict().optional() });

@DeviceSyncThrottle()
@Controller('api/v1/staff')
@UseGuards(DeviceAuthGuard)
export class StaffApprovalController {
  constructor(private readonly approval: StaffApprovalService) {}

  /** Is this a manager PIN? Lets a terminal that holds no PIN hashes (the public kiosk) ask the server. */
  @Post('verify-manager-pin')
  @UsePipes(new ZodValidationPipe(approvalSchema))
  verify(@Body() body: z.infer<typeof approvalSchema>, @CurrentDevice() device: Device) {
    return this.approval.verifyManagerPin(device, body.pin, body.scope);
  }

  /** A staff member signs in on this terminal (POS, Captain, KDS). Returns the signed session the terminal stamps onto what it does. */
  @Post('sign-in')
  @UsePipes(new ZodValidationPipe(verifySchema))
  signIn(@Body() body: z.infer<typeof verifySchema>, @CurrentDevice() device: Device) {
    return this.approval.signIn(device, body.pin);
  }
}
