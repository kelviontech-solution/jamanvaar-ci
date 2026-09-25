import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { displayScaleSchema } from './dto/display-scale.dto';
import { TenantAuthService } from './tenant-auth.service';
import {
  createTenantStaffUserSchema,
  setInitialPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setTenantUserStatusSchema,
  tenantChangePasswordSchema,
  tenantLoginSchema,
  activateDeviceSchema,
  tenantRefreshSchema,
  loginOwnerSchema,
  forgotPasswordOwnerSchema,
  resetPasswordOwnerSchema,
  TenantLoginDto,
  ActivateDeviceDto,
  TenantRefreshDto,
  LoginOwnerDto,
  ForgotPasswordOwnerDto,
  ResetPasswordOwnerDto
} from './dto/login.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { readActivePlatformNotice } from '../../common/platform-notice';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

const REFRESH_COOKIE = 'jamanvaar_tenant_refresh';

@Controller('api/v1/tenant-auth')
export class TenantAuthController {
  constructor(
    private readonly authService: TenantAuthService,
    private readonly config: ConfigService
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/api/v1/tenant-auth'
    });
  }

  @Post('set-initial-password')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(setInitialPasswordSchema))
  async setInitialPassword(
    @Body() body: { restaurantId: string; email: string; activationToken: string; newPassword: string }
  ) {
    await this.authService.setInitialPassword(body.restaurantId, body.email, body.activationToken, body.newPassword);
    return { success: true };
  }

  /** "Forgot password", step 1 (BUG-142). Always the same answer, so it cannot be used to find out who has an account. */
  @Post('forgot-password')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: { restaurantId: string; email: string }) {
    await this.authService.requestPasswordReset(body.restaurantId, body.email);
    return { success: true, message: 'If that email belongs to an account, a 6-digit code has been sent to it.' };
  }

  /** "Forgot password", step 2: the emailed code and the new password. */
  @Post('reset-password')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(@Body() body: { restaurantId: string; email: string; otp: string; newPassword: string }) {
    await this.authService.resetPassword(body.restaurantId, body.email, body.otp, body.newPassword);
    return { success: true };
  }

  /** Restaurant-code forgot-password, step 1 (spec section 6/34): resolves the code to the owner and masks their email for display. */
  @Post('forgot-password-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(forgotPasswordOwnerSchema))
  async forgotPasswordOwner(@Body() body: ForgotPasswordOwnerDto) {
    return this.authService.forgotPasswordOwner(body.restaurantCode);
  }

  /** Restaurant-code forgot-password, step 2: the emailed code and the new password. */
  @Post('reset-password-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resetPasswordOwnerSchema))
  async resetPasswordOwner(@Body() body: ResetPasswordOwnerDto) {
    await this.authService.resetPasswordOwner(body.restaurantCode, body.otp, body.newPassword);
    return { success: true };
  }

  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(tenantLoginSchema))
  async login(
    @Body() body: TenantLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);
    if (result.status === 'LOGIN_SUCCESS') {
      this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      if (body.returnRefreshToken) {
        return { ...result, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
      }
      const { refreshToken, refreshTokenExpiresAt, ...withoutRefreshToken } = result;
      return withoutRefreshToken;
    }
    return result;
  }

  @Post('login-owner')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginOwnerSchema))
  async loginOwner(
    @Body() body: LoginOwnerDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.loginOwner(body);
    if (result.status === 'LOGIN_SUCCESS') {
      this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      if (body.returnRefreshToken) {
        return { ...result, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
      }
      const { refreshToken, refreshTokenExpiresAt, ...withoutRefreshToken } = result;
      return withoutRefreshToken;
    }
    return result;
  }

  @Post('activate-device')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(activateDeviceSchema))
  async activateDevice(
    @Body() body: ActivateDeviceDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.activateDevice(body);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(tenantRefreshSchema))
  async refresh(
    @Req() req: Request,
    @Body() body: TenantRefreshDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? body.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    if (body.refreshToken) {
      return { accessToken: result.accessToken, user: result.user, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
    }
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(TenantAuthGuard)
  async logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
    @CurrentTenantUser() user: User
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? body?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken, user.restaurantId, user.id);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/tenant-auth' });
    return { success: true };
  }
}

