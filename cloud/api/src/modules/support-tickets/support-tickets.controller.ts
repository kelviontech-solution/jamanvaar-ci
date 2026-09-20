import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { PlatformUser, TicketStatus } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';
import { createTicketSchema, updateTicketSchema, addCommentSchema, attachmentSchema } from './dto/ticket.dto';
import { sendAttachment } from './send-attachment';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/support-tickets')
@UseGuards(PlatformAuthGuard)
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Get()
  list(
    @CurrentPlatformUser() actor: PlatformUser,
    @Query('status') status?: TicketStatus,
    @Query('restaurantId') restaurantId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('view') view?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.tickets.list(actor, {
      status,
      restaurantId,
      assignedToId,
      view,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Get('summary')
  summary(@CurrentPlatformUser() actor: PlatformUser) {
    return this.tickets.summary(actor);
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
    return this.tickets.addComment(id, body.body, actor, body.internal === true);
  }

  @Post(':id/attachments')
  async addAttachment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attachmentSchema)) body: ReturnType<typeof attachmentSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    await this.tickets.getById(id);
    return this.tickets.saveAttachment(id, body, { type: 'PLATFORM', name: actor.fullName });
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
    sendAttachment(res, await this.tickets.readAttachment(id, attachmentId));
  }
}
