import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  PLATFORM_ONLY_PERMISSIONS,
  ROLES,
  parseSort,
  type CreateRoleInput,
  type ListRolesQuery,
  type Paginated,
  type Permission,
  type RoleResponse,
  type SetRolePermissionsInput,
  type UpdateRoleInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';

type RoleWithRelations = Prisma.RoleGetPayload<{
  include: {
    permissions: { include: { permission: true } };
    _count: { select: { users: true } };
    org: { select: { name: true } };
  };
}>;

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
  org: { select: { name: true } },
} as const;

function toRoleResponse(role: RoleWithRelations): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    orgId: role.orgId,
    orgName: role.org?.name ?? null,
    permissions: role.permissions
      .map((rp) => rp.permission.name as Permission)
      .sort(),
    userCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permsCache: PermissionsCacheService,
  ) {}

  async list(
    query: ListRolesQuery,
    actorOrgId: string | null,
  ): Promise<Paginated<RoleResponse>> {
    const sort = parseSort(query.sort, ['name', 'createdAt', 'updatedAt']);
    const where: Prisma.RoleWhereInput = {
      // Platform admin (orgId=null) thấy MỌI role (platform + tất cả org);
      // org admin chỉ thấy role org mình.
      ...(actorOrgId != null ? { orgId: actorOrgId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, roles] = await this.prisma.$transaction([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        include: ROLE_INCLUDE,
        orderBy: sort ? { [sort.field]: sort.direction } : { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: roles.map(toRoleResponse),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, actorOrgId?: string | null): Promise<RoleResponse> {
    const role = await this.requireRole(id, actorOrgId);
    return toRoleResponse(role);
  }

  async create(
    input: CreateRoleInput,
    actorOrgId: string | null,
  ): Promise<RoleResponse> {
    const existing = await this.prisma.role.findFirst({
      where: { name: input.name, orgId: actorOrgId },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Role "${input.name}" đã tồn tại`,
        ERROR_CODES.ROLE_NAME_TAKEN,
      );
    }

    const role = await this.prisma.role.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        orgId: actorOrgId,
      },
      include: ROLE_INCLUDE,
    });

    addAuditMetadata({ after: { name: role.name, description: role.description } });
    return toRoleResponse(role);
  }

  async update(
    id: string,
    input: UpdateRoleInput,
    actorOrgId?: string | null,
  ): Promise<RoleResponse> {
    const role = await this.requireRole(id, actorOrgId);
    this.assertNotSystem(role.isSystem, 'sửa');

    if (input.name && input.name !== role.name) {
      const taken = await this.prisma.role.findFirst({
        where: { name: input.name, orgId: role.orgId },
      });
      if (taken) {
        throw new AppException(
          HttpStatus.CONFLICT,
          `Role "${input.name}" đã tồn tại`,
          ERROR_CODES.ROLE_NAME_TAKEN,
        );
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
      include: ROLE_INCLUDE,
    });

    addAuditMetadata({
      before: { name: role.name, description: role.description },
      after: { name: updated.name, description: updated.description },
    });
    return toRoleResponse(updated);
  }

  async remove(id: string, actorOrgId?: string | null): Promise<{ message: string }> {
    const role = await this.requireRole(id, actorOrgId);
    this.assertNotSystem(role.isSystem, 'xoá');

    // Invalidate cache user đang giữ role TRƯỚC khi cascade xoá UserRole
    await this.permsCache.invalidateRole(id);
    await this.prisma.role.delete({ where: { id } });

    addAuditMetadata({
      before: {
        name: role.name,
        permissions: role.permissions.map((rp) => rp.permission.name),
        userCount: role._count.users,
      },
    });
    return { message: `Đã xoá role ${role.name}` };
  }

  /** Replace toàn bộ permissions của role + invalidate cache ngay. */
  async setPermissions(
    id: string,
    input: SetRolePermissionsInput,
    actorOrgId?: string | null,
  ): Promise<RoleResponse> {
    const role = await this.requireRole(id, actorOrgId);

    // SUPER_ADMIN luôn giữ toàn quyền — không cho chỉnh
    if (role.name === ROLES.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Không thể chỉnh permissions của SUPER_ADMIN',
        ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
      );
    }

    const wanted = [...new Set(input.permissions)];
    // Org admin (actorOrgId set) KHÔNG được gán quyền platform-only → chống leo thang
    if (actorOrgId != null) {
      const illegal = wanted.filter((p) =>
        (PLATFORM_ONLY_PERMISSIONS as string[]).includes(p),
      );
      if (illegal.length > 0) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          `Không thể gán quyền cấp hệ thống: ${illegal.join(', ')}`,
          ERROR_CODES.FORBIDDEN,
        );
      }
    }
    const permissionRows = await this.prisma.permission.findMany({
      where: { name: { in: wanted } },
      select: { id: true, name: true },
    });

    const before = role.permissions.map((rp) => rp.permission.name).sort();

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { roleId: id, permissionId: { notIn: permissionRows.map((p) => p.id) } },
      }),
      this.prisma.rolePermission.createMany({
        data: permissionRows.map((p) => ({ roleId: id, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);

    // Xoá cache mọi user giữ role + emit user:updated để FE refetch ngay
    await this.permsCache.invalidateRole(id);

    addAuditMetadata({ before, after: wanted.sort() });
    return this.findOne(id);
  }

  private async requireRole(
    id: string,
    actorOrgId?: string | null,
  ): Promise<RoleWithRelations> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    // Platform admin (actorOrgId null/undefined) thao tác mọi role; org admin
    // chỉ role org mình. 404 khi khác org — không tiết lộ resource tồn tại.
    if (!role || (actorOrgId != null && role.orgId !== actorOrgId)) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy role',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return role;
  }

  private assertNotSystem(isSystem: boolean, action: string): void {
    if (isSystem) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        `Không thể ${action} role hệ thống`,
        ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
      );
    }
  }
}
