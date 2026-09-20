import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { User } from '@prisma/client';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { attachmentSchema, tenantCommentSchema, tenantCreateTicketSchema } from './dto/ticket.dto';
import { sendAttachment } from './send-attachment';
import { TenantSupportTicketsService } from './tenant-support-tickets.service';

/** A restaurant raising and following its own support tickets from Restaurant Admin. */
@Controller('api/v1/tenant/support-tickets')
@UseGuards(TenantAuthGuard)
export class TenantSupportTicketsController {
  constructor(private readonly tickets: TenantSupportTicketsService) {}

  @Get()
  list(@CurrentTenantUser() user: User) {
    return this.tickets.list(user);
  }

  @Post()
  create(@CurrentTenantUser() user: User, @Body(new ZodValidationPipe(tenantCreateTicketSchema)) body: ReturnType<typeof tenantCreateTicketSchema.parse>) {
    return this.tickets.create(user, body);
  }

  @Get(':id')
  get(@CurrentTenantUser() user: User, @Param('id') id: string) {
    return this.tickets.get(user, id);
  }

  @Post(':id/comments')
  comment(@CurrentTenantUser() user: User, @Param('id') id: string, @Body(new ZodValidationPipe(tenantCommentSchema)) body: ReturnType<typeof tenantCommentSchema.parse>) {
    return this.tickets.addComment(user, id, body.body);
  }

  @Post(':id/attachments')
  attach(@CurrentTenantUser() user: User, @Param('id') id: string, @Body(new ZodValidationPipe(attachmentSchema)) body: ReturnType<typeof attachmentSchema.parse>) {
    return this.tickets.addAttachment(user, id, body);
  }

  @Get(':id/attachments/:attachmentId')
  async download(@CurrentTenantUser() user: User, @Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
    sendAttachment(res, await this.tickets.readAttachment(user, id, attachmentId));
  }
}
