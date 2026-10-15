import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { OwnersService } from './owners.service';
import { updateOwnerSchema, resetOwnerPasswordSchema } from './dto/owner.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/owners')
@UseGuards(PlatformAuthGuard)
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get()
  list() {
    return this.owners.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.owners.getById(id);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateOwnerSchema))
  update(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateOwnerSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.owners.update(id, body, actor);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.owners.setStatus(id, 'ACTIVE', actor);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.owners.setStatus(id, 'DISABLED', actor);
  }

  @Post(':id/reset-password')
  @UsePipes(new ZodValidationPipe(resetOwnerPasswordSchema))
  resetPassword(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof resetOwnerPasswordSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.owners.resetPassword(id, body.password.trim(), actor);
  }
}
