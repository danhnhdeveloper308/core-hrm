import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateOrgUnitInput,
  type MoveOrgUnitInput,
  type OrgUnitResponse,
  type UpdateOrgUnitInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OrgUnitWithType = Prisma.OrgUnitGetPayload<{ include: { type: true } }>;

function toOrgUnitResponse(unit: OrgUnitWithType): OrgUnitResponse {
  return {
    id: unit.id,
    parentId: unit.parentId,
    typeId: unit.typeId,
    typeCode: unit.type.code,
    typeName: unit.type.name,
    name: unit.name,
    code: unit.code,
    path: unit.path,
    managerId: unit.managerId,
  };
}

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Toàn bộ cây của org — FE tự dựng tree từ parentId (org lớn ~vài trăm node). */
  async list(orgId: string): Promise<OrgUnitResponse[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: { orgId },
      include: { type: true },
      orderBy: [{ path: 'asc' }],
    });
    return units.map(toOrgUnitResponse);
  }

  async create(orgId: string, input: CreateOrgUnitInput): Promise<OrgUnitResponse> {
    await this.assertCodeFree(orgId, input.code);
    await this.requireType(orgId, input.typeId);

    const parent = input.parentId
      ? await this.requireUnit(orgId, input.parentId)
      : null;

    const unit = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orgUnit.create({
        data: {
          orgId,
          typeId: input.typeId,
          parentId: parent?.id ?? null,
          name: input.name,
          code: input.code,
          path: '',
        },
      });
      return tx.orgUnit.update({
        where: { id: created.id },
        data: { path: `${parent?.path ?? '/'}${created.id}/` },
        include: { type: true },
      });
    });

    addAuditMetadata({
      after: { name: unit.name, code: unit.code, parentId: unit.parentId },
    });
    return toOrgUnitResponse(unit);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateOrgUnitInput,
  ): Promise<OrgUnitResponse> {
    const unit = await this.requireUnit(orgId, id);
    if (input.code && input.code !== unit.code) {
      await this.assertCodeFree(orgId, input.code);
    }
    if (input.typeId) await this.requireType(orgId, input.typeId);

    const updated = await this.prisma.orgUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.typeId !== undefined ? { typeId: input.typeId } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
      },
      include: { type: true },
    });

    addAuditMetadata({
      before: { name: unit.name, code: unit.code, managerId: unit.managerId },
      after: {
        name: updated.name,
        code: updated.code,
        managerId: updated.managerId,
      },
    });
    return toOrgUnitResponse(updated);
  }

  /**
   * Move node: cập nhật path CẢ SUBTREE trong 1 transaction.
   * Cấm move vào chính subtree của mình (tạo chu trình).
   */
  async move(
    orgId: string,
    id: string,
    input: MoveOrgUnitInput,
  ): Promise<OrgUnitResponse> {
    const unit = await this.requireUnit(orgId, id);
    const newParent = input.parentId
      ? await this.requireUnit(orgId, input.parentId)
      : null;

    if (newParent && newParent.path.startsWith(unit.path)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Không thể chuyển đơn vị vào chính nhánh con của nó',
        ERROR_CODES.ORGUNIT_MOVE_INTO_SELF,
      );
    }

    const oldPath = unit.path;
    const newPath = `${newParent?.path ?? '/'}${unit.id}/`;

    await this.prisma.$transaction([
      this.prisma.orgUnit.update({
        where: { id },
        data: { parentId: newParent?.id ?? null },
      }),
      // Thay prefix oldPath → newPath cho toàn bộ subtree (kể cả chính nó).
      // Cast ::int bắt buộc — thiếu thì Postgres hiểu substring(from pattern).
      this.prisma.$executeRaw`
        UPDATE "OrgUnit"
        SET "path" = ${newPath} || substring("path" from (${oldPath.length + 1})::int)
        WHERE "orgId" = ${orgId}::uuid AND "path" LIKE ${oldPath + '%'}
      `,
    ]);

    addAuditMetadata({
      before: { parentId: unit.parentId, path: oldPath },
      after: { parentId: newParent?.id ?? null, path: newPath },
    });

    const moved = await this.prisma.orgUnit.findUniqueOrThrow({
      where: { id },
      include: { type: true },
    });
    return toOrgUnitResponse(moved);
  }

  async remove(orgId: string, id: string): Promise<{ message: string }> {
    const unit = await this.requireUnit(orgId, id);
    const childCount = await this.prisma.orgUnit.count({
      where: { orgId, parentId: id },
    });
    if (childCount > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đơn vị còn đơn vị con — chuyển hoặc xoá đơn vị con trước',
        ERROR_CODES.ORGUNIT_HAS_CHILDREN,
      );
    }
    await this.prisma.orgUnit.delete({ where: { id } });
    addAuditMetadata({ before: { name: unit.name, code: unit.code } });
    return { message: `Đã xoá đơn vị ${unit.name}` };
  }

  /**
   * Các path prefix subtree mà user này quản lý (qua OrgUnit.manager →
   * Employee.userId). Dùng để scope mọi API list cho UNIT_MANAGER.
   * Trả [] = không quản lý unit nào. Path cha đã bao path con → loại trùng.
   */
  async getManagedSubtreePaths(orgId: string, userId: string): Promise<string[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: { orgId, manager: { userId } },
      select: { path: true },
      orderBy: { path: 'asc' },
    });
    const paths: string[] = [];
    for (const { path } of units) {
      if (!paths.some((p) => path.startsWith(p))) paths.push(path);
    }
    return paths;
  }

  async requireUnit(orgId: string, id: string) {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, orgId } });
    if (!unit) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy đơn vị',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return unit;
  }

  private async requireType(orgId: string, typeId: string) {
    const type = await this.prisma.orgUnitType.findFirst({
      where: { id: typeId, orgId },
    });
    if (!type) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy loại đơn vị',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return type;
  }

  private async assertCodeFree(orgId: string, code: string) {
    const taken = await this.prisma.orgUnit.findUnique({
      where: { orgId_code: { orgId, code } },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Code "${code}" đã được dùng trong tổ chức`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
  }
}
