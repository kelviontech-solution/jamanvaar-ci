import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { BranchesService } from './branches.service';
import { createBranchSchema, updateBranchSchema } from './dto/branch.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/branches')
@UseGuards(PlatformAuthGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@Query('restaurantId') restaurantId?: string) {
    return this.branches.list(restaurantId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createBranchSchema))
  create(@Body() body: ReturnType<typeof createBranchSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.branches.create(body, actor);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateBranchSchema))
  update(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateBranchSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.branches.update(id, body, actor);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.branches.setStatus(id, 'ACTIVE', actor);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.branches.setStatus(id, 'INACTIVE', actor);
  }
}
