import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser, TicketStatus } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';
import { createTicketSchema, updateTicketSchema, addCommentSchema } from './dto/ticket.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/support-tickets')
@UseGuards(PlatformAuthGuard)
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Get()
  list(
    @Query('status') status?: TicketStatus,
    @Query('restaurantId') restaurantId?: string,
    @Query('assignedToId') assignedToId?: string
  ) {
    return this.tickets.list({ status, restaurantId, assignedToId });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.tickets.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createTicketSchema))
  create(
    @Body() body: ReturnType<typeof createTicketSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.tickets.create(body, actor);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateTicketSchema))
  update(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateTicketSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.tickets.update(id, body, actor);
  }

  @Post(':id/comments')
  @UsePipes(new ZodValidationPipe(addCommentSchema))
  addComment(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof addCommentSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.tickets.addComment(id, body.body, actor);
  }
}
