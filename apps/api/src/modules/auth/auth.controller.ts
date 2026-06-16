import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ERROR_CODES, type LoginResponse, type MeResponse } from '@repo/shared';
import type { Request, Response } from 'express';
import { AppException } from '../../common/exceptions/app.exception';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import { AppConfigService } from '../../config/app-config.service';
import type { RequestContext } from '../sessions/sessions.service';
import { AuthService, type IssuedTokens } from './auth.service';
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
  setTrustedDeviceCookie,
  TRUSTED_DEVICE_COOKIE,
} from './cookies';
import {
  AcceptInviteDto,
  ChangePasswordDto,
  Disable2faDto,
  Enable2faDto,
  ForgotPasswordDto,
  LoginDto,
  Recovery2faDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  ResetPasswordByIdentityDto,
  Verify2faDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const STRICT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('auth')
// Auth flows tự ghi audit ở AuthService (register chưa có actor, login kèm provider...)
@SkipAudit()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  private ctx(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  /** Cookie trước, fallback body.refreshToken (mobile/non-browser). */
  private refreshTokenFrom(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    const fromCookie = cookies?.[REFRESH_TOKEN_COOKIE];
    if (fromCookie) return fromCookie;

    const body = req.body as { refreshToken?: unknown } | undefined;
    return typeof body?.refreshToken === 'string' ? body.refreshToken : undefined;
  }

  // ---------------- Public flows ----------------

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký — gửi OTP xác thực email' })
  @ApiOkResponse({ description: 'Luôn trả message chung (không lộ email tồn tại)' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, this.ctx(req));
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực email bằng OTP 6 số' })
  @ApiOkResponse({ description: 'Xác thực thành công' })
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyEmail(dto.email, dto.code);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại OTP xác thực email' })
  @ApiOkResponse({ description: 'Luôn trả message chung' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto.email);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập — trả requires2fa hoặc set cookie phiên' })
  @ApiOkResponse({ description: 'LoginResponse (union requires2fa)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const { response, tokens } = await this.auth.login(
      dto,
      this.ctx(req),
      cookies?.[TRUSTED_DEVICE_COOKIE],
    );
    if (tokens) this.setCookies(res, tokens);
    return response;
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bước 2 login: xác thực mã TOTP' })
  @ApiOkResponse({ description: 'Set cookie phiên khi mã đúng' })
  async verify2fa(
    @Body() dto: Verify2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { response, tokens, trustedDeviceToken } = await this.auth.verify2fa(
      dto,
      this.ctx(req),
    );
    this.setCookies(res, tokens);
    if (trustedDeviceToken) {
      setTrustedDeviceCookie(res, trustedDeviceToken, this.config);
    }
    return response;
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('2fa/recovery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng recovery code (mất thiết bị TOTP)' })
  @ApiOkResponse({ description: 'Set cookie phiên khi code hợp lệ' })
  async recovery2fa(
    @Body() dto: Recovery2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { response, tokens, trustedDeviceToken } = await this.auth.recovery2fa(
      dto,
      this.ctx(req),
    );
    this.setCookies(res, tokens);
    if (trustedDeviceToken) {
      setTrustedDeviceCookie(res, trustedDeviceToken, this.config);
    }
    return response;
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhận lời mời — đặt mật khẩu và đăng nhập luôn' })
  @ApiOkResponse({ description: 'Set cookie phiên khi token hợp lệ' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { response, tokens } = await this.auth.acceptInvite(dto, this.ctx(req));
    this.setCookies(res, tokens);
    return response;
  }

  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh rotation — đọc cookie refresh_token' })
  @ApiOkResponse({ description: 'Cookie mới được set; reuse → revoke toàn bộ phiên' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = this.refreshTokenFrom(req);
    if (!refreshToken) {
      clearAuthCookies(res, this.config);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Không có refresh token',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }
    try {
      const tokens = await this.auth.refresh(refreshToken, this.ctx(req));
      this.setCookies(res, tokens);
      return { message: 'ok' };
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất — revoke session hiện tại, xoá cookie' })
  @ApiOkResponse({ description: 'Cookie đã được xoá' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.auth.logout(this.refreshTokenFrom(req));
    clearAuthCookies(res, this.config);
    return result;
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quên mật khẩu — gửi OTP đặt lại' })
  @ApiOkResponse({ description: 'Luôn trả message chung' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng OTP — revoke mọi phiên' })
  @ApiOkResponse({ description: 'Đặt lại thành công' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('reset-password-by-identity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đặt lại mật khẩu bằng mã NV + SĐT (cho user không có email)',
  })
  @ApiOkResponse({ description: 'Đặt lại thành công' })
  resetPasswordByIdentity(@Body() dto: ResetPasswordByIdentityDto) {
    return this.auth.resetPasswordByIdentity(dto);
  }

  // ---------------- Google OAuth ----------------

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Bắt đầu Google OAuth — redirect kèm state chống CSRF' })
  @ApiOkResponse({ description: 'Redirect 302 tới Google' })
  async googleStart(@Res() res: Response): Promise<void> {
    res.redirect(await this.auth.googleAuthUrl());
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback — set cookie rồi redirect về app' })
  @ApiOkResponse({ description: 'Redirect về NEXT_PUBLIC_APP_URL' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !state) {
      res.redirect(`${this.config.appUrl}/login?error=oauth`);
      return;
    }
    try {
      const tokens = await this.auth.googleCallback(code, state, this.ctx(req));
      this.setCookies(res, tokens);
      res.redirect(`${this.config.appUrl}/dashboard`);
    } catch {
      res.redirect(`${this.config.appUrl}/login?error=oauth`);
    }
  }

  // ---------------- Authenticated ----------------

  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Thông tin user hiện tại + permissions đã resolve' })
  @ApiOkResponse({ description: 'MeResponse' })
  me(@CurrentUser() user: AccessTokenPayload): Promise<MeResponse> {
    return this.auth.me(user);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Đăng xuất mọi thiết bị — force:logout realtime' })
  @ApiOkResponse({ description: 'Mọi phiên đã bị thu hồi' })
  async logoutAll(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.auth.logoutAll(user);
    clearAuthCookies(res, this.config);
    return result;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Đổi mật khẩu — revoke các phiên khác' })
  @ApiOkResponse({ description: 'Đổi thành công' })
  changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user, dto);
  }

  @Post('2fa/setup')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Khởi tạo 2FA — trả QR code + secret' })
  @ApiOkResponse({ description: 'Setup2faResponse' })
  setup2fa(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.setup2fa(user);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Bật 2FA bằng mã TOTP đầu tiên — trả 8 recovery codes' })
  @ApiOkResponse({ description: 'Enable2faResponse' })
  enable2fa(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: Enable2faDto,
  ) {
    return this.auth.enable2fa(user, dto);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Tắt 2FA — yêu cầu mật khẩu' })
  @ApiOkResponse({ description: 'Đã tắt 2FA' })
  disable2fa(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: Disable2faDto,
  ) {
    return this.auth.disable2fa(user, dto.password);
  }

  private setCookies(res: Response, tokens: IssuedTokens): void {
    setAuthCookies(
      res,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      this.config,
    );
  }
}
