import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { QrRestaurantPageService } from './qr-restaurant-page.service';
import { restaurantPageSchema, pageCopySchema } from './qr-restaurant-page.schema';
function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const p = schema.safeParse(body);
  if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '));
  return p.data;
}
const revision = z.object({ version: z.number().int().nonnegative() }).strict();
@Controller('api/v1/tenant/qr-page')
@UseGuards(TenantAuthGuard)
export class QrRestaurantPageController {
  constructor(private readonly pages: QrRestaurantPageService) {}
  @Get() editor(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant') {
    return this.pages.editor(u, scope);
  }
  @Put() save(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    const p = parse(revision.extend({ content: restaurantPageSchema }), body);
    return this.pages.save(u, scope, p.version, p.content);
  }
  @Post('copy-preview') previewCopy(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    return this.pages.copy(u, scope, parse(pageCopySchema, body));
  }
  @Post('copy') copy(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    const p = parse(z.object({ input: pageCopySchema, checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), body);
    return this.pages.copy(u, scope, p.input, p.checksum);
  }
  @Get('launch') launch(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant') {
    return this.pages.launch(u, scope);
  }
  @Get('print-data') printData(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant') {
    return this.pages.printData(u, scope);
  }
  @Post('launch') recordLaunch(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    return this.pages.recordLaunch(
      u,
      scope,
      parse(z.object({ orderId: z.string().min(1).max(128), scanned: z.boolean(), kitchenReceived: z.boolean() }).strict(), body)
    );
  }
  @Get('engagement') engagement(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant') {
    return this.pages.engagement(u, scope);
  }
  @Post('publish') publish(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    return this.pages.publish(u, scope, parse(revision, body).version);
  }
  @Post('inherit') inherit(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    return this.pages.inherit(u, scope, parse(revision, body).version);
  }
  @Post('restore') restore(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    const p = parse(revision.extend({ id: z.string().max(150) }), body);
    return this.pages.restoreDraft(u, scope, p.version, p.id);
  }
  @Post('images') image(@CurrentTenantUser() u: User, @Query('scope') scope = 'restaurant', @Body() body: unknown) {
    return this.pages.upload(u, scope, parse(z.object({ image: z.string().max(2000000) }).strict(), body).image);
  }
}
