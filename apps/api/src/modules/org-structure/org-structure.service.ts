import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CreateOrgUnitTypeInput,
  type CreatePositionInput,
  type CreateWorksiteInput,
  type OrganizationResponse,
  type OrgUnitTypeResponse,
  type PositionResponse,
  type UpdateOrganizationInput,
  type UpdateOrgUnitTypeInput,
  type UpdatePositionInput,
  type UpdateWorksiteInput,
  type WorksiteResponse,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { OrgUnitType, Position, Worksite } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';

function toTypeResponse(t: OrgUnitType): OrgUnitTypeResponse {
  return { id: t.id, code: t.code, name: t.name, rank: t.rank };
}

function toPositionResponse(p: Position): PositionResponse {
  return { id: p.id, name: p.name, code: p.code };
}

function toWorksiteResponse(w: Worksite): WorksiteResponse {
  return {
    id: w.id,
    name: w.name,
    address: w.address,
    lat: w.lat,
    lng: w.lng,
    radiusM: w.radiusM,
    requireFace: w.requireFace,
    requireLocation: w.requireLocation,
  };
}

/** Own-org info + CRUD OrgUnitType / Position / Worksite — đều scope orgId. */
@Injectable()
export class OrgStructureService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Own org =====

  async getOwnOrg(orgId: string): Promise<OrganizationResponse> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
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

  async updateOwnOrg(
    orgId: string,
    input: Omit<UpdateOrganizationInput, 'status'>,
  ): Promise<OrganizationResponse> {
    const before = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });
    addAuditMetadata({
      before: { name: before.name, timezone: before.timezone },
      after: { name: input.name ?? before.name, timezone: input.timezone ?? before.timezone },
    });
    return this.getOwnOrg(orgId);
  }

  // ===== OrgUnitType =====

  async listTypes(orgId: string): Promise<OrgUnitTypeResponse[]> {
    const types = await this.prisma.orgUnitType.findMany({
      where: { orgId },
      orderBy: { rank: 'asc' },
    });
    return types.map(toTypeResponse);
  }

  async createType(
    orgId: string,
    input: CreateOrgUnitTypeInput,
  ): Promise<OrgUnitTypeResponse> {
    const taken = await this.prisma.orgUnitType.findUnique({
      where: { orgId_code: { orgId, code: input.code } },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Code "${input.code}" đã được dùng`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
    const type = await this.prisma.orgUnitType.create({
      data: { ...input, orgId },
    });
    addAuditMetadata({ after: { code: type.code, name: type.name } });
    return toTypeResponse(type);
  }

  async updateType(
    orgId: string,
    id: string,
    input: UpdateOrgUnitTypeInput,
  ): Promise<OrgUnitTypeResponse> {
    const type = await this.requireType(orgId, id);
    if (input.code && input.code !== type.code) {
      const taken = await this.prisma.orgUnitType.findUnique({
        where: { orgId_code: { orgId, code: input.code } },
      });
      if (taken) {
        throw new AppException(
          HttpStatus.CONFLICT,
          `Code "${input.code}" đã được dùng`,
          ERROR_CODES.ORG_CODE_TAKEN,
        );
      }
    }
    const updated = await this.prisma.orgUnitType.update({
      where: { id },
      data: input,
    });
    addAuditMetadata({
      before: { code: type.code, name: type.name, rank: type.rank },
      after: { code: updated.code, name: updated.name, rank: updated.rank },
    });
    return toTypeResponse(updated);
  }

  async removeType(orgId: string, id: string): Promise<{ message: string }> {
    const type = await this.requireType(orgId, id);
    const inUse = await this.prisma.orgUnit.count({ where: { typeId: id } });
    if (inUse > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Loại đơn vị đang được ${inUse} đơn vị sử dụng`,
        ERROR_CODES.ORGUNIT_TYPE_IN_USE,
      );
    }
    await this.prisma.orgUnitType.delete({ where: { id } });
    addAuditMetadata({ before: { code: type.code, name: type.name } });
    return { message: `Đã xoá loại đơn vị ${type.name}` };
  }

  // ===== Position =====

  async listPositions(orgId: string): Promise<PositionResponse[]> {
    const positions = await this.prisma.position.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return positions.map(toPositionResponse);
  }

  async createPosition(
    orgId: string,
    input: CreatePositionInput,
  ): Promise<PositionResponse> {
    const taken = await this.prisma.position.findUnique({
      where: { orgId_code: { orgId, code: input.code } },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        `Code "${input.code}" đã được dùng`,
        ERROR_CODES.ORG_CODE_TAKEN,
      );
    }
    const position = await this.prisma.position.create({
      data: { ...input, orgId },
    });
    addAuditMetadata({ after: { code: position.code, name: position.name } });
    return toPositionResponse(position);
  }

  async updatePosition(
    orgId: string,
    id: string,
    input: UpdatePositionInput,
  ): Promise<PositionResponse> {
    const position = await this.requirePosition(orgId, id);
    if (input.code && input.code !== position.code) {
      const taken = await this.prisma.position.findUnique({
        where: { orgId_code: { orgId, code: input.code } },
      });
      if (taken) {
        throw new AppException(
          HttpStatus.CONFLICT,
          `Code "${input.code}" đã được dùng`,
          ERROR_CODES.ORG_CODE_TAKEN,
        );
      }
    }
    const updated = await this.prisma.position.update({ where: { id }, data: input });
    addAuditMetadata({
      before: { code: position.code, name: position.name },
      after: { code: updated.code, name: updated.name },
    });
    return toPositionResponse(updated);
  }

  async removePosition(orgId: string, id: string): Promise<{ message: string }> {
    const position = await this.requirePosition(orgId, id);
    await this.prisma.position.delete({ where: { id } });
    addAuditMetadata({ before: { code: position.code, name: position.name } });
    return { message: `Đã xoá chức danh ${position.name}` };
  }

  // ===== Worksite =====

  async listWorksites(orgId: string): Promise<WorksiteResponse[]> {
    const worksites = await this.prisma.worksite.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return worksites.map(toWorksiteResponse);
  }

  async createWorksite(
    orgId: string,
    input: CreateWorksiteInput,
  ): Promise<WorksiteResponse> {
    const worksite = await this.prisma.worksite.create({
      data: {
        orgId,
        name: input.name,
        address: input.address ?? null,
        lat: input.lat,
        lng: input.lng,
        radiusM: input.radiusM,
        requireFace: input.requireFace,
        requireLocation: input.requireLocation,
      },
    });
    addAuditMetadata({ after: { name: worksite.name } });
    return toWorksiteResponse(worksite);
  }

  async updateWorksite(
    orgId: string,
    id: string,
    input: UpdateWorksiteInput,
  ): Promise<WorksiteResponse> {
    const worksite = await this.requireWorksite(orgId, id);
    const updated = await this.prisma.worksite.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.lat !== undefined ? { lat: input.lat } : {}),
        ...(input.lng !== undefined ? { lng: input.lng } : {}),
        ...(input.radiusM !== undefined ? { radiusM: input.radiusM } : {}),
        ...(input.requireFace !== undefined
          ? { requireFace: input.requireFace }
          : {}),
        ...(input.requireLocation !== undefined
          ? { requireLocation: input.requireLocation }
          : {}),
      },
    });
    addAuditMetadata({
      before: { name: worksite.name, radiusM: worksite.radiusM },
      after: { name: updated.name, radiusM: updated.radiusM },
    });
    return toWorksiteResponse(updated);
  }

  async removeWorksite(orgId: string, id: string): Promise<{ message: string }> {
    const worksite = await this.requireWorksite(orgId, id);
    await this.prisma.worksite.delete({ where: { id } });
    addAuditMetadata({ before: { name: worksite.name } });
    return { message: `Đã xoá địa điểm ${worksite.name}` };
  }

  // ===== helpers =====

  private async requireType(orgId: string, id: string) {
    const type = await this.prisma.orgUnitType.findFirst({ where: { id, orgId } });
    if (!type) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy loại đơn vị',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return type;
  }

  private async requirePosition(orgId: string, id: string) {
    const position = await this.prisma.position.findFirst({ where: { id, orgId } });
    if (!position) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy chức danh',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return position;
  }

  private async requireWorksite(orgId: string, id: string) {
    const worksite = await this.prisma.worksite.findFirst({ where: { id, orgId } });
    if (!worksite) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy địa điểm làm việc',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return worksite;
  }
}
