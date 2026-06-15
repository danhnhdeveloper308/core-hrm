import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  ROLES,
  type AcceptInviteInput,
  type ChangePasswordInput,
  type Enable2faInput,
  type Enable2faResponse,
  type LoginInput,
  type LoginResponse,
  type MeResponse,
  type Permission,
  type Recovery2faInput,
  type RegisterInput,
  type ResetPasswordInput,
  type Setup2faResponse,
  type Verify2faInput,
} from '@repo/shared';
import argon2 from 'argon2';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import {
  APP_EVENTS,
  type AuditRecordEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import {
  toMeResponse,
  toUserResponse,
  USER_WITH_ROLES_INCLUDE,
  type UserWithRoles,
} from '../../common/mappers/user.mapper';
import {
  generateRecoveryCodes,
  generateStateToken,
  sha256,
} from '../../common/utils/crypto';
import { parseUserAgent } from '../../common/utils/user-agent';
import type { User } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailQueueService } from '../../queues/email.queue';
import {
  SessionsService,
  type RequestContext,
} from '../sessions/sessions.service';
import { GoogleOAuthService } from './google-oauth.service';
import { LoginLockoutService } from './login-lockout.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

const ARGON2_OPTIONS: argon2.Options = { type: argon2.argon2id };

@Injectable()
export class AuthService {
  /** Hash mồi để verify "giả" khi user không tồn tại — chống timing attack. */
  private dummyHashPromise: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly totp: TotpService,
    private readonly google: GoogleOAuthService,
    private readonly lockout: LoginLockoutService,
    private readonly emailQueue: EmailQueueService,
    private readonly events: EventEmitter2,
  ) {}

  // ---------------- Register / verify email ----------------

  /** Response cố định — không lộ việc email đã tồn tại hay chưa. */
  async register(input: RegisterInput, ctx: RequestContext): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      // Email đã đăng ký nhưng chưa verify → gửi lại OTP để user đi tiếp
      if (!existing.emailVerifiedAt) {
        await this.otp.issue(input.email, 'EMAIL_VERIFY');
      }
    } else {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
          status: 'ACTIVE',
        },
      });
      await this.assignDefaultRole(user.id);
      await this.otp.issue(input.email, 'EMAIL_VERIFY');
      this.audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.register',
        resource: 'user',
        resourceId: user.id,
        ...ctx,
      });
    }

    return { message: 'Vui lòng kiểm tra email để lấy mã xác thực' };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    await this.otp.consume(email, 'EMAIL_VERIFY', code);

    const user = await this.prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.verify_email',
      resource: 'user',
      resourceId: user.id,
    });

    return { message: 'Xác thực email thành công, hãy đăng nhập' };
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt) {
      await this.otp.issue(email, 'EMAIL_VERIFY');
    }
    return { message: 'Nếu email hợp lệ, mã xác thực mới đã được gửi' };
  }

  // ---------------- Login / 2FA ----------------

  async login(
    input: LoginInput,
    ctx: RequestContext,
    trustedDeviceToken?: string,
  ): Promise<{ response: LoginResponse; tokens: IssuedTokens | null }> {
    await this.lockout.assertNotLocked(input.email);

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (!user?.passwordHash) {
      // Vẫn chạy argon2.verify để thời gian phản hồi không tiết lộ email tồn tại
      await argon2.verify(await this.getDummyHash(), input.password).catch(() => false);
      await this.lockout.registerFailure(input.email, ctx);
      this.throwInvalidCredentials();
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      await this.lockout.registerFailure(input.email, ctx);
      this.throwInvalidCredentials();
    }

    this.assertUserActive(user);

    if (!user.emailVerifiedAt) {
      // Gửi lại OTP để user hoàn tất xác thực
      await this.otp.issue(user.email, 'EMAIL_VERIFY');
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Email chưa được xác thực — mã OTP mới đã được gửi',
        ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED,
      );
    }

    if (user.totpEnabled) {
      // Thiết bị tin cậy (cookie trusted_device còn hạn) → skip bước TOTP
      const trusted = trustedDeviceToken
        ? await this.sessions.isTrustedDevice(user.id, trustedDeviceToken)
        : false;
      if (!trusted) {
        return {
          response: {
            requires2fa: true,
            pending2faToken: await this.tokens.signPending2faToken(user.id),
          },
          tokens: null,
        };
      }
    }

    await this.lockout.reset(user.email);
    const tokens = await this.issueSession(user, ctx, 'local');
    return {
      response: { requires2fa: false, user: toUserResponse(user) },
      tokens,
    };
  }

  async verify2fa(
    input: Verify2faInput,
    ctx: RequestContext,
  ): Promise<{
    response: LoginResponse;
    tokens: IssuedTokens;
    trustedDeviceToken: string | null;
  }> {
    const userId = await this.tokens.verifyPending2faToken(input.pendingToken);
    const user = await this.findUserWithRoles(userId);
    this.assertUserActive(user);
    await this.lockout.assertNotLocked(user.email);

    if (!user.totpSecret || !user.totpEnabled) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản chưa bật 2FA',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }

    const valid = await this.totp.verifyCode(
      this.totp.decrypt(user.totpSecret),
      input.code,
    );
    if (!valid) {
      await this.lockout.registerFailure(user.email, ctx);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Mã 2FA không đúng',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }

    await this.lockout.reset(user.email);
    const tokens = await this.issueSession(user, ctx, 'local');
    const trustedDeviceToken = await this.maybeTrustDevice(
      user.id,
      ctx,
      input.rememberDevice,
    );
    return {
      response: { requires2fa: false, user: toUserResponse(user) },
      tokens,
      trustedDeviceToken,
    };
  }

  async recovery2fa(
    input: Recovery2faInput,
    ctx: RequestContext,
  ): Promise<{
    response: LoginResponse;
    tokens: IssuedTokens;
    trustedDeviceToken: string | null;
  }> {
    const userId = await this.tokens.verifyPending2faToken(input.pendingToken);
    const user = await this.findUserWithRoles(userId);
    this.assertUserActive(user);
    await this.lockout.assertNotLocked(user.email);

    const normalized = input.recoveryCode.toUpperCase().replace(/[\s-]/g, '');
    // Lấy cả mã đã dùng để báo lỗi rõ ràng — mỗi mã chỉ dùng được 1 lần
    const codes = await this.prisma.recoveryCode.findMany({
      where: { userId },
    });
    const matched = codes.find((c) => c.codeHash === sha256(normalized));
    if (!matched) {
      await this.lockout.registerFailure(user.email, ctx);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Recovery code không hợp lệ',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }
    if (matched.usedAt) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Recovery code này đã được sử dụng — mỗi mã chỉ dùng được 1 lần, hãy dùng mã khác',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }

    await this.prisma.recoveryCode.update({
      where: { id: matched.id },
      data: { usedAt: new Date() },
    });
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.2fa_recovery_used',
      resource: 'user',
      resourceId: user.id,
      ...ctx,
    });

    await this.lockout.reset(user.email);
    const tokens = await this.issueSession(user, ctx, 'local');
    const trustedDeviceToken = await this.maybeTrustDevice(
      user.id,
      ctx,
      input.rememberDevice,
    );
    return {
      response: { requires2fa: false, user: toUserResponse(user) },
      tokens,
      trustedDeviceToken,
    };
  }

  // ---------------- Refresh rotation + reuse detection ----------------

  async refresh(
    refreshToken: string,
    ctx: RequestContext,
  ): Promise<IssuedTokens> {
    const session = await this.sessions.findByRefreshToken(refreshToken);

    if (!session) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên đăng nhập không hợp lệ',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }

    if (session.revokedAt) {
      // Token đã ROTATE mà vẫn bị dùng lại → token bị đánh cắp/replay:
      // revoke TẤT CẢ session của user + force logout realtime
      const isReplay =
        session.revokedReason === 'ROTATED' ||
        session.revokedReason === 'TOKEN_REUSE';
      if (isReplay) {
        await this.sessions.revokeAllForUser(session.userId, 'TOKEN_REUSE', {
          forceLogout: true,
        });
        this.audit({
          actorId: session.userId,
          actorEmail: session.user.email,
          action: 'auth.token_reuse_detected',
          resource: 'session',
          resourceId: session.id,
          metadata: { revokedReason: session.revokedReason },
          ...ctx,
        });
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'Phát hiện token bị dùng lại — mọi phiên đã bị thu hồi',
          ERROR_CODES.AUTH_TOKEN_REUSE,
        );
      }
      // Phiên bị thu hồi chủ động (logout/admin revoke/ban...) — client cũ
      // gọi refresh chỉ là stale, KHÔNG nuke các phiên khác của user
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên đăng nhập đã bị thu hồi',
        ERROR_CODES.AUTH_SESSION_REVOKED,
      );
    }

    if (session.expiresAt < new Date()) {
      await this.sessions.revokeSession(session.id, 'EXPIRED', { emit: false });
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Phiên đăng nhập đã hết hạn',
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    }

    if (session.user.status !== 'ACTIVE') {
      await this.sessions.revokeAllForUser(session.userId, 'USER_BANNED', {
        forceLogout: true,
      });
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tài khoản đã bị khoá',
        ERROR_CODES.AUTH_USER_BANNED,
      );
    }

    const { session: newSession, refreshToken: newRefreshToken } =
      await this.sessions.rotate(session, ctx);
    const accessToken = await this.tokens.signAccessToken(
      session.user,
      newSession.id,
    );

    return { accessToken, refreshToken: newRefreshToken, sessionId: newSession.id };
  }

  // ---------------- Logout ----------------

  async logout(refreshToken: string | undefined): Promise<{ message: string }> {
    if (refreshToken) {
      const session = await this.sessions.findByRefreshToken(refreshToken);
      if (session && !session.revokedAt) {
        await this.sessions.revokeSession(session.id, 'USER_LOGOUT', {
          emit: false,
        });
        this.audit({
          actorId: session.userId,
          actorEmail: session.user.email,
          action: 'auth.logout',
          resource: 'session',
          resourceId: session.id,
        });
      }
    }
    return { message: 'Đã đăng xuất' };
  }

  async logoutAll(user: AccessTokenPayload): Promise<{ message: string }> {
    const count = await this.sessions.revokeAllForUser(
      user.sub,
      'USER_LOGOUT_ALL',
      { forceLogout: true },
    );
    this.audit({
      actorId: user.sub,
      actorEmail: user.email,
      action: 'auth.logout_all',
      resource: 'session',
      metadata: { revokedCount: count },
    });
    return { message: `Đã đăng xuất khỏi ${count} phiên` };
  }

  // ---------------- Password ----------------

  async changePassword(
    payload: AccessTokenPayload,
    input: ChangePasswordInput,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });

    if (!user.passwordHash) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Tài khoản đăng nhập bằng Google chưa đặt mật khẩu — dùng chức năng quên mật khẩu',
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      );
    }

    const valid = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mật khẩu hiện tại không đúng',
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(input.newPassword, ARGON2_OPTIONS) },
    });

    // Thu hồi mọi phiên khác — phiên hiện tại giữ nguyên
    await this.sessions.revokeAllForUser(user.id, 'PASSWORD_RESET', {
      exceptSessionId: payload.sessionId,
    });
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.change_password',
      resource: 'user',
      resourceId: user.id,
    });

    return { message: 'Đổi mật khẩu thành công' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      await this.otp.issue(email, 'PASSWORD_RESET');
    }
    return { message: 'Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi' };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    await this.otp.consume(input.email, 'PASSWORD_RESET', input.code);

    const user = await this.prisma.user.update({
      where: { email: input.email },
      data: {
        passwordHash: await argon2.hash(input.newPassword, ARGON2_OPTIONS),
        // reset qua email đồng nghĩa email đã được xác thực
        emailVerifiedAt: new Date(),
      },
    });

    await this.sessions.revokeAllForUser(user.id, 'PASSWORD_RESET', {
      forceLogout: true,
    });
    // Reset qua email = có thể tài khoản từng bị lộ → bỏ tin cậy mọi thiết bị
    await this.sessions.revokeTrustedDevices(user.id);
    await this.lockout.reset(user.email);
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.reset_password',
      resource: 'user',
      resourceId: user.id,
    });

    return { message: 'Đặt lại mật khẩu thành công, hãy đăng nhập lại' };
  }

  // ---------------- Invitation ----------------

  /** User nhận lời mời đặt mật khẩu — token từ link email (type INVITE). */
  async acceptInvite(
    input: AcceptInviteInput,
    ctx: RequestContext,
  ): Promise<{ response: LoginResponse; tokens: IssuedTokens }> {
    await this.otp.consume(input.email, 'INVITE', input.token);

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user || user.passwordHash) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Lời mời không hợp lệ hoặc tài khoản đã được kích hoạt',
        ERROR_CODES.AUTH_INVITE_INVALID,
      );
    }
    this.assertUserActive(user);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(input.password, ARGON2_OPTIONS),
        emailVerifiedAt: new Date(),
      },
      include: USER_WITH_ROLES_INCLUDE,
    });

    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.accept_invite',
      resource: 'user',
      resourceId: user.id,
      ...ctx,
    });

    const tokens = await this.issueSession(updated, ctx, 'local');
    return {
      response: { requires2fa: false, user: toUserResponse(updated) },
      tokens,
    };
  }

  // ---------------- 2FA setup ----------------

  async setup2fa(payload: AccessTokenPayload): Promise<Setup2faResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });
    if (user.totpEnabled) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        '2FA đã được bật từ trước',
        ERROR_CODES.AUTH_2FA_ALREADY_ENABLED,
      );
    }

    const setup = await this.totp.createSetup(user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: this.totp.encrypt(setup.secret), totpEnabled: false },
    });

    return setup;
  }

  async enable2fa(
    payload: AccessTokenPayload,
    input: Enable2faInput,
  ): Promise<Enable2faResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });
    if (user.totpEnabled) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        '2FA đã được bật từ trước',
        ERROR_CODES.AUTH_2FA_ALREADY_ENABLED,
      );
    }
    if (!user.totpSecret) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Chưa khởi tạo 2FA — gọi /auth/2fa/setup trước',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }

    const valid = await this.totp.verifyCode(
      this.totp.decrypt(user.totpSecret),
      input.code,
    );
    if (!valid) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mã 2FA không đúng — kiểm tra lại app authenticator',
        ERROR_CODES.AUTH_2FA_INVALID_CODE,
      );
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: true },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: sha256(code.replace(/-/g, '')),
        })),
      }),
    ]);
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.2fa_enabled',
      resource: 'user',
      resourceId: user.id,
    });

    return { recoveryCodes };
  }

  async disable2fa(
    payload: AccessTokenPayload,
    password: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });

    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Mật khẩu không đúng',
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpEnabled: false },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);
    // 2FA tắt → các thiết bị "tin cậy" mất ý nghĩa
    await this.sessions.revokeTrustedDevices(user.id);
    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.2fa_disabled',
      resource: 'user',
      resourceId: user.id,
    });

    return { message: 'Đã tắt 2FA' };
  }

  // ---------------- Me / Google ----------------

  async me(payload: AccessTokenPayload): Promise<MeResponse> {
    const user = await this.findUserWithRoles(payload.sub);
    const permissions = await this.getUserPermissions(user.id);
    return toMeResponse(user, permissions, payload.sessionId) as MeResponse;
  }

  googleAuthUrl(): Promise<string> {
    return this.google.buildAuthUrl();
  }

  async googleCallback(
    code: string,
    state: string,
    ctx: RequestContext,
  ): Promise<IssuedTokens> {
    const user = await this.google.handleCallback(code, state);
    this.assertUserActive(user);
    await this.assignDefaultRole(user.id);
    return this.issueSession(user, ctx, 'google');
  }

  // ---------------- Helpers ----------------

  /** Tạo session + access token + audit `auth.login` — dùng chung mọi flow. */
  private async issueSession(
    user: User,
    ctx: RequestContext,
    provider: 'local' | 'google',
  ): Promise<IssuedTokens> {
    const { session, refreshToken, isNewDevice } =
      await this.sessions.createSession(user.id, ctx);
    const accessToken = await this.tokens.signAccessToken(user, session.id);

    this.audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      resource: 'session',
      resourceId: session.id,
      metadata: { provider, isNewDevice },
      ...ctx,
    });

    // Cảnh báo thiết bị lạ — bỏ qua thiết bị đầu tiên (lần đăng nhập đầu đời)
    if (isNewDevice && (await this.sessions.countDevices(user.id)) > 1) {
      const { deviceName } = parseUserAgent(ctx.userAgent);
      await this.emailQueue.enqueueNewDeviceAlert({
        to: user.email,
        deviceName,
        ip: ctx.ip ?? null,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      });
      this.audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.new_device_login',
        resource: 'session',
        resourceId: session.id,
        metadata: { deviceName },
        ...ctx,
      });
    }

    return { accessToken, refreshToken, sessionId: session.id };
  }

  /** rememberDevice=true → tạo token tin cậy 30 ngày, controller set cookie. */
  private async maybeTrustDevice(
    userId: string,
    ctx: RequestContext,
    rememberDevice: boolean | undefined,
  ): Promise<string | null> {
    if (!rememberDevice) return null;
    const token = generateStateToken();
    await this.sessions.trustDevice(userId, ctx, token);
    return token;
  }

  private async getUserPermissions(userId: string): Promise<Permission[]> {
    const permissions = await this.prisma.permission.findMany({
      where: {
        roles: { some: { role: { users: { some: { userId } } } } },
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return permissions.map((p) => p.name as Permission);
  }

  private async findUserWithRoles(userId: string): Promise<UserWithRoles> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  private assertUserActive(user: User): void {
    if (user.status === 'BANNED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tài khoản đã bị khoá',
        ERROR_CODES.AUTH_USER_BANNED,
      );
    }
    if (user.status === 'INACTIVE') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tài khoản đang bị vô hiệu hoá',
        ERROR_CODES.AUTH_USER_BANNED,
      );
    }
  }

  private throwInvalidCredentials(): never {
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      'Email hoặc mật khẩu không đúng',
      ERROR_CODES.AUTH_INVALID_CREDENTIALS,
    );
  }

  /** User mới (register/OAuth) nhận role USER mặc định. */
  async assignDefaultRole(userId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { name: ROLES.USER, orgId: null },
    });
    if (role) {
      await this.prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      });
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= argon2.hash('dummy-password-for-timing', ARGON2_OPTIONS);
    return this.dummyHashPromise;
  }

  private audit(event: AuditRecordEvent): void {
    this.events.emit(APP_EVENTS.AUDIT_RECORD, event);
  }
}
