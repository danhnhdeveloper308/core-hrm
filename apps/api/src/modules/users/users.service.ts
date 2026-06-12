import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  ROLES,
  parseSort,
  type AssignRolesInput,
  type InviteUserInput,
  type ListUsersQuery,
  type Paginated,
  type UpdateProfileInput,
  type UpdateUserStatusInput,
  type UserResponse,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import {
  toUserResponse,
  USER_WITH_ROLES_INCLUDE,
  type UserWithRoles,
} from '../../common/mappers/user.mapper';
import { AppConfigService } from '../../config/app-config.service';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailQueueService } from '../../queues/email.queue';
import { OtpService } from '../auth/otp.service';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly permsCache: PermissionsCacheService,
    private readonly config: AppConfigService,
    private readonly emailQueue: EmailQueueService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Mời user qua email: tạo user chưa có mật khẩu + gán roles + gửi link
   * kích hoạt (hết hạn 7 ngày). Gọi lại với user chưa kích hoạt = gửi lại lời mời.
   */
  async invite(
    actor: AccessTokenPayload,
    input: InviteUserInput,
  ): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing && (existing.passwordHash || existing.emailVerifiedAt)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Email này đã có tài khoản kích hoạt',
        ERROR_CODES.AUTH_EMAIL_TAKEN,
      );
    }

    // Roles gán sẵn — mặc định USER
    let roleIds = input.roleIds ?? [];
    if (roleIds.length === 0) {
      const userRole = await this.prisma.role.findUnique({
        where: { name: ROLES.USER },
        select: { id: true },
      });
      roleIds = userRole ? [userRole.id] : [];
    } else {
      const found = await this.prisma.role.count({
        where: { id: { in: roleIds } },
      });
      if (found !== new Set(roleIds).size) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Danh sách role chứa id không tồn tại',
          ERROR_CODES.NOT_FOUND,
        );
      }
    }

    const user =
      existing ??
      (await this.prisma.user.create({
        data: { email: input.email, name: input.name, status: 'ACTIVE' },
      }));

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { userId: user.id, roleId: { notIn: roleIds } },
      }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
        skipDuplicates: true,
      }),
    ]);

    const token = await this.otp.issueInviteToken(user.email);
    const link = `${this.config.appUrl}/accept-invite?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}`;
    await this.emailQueue.enqueueInvite({
      to: user.email,
      inviterEmail: actor.email,
      link,
    });

    addAuditMetadata({
      invitedEmail: user.email,
      resend: existing !== null,
    });
    return this.findOne(user.id);
  }

  async list(query: ListUsersQuery): Promise<Paginated<UserResponse>> {
    const sort = parseSort(query.sort, ['createdAt', 'email', 'name', 'status']);
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.roleId ? { roles: { some: { roleId: query.roleId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: USER_WITH_ROLES_INCLUDE,
        orderBy: sort
          ? { [sort.field]: sort.direction }
          : { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: users.map(toUserResponse),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<UserResponse> {
    return toUserResponse(await this.requireUser(id));
  }

  /** Đổi status — BAN thì revoke toàn bộ session + force:logout realtime. */
  async updateStatus(
    actor: AccessTokenPayload,
    targetId: string,
    input: UpdateUserStatusInput,
  ): Promise<UserResponse> {
    if (actor.sub === targetId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Không thể tự đổi trạng thái tài khoản của chính mình',
        ERROR_CODES.USER_SELF_ACTION_FORBIDDEN,
      );
    }

    const target = await this.requireUser(targetId);
    if (input.status !== 'ACTIVE') {
      await this.assertNotLastSuperAdmin(target, 'vô hiệu hoá');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { status: input.status },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (input.status === 'BANNED' || input.status === 'INACTIVE') {
      await this.sessions.revokeAllForUser(targetId, 'USER_BANNED', {
        forceLogout: true,
      });
    }
    await this.permsCache.invalidateUser(targetId, 'status');

    addAuditMetadata({
      before: { status: target.status },
      after: { status: updated.status },
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return toUserResponse(updated);
  }

  /** Replace toàn bộ roles của user — invalidate cache ngay. */
  async assignRoles(
    actor: AccessTokenPayload,
    targetId: string,
    input: AssignRolesInput,
  ): Promise<UserResponse> {
    const target = await this.requireUser(targetId);

    const roles = await this.prisma.role.findMany({
      where: { id: { in: input.roleIds } },
      select: { id: true, name: true },
    });
    if (roles.length !== new Set(input.roleIds).size) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Danh sách role chứa id không tồn tại',
        ERROR_CODES.NOT_FOUND,
      );
    }

    const hadSuperAdmin = target.roles.some(
      (ur) => ur.role.name === ROLES.SUPER_ADMIN,
    );
    const keepsSuperAdmin = roles.some((r) => r.name === ROLES.SUPER_ADMIN);
    if (hadSuperAdmin && !keepsSuperAdmin) {
      await this.assertNotLastSuperAdmin(target, 'gỡ quyền SUPER_ADMIN của');
    }

    const before = target.roles.map((ur) => ur.role.name).sort();

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { userId: targetId, roleId: { notIn: input.roleIds } },
      }),
      this.prisma.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: targetId, roleId })),
        skipDuplicates: true,
      }),
    ]);

    await this.permsCache.invalidateUser(targetId, 'roles');

    addAuditMetadata({ before, after: roles.map((r) => r.name).sort() });
    return this.findOne(targetId);
  }

  async remove(
    actor: AccessTokenPayload,
    targetId: string,
  ): Promise<{ message: string }> {
    if (actor.sub === targetId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Không thể tự xoá tài khoản của chính mình',
        ERROR_CODES.USER_SELF_ACTION_FORBIDDEN,
      );
    }

    const target = await this.requireUser(targetId);
    await this.assertNotLastSuperAdmin(target, 'xoá');

    await this.sessions.revokeAllForUser(targetId, 'USER_BANNED', {
      forceLogout: true,
    });
    await this.prisma.user.delete({ where: { id: targetId } });
    await this.permsCache.invalidateUser(targetId, 'status');

    addAuditMetadata({ before: { email: target.email, name: target.name } });
    return { message: `Đã xoá user ${target.email}` };
  }

  /** Tự cập nhật profile (name/avatar) — không cần permission. */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserResponse> {
    const before = await this.requireUser(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
      include: USER_WITH_ROLES_INCLUDE,
    });

    await this.permsCache.invalidateUser(userId, 'profile');
    addAuditMetadata({
      before: { name: before.name, avatarUrl: before.avatarUrl },
      after: { name: updated.name, avatarUrl: updated.avatarUrl },
    });
    return toUserResponse(updated);
  }

  private async requireUser(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy user',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return user;
  }

  /** Chặn thao tác làm hệ thống mất SUPER_ADMIN đang hoạt động cuối cùng. */
  private async assertNotLastSuperAdmin(
    target: UserWithRoles,
    action: string,
  ): Promise<void> {
    const isSuperAdmin = target.roles.some(
      (ur) => ur.role.name === ROLES.SUPER_ADMIN,
    );
    if (!isSuperAdmin) return;

    const otherSuperAdmins = await this.prisma.user.count({
      where: {
        id: { not: target.id },
        status: 'ACTIVE',
        roles: { some: { role: { name: ROLES.SUPER_ADMIN } } },
      },
    });
    if (otherSuperAdmins === 0) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        `Không thể ${action} SUPER_ADMIN cuối cùng của hệ thống`,
        ERROR_CODES.LAST_SUPER_ADMIN,
      );
    }
  }
}