/** GET /api/v1/tenant/me + entitlements — the tenant-side counterpart of PlatformMeController. */
@Controller('api/v1/tenant')
@UseGuards(TenantAuthGuard)
export class TenantMeController {
  constructor(
    private readonly authService: TenantAuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /** The platform announcement (maintenance etc.) to show at the top of Restaurant Admin, or null. */
  @Get('platform-notice')
  async platformNotice() {
    return { notice: await readActivePlatformNotice(this.prisma) };
  }

  @Get('me')
  me(@CurrentTenantUser() user: User) {
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      branchId: user.branchId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status
    };
  }

  /** The default display size for this restaurant's terminals (BUG-008). */
  @Get('me/display')
  async display(@CurrentTenantUser() user: User) {
    const restaurant = await this.prisma.runAsTenant(user.restaurantId, (tx) =>
      tx.restaurant.findUniqueOrThrow({ where: { id: user.restaurantId }, select: { displayScalePercent: true } })
    );
    return { displayScalePercent: restaurant.displayScalePercent };
  }

  /** Owner or manager: change it. Terminals pick it up with their next heartbeat. */
  @Patch('me/display')
  @UsePipes(new ZodValidationPipe(displayScaleSchema))
  async setDisplay(@Body() body: ReturnType<typeof displayScaleSchema.parse>, @CurrentTenantUser() user: User) {
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new ForbiddenException('Only an owner or manager can change the display size.');
    }
    const updated = await this.prisma.runAsTenant(user.restaurantId, (tx) =>
      tx.restaurant.update({ where: { id: user.restaurantId }, data: { displayScalePercent: body.displayScalePercent }, select: { displayScalePercent: true } })
    );
    await this.audit.log({
      actorType: 'TENANT',
      actorId: user.id,
      restaurantId: user.restaurantId,
      action: 'DISPLAY_SCALE_CHANGED',
      category: 'SETTINGS',
      details: { displayScalePercent: body.displayScalePercent }
    });
    return { displayScalePercent: updated.displayScalePercent };
  }

  @Get('me/entitlements')
  entitlements(@CurrentTenantUser() user: User) {
    return this.authService.getEntitlements(user.restaurantId);
  }

  @Patch('me/password')
  @UsePipes(new ZodValidationPipe(tenantChangePasswordSchema))
  async changePassword(
    @Body() body: ReturnType<typeof tenantChangePasswordSchema.parse>,
    @CurrentTenantUser() user: User
  ) {
    await this.authService.changePassword(user, body.currentPassword, body.newPassword);
    return { success: true };
  }

  /** Every login this restaurant has (owner + any self-service staff/device logins). */
  @Get('me/users')
  listUsers(@CurrentTenantUser() user: User) {
    return this.authService.listUsers(user.restaurantId);
  }

  /** Owner-only: generate an id + password login for another app/device (Captain, etc.) — shown once. */
  @Post('me/users')
  @UsePipes(new ZodValidationPipe(createTenantStaffUserSchema))
  createUser(
    @Body() body: ReturnType<typeof createTenantStaffUserSchema.parse>,
    @CurrentTenantUser() user: User
  ) {
    return this.authService.createStaffUser(user, body);
  }

  /** Owner-only: disable/re-enable a login this restaurant issued. */
  @Patch('me/users/:id/status')
  @UsePipes(new ZodValidationPipe(setTenantUserStatusSchema))
  setUserStatus(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof setTenantUserStatusSchema.parse>,
    @CurrentTenantUser() user: User
  ) {
    return this.authService.setUserStatus(user, id, body.status);
  }
}
