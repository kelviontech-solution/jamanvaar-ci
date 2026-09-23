import { permissionsForRole, PlatformRoleName } from '../../common/rbac/access';
import { describeLocation } from '../../common/security/geo';
import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PlatformUser } from '@prisma/client';
import { PlatformAuthService } from './platform-auth.service';
import { changePasswordSchema, loginSchema, verifyOtpSchema, resendOtpSchema } from './dto/login.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { CurrentPlatformSession } from '../../common/decorators/current-platform-session.decorator';

const REFRESH_COOKIE = 'jamanvaar_platform_refresh';

@Controller('api/v1/platform-auth')
export class PlatformAuthController {
  constructor(
    private readonly authService: PlatformAuthService,
    private readonly config: ConfigService
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/api/v1/platform-auth'
    });
  }

  /** Step 1: email + password. Success does not sign in yet — it emails a 6-digit code and hands back an otpToken for verify-otp. */
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  /** Step 2: the code from that email. Only this call actually starts a session. */
  @Post('verify-otp')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(verifyOtpSchema))
  async verifyOtp(
    @Body() body: { otpToken: string; otp: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyOtp(body.otpToken, body.otp, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      location: describeLocation(req.ip, req.headers)
    });
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('resend-otp')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resendOtpSchema))
  async resendOtp(@Body() body: { otpToken: string }) {
    return this.authService.resendOtp(body.otpToken);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refresh(refreshToken, { userAgent: req.headers['user-agent'], ip: req.ip, location: describeLocation(req.ip, req.headers) });
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(PlatformAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentPlatformUser() user: PlatformUser
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken, user.id);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/platform-auth' });
    return { success: true };
  }
}

/** GET /api/v1/platform/me — the first protected platform route (§5 of the brief). */
@Controller('api/v1/platform')
@UseGuards(PlatformAuthGuard)
export class PlatformMeController {
  constructor(private readonly authService: PlatformAuthService) {}

  @Get('me')
  me(@CurrentPlatformUser() user: PlatformUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      permissions: permissionsForRole(user.role as PlatformRoleName)
    };
  }

  @Patch('me/password')
  @UsePipes(new ZodValidationPipe(changePasswordSchema))
  async changePassword(
    @Body() body: ReturnType<typeof changePasswordSchema.parse>,
    @CurrentPlatformUser() user: PlatformUser,
    @CurrentPlatformSession() sessionId?: string
  ) {
    await this.authService.changePassword(user, body.currentPassword, body.newPassword, sessionId);
    return { success: true };
  }
}
