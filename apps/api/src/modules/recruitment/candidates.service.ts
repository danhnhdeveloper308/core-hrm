import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type CandidateResponse,
  type CreateCandidateInput,
  type UpdateCandidateInput,
} from '@repo/shared';
import { addAuditMetadata } from '../../common/audit/audit-context';
import { AppException } from '../../common/exceptions/app.exception';
import type { Candidate } from '../../prisma/prisma.types';
import { PrismaService } from '../../prisma/prisma.service';

function toResponse(c: Candidate): CandidateResponse {
  return {
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    source: c.source,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Ứng viên (chưa phải User/Employee). */
@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, search?: string): Promise<CandidateResponse[]> {
    const rows = await this.prisma.candidate.findMany({
      where: {
        orgId,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toResponse);
  }

  async create(
    orgId: string,
    input: CreateCandidateInput,
  ): Promise<CandidateResponse> {
    const c = await this.prisma.candidate.create({
      data: {
        orgId,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        note: input.note ?? null,
      },
    });
    addAuditMetadata({ after: { fullName: c.fullName } });
    return toResponse(c);
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateCandidateInput,
  ): Promise<CandidateResponse> {
    await this.require(orgId, id);
    const c = await this.prisma.candidate.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
    addAuditMetadata({ after: { fullName: c.fullName } });
    return toResponse(c);
  }

  private async require(orgId: string, id: string) {
    const c = await this.prisma.candidate.findFirst({ where: { id, orgId } });
    if (!c) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Không tìm thấy ứng viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return c;
  }
}
