import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ALL_ORG_ROLES,
  DEFAULT_ORG_ROLE_PERMISSIONS,
  ERROR_CODES,
  ORG_PRESET_UNIT_TYPES,
  ORG_ROLES,
  ORG_ROLE_DESCRIPTIONS,
  parseSort,
  type CreateOrganizationInput,
  type ListOrganizationsQuery,
  type OrganizationResponse,
  type Paginated,
  type UpdateOrganizationInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import type { AccessTokenPayload } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import type { Organization } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

function toOrganizationResponse(org: Organization): OrganizationResponse {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    timezone: org.timezone,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Tạo org mới + provision đầy đủ: bộ OrgUnitType theo preset, unit gốc,
   * 4 role org-level với permission mặc định, mời org admin đầu tiên.
   */
  async create(
    actor: AccessTokenPayload,
    input: CreateOrganizationInput,
  ): Promise<OrganizationResponse> {
    const slugTaken = await this.prisma.organization.findUnique({
      where: { slug: input.slug },
    });
    if (slugTaken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Slug "${input.slug}" đã được dùng`,
        ERROR_CODES.ORG_SLUG_TAKEN,
      );
    }

    const permissions = await this.prisma.permission.findMany({
      select: { id: true, name: true },
    });
    const permIdByName = new Map(permissions.map((p) => [p.name, p.id]));

    const org = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug: input.slug, timezone: input.timezone },
      });

      // Bộ loại đơn vị theo preset
      const presetTypes = ORG_PRESET_UNIT_TYPES[input.preset];
      await tx.orgUnitType.createMany({
        data: presetTypes.map((t) => ({ ...t, orgId: org.id })),
      });
      const rootType = await tx.orgUnitType.findFirstOrThrow({
        where: { orgId: org.id },
        orderBy: { rank: 'asc' },
      });

      // Unit gốc = chính tổ chức
      const root = await tx.orgUnit.create({
        data: {
          orgId: org.id,
          typeId: rootType.id,
          name: input.name,
          code: 'ROOT',
          path: '',
        },
      });
      await tx.orgUnit.update({
        where: { id: root.id },
        data: { path: `/${root.id}/` },
      });

      // 4 role org-level + permission mặc định
      for (const roleName of ALL_ORG_ROLES) {
        const role = await tx.role.create({
          data: {
            name: roleName,
            description: ORG_ROLE_DESCRIPTIONS[roleName],
            isSystem: true,
            orgId: org.id,
          },
        });
        const permIds = DEFAULT_ORG_ROLE_PERMISSIONS[roleName].map((p) => {
          const id = permIdByName.get(p);
          if (!id) throw new Error(`Permission chưa được seed: ${p}`);
          return id;
        });
        await tx.rolePermission.createMany({
          data: permIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }

      return org;
    });

    // Mời org admin đầu tiên (ngoài transaction — gửi mail qua queue)
    const orgAdminRole = await this.prisma.role.findFirstOrThrow({
      where: { orgId: org.id, name: ORG_ROLES.ORG_ADMIN },
      select: { id: true },
    });
    try {
      await this.users.invite(
        actor,
        { email: input.adminEmail, name: input.adminName, roleIds: [orgAdminRole.id] },
        { orgId: org.id },
      );
    } catch (err) {
      // Org đã tạo xong — lỗi mời admin không rollback, platform admin mời lại sau
      this.logger.error(
        `Tạo org ${org.slug} OK nhưng mời admin thất bại: ${(err as Error).message}`,
      );
    }

    addAuditMetadata({
      after: { name: org.name, slug: org.slug, preset: input.preset },
      invitedAdmin: input.adminEmail,
    });
    return toOrganizationResponse(org);
  }

  async list(
    query: ListOrganizationsQuery,
  ): Promise<Paginated<OrganizationResponse>> {
    const sort = parseSort(query.sort, ['name', 'slug', 'createdAt', 'status']);
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, orgs] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: sort ? { [sort.field]: sort.direction } : { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: orgs.map(toOrganizationResponse),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<OrganizationResponse> {
    return toOrganizationResponse(await this.requireOrg(id));
  }

  async update(
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationResponse> {
    const org = await this.requireOrg(id);
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    addAuditMetadata({
      before: { name: org.name, timezone: org.timezone, status: org.status },
      after: { name: updated.name, timezone: updated.timezone, status: updated.status },
    });
    return toOrganizationResponse(updated);
  }

  /** Xoá cứng — cascade toàn bộ dữ liệu tenant (users, units, roles...). */
  async remove(id: string): Promise<{ message: string }> {
    const org = await this.requireOrg(id);
    const userCount = await this.prisma.user.count({ where: { orgId: id } });
    await this.prisma.organization.delete({ where: { id } });
    addAuditMetadata({
      before: { name: org.name, slug: org.slug, userCount },
    });
    return { message: `Đã xoá tổ chức ${org.name}` };
  }

  private async requireOrg(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy tổ chức',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return org;
  }
}
