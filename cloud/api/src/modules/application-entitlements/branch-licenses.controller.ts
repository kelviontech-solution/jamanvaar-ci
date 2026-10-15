import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { z } from 'zod';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchLicensesService } from './branch-licenses.service';
const schema = z
  .object({
    appCode: z.enum(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING', 'WHATSAPP_ORDERING']),
    enabled: z.boolean(),
    deviceQuota: z.number().int().min(0).max(10000).nullable(),
    disabledFeatures: z.array(z.string().min(1).max(100)).max(100),
    effectiveAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    expectedRevision: z.number().int().min(0),
    acknowledgeImpact: z.boolean().optional(),
    previewHash: z.string().length(64).optional()
  })
  .strict();
@UseGuards(PlatformAuthGuard)
@Controller('api/v1/branches/:branchId/licenses')
export class BranchLicensesController {
  constructor(private readonly licenses: BranchLicensesService) {}
  @Get() list(@Param('branchId') id: string) {
    return this.licenses.list(id);
  }
  @Post('preview') @UsePipes(new ZodValidationPipe(schema)) preview(
    @Param('branchId') id: string,
    @Body() body: z.infer<typeof schema>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.licenses.preview(id, body, actor);
  }
  @Post() @UsePipes(new ZodValidationPipe(schema)) save(
    @Param('branchId') id: string,
    @Body() body: z.infer<typeof schema>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.licenses.save(id, body, actor);
  }
  @Post(':id/cancel') cancel(@Param('branchId') branchId: string, @Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.licenses.cancel(branchId, id, actor);
  }
}
