import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ERROR_CODES,
  type ApprovalDecision,
  type ApprovalInstanceResponse,
  type ApprovalStepState,
  type ApprovalTargetType,
  type ApproverType,
} from '@repo/shared';
import {
  APP_EVENTS,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { selectFlow, type ConditionContext } from './approval.conditions';
import {
  ApprovalResolverService,
  type FlowStepLike,
} from './approval-resolver.service';

type SnapshotStep = ApprovalStepState;

const APPROVER_TYPE_LABEL: Record<ApproverType, string> = {
  DIRECT_MANAGER: 'Quản lý trực tiếp',
  MANAGEMENT_CHAIN: 'Cấp quản lý',
  UNIT_MANAGER_OF_TYPE: 'Quản lý đơn vị',
  ROLE: 'Vai trò',
  SPECIFIC_USER: 'Người chỉ định',
};

function stepLabel(step: FlowStepLike): string {
  const base = APPROVER_TYPE_LABEL[step.approverType];
  if (step.approverType === 'MANAGEMENT_CHAIN') return `${base} (${step.chainLevel})`;
  if (step.approverType === 'UNIT_MANAGER_OF_TYPE') return `${base}: ${step.unitTypeCode}`;
  return base;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ApprovalResolverService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Tạo ApprovalInstance cho 1 đơn: chọn flow theo priority+conditions, resolve
   * approvers từng bước (snapshot), auto-skip bước rỗng/ra chính requester.
   * Trả status — nếu mọi bước skip → APPROVED ngay (phát event).
   */
  async createInstance(
    orgId: string,
    targetType: ApprovalTargetType,
    targetId: string,
    requesterEmpId: string,
    ctx: ConditionContext,
  ): Promise<{ instanceId: string; status: 'PENDING' | 'APPROVED' }> {
    const flows = await this.prisma.approvalFlow.findMany({
      where: { orgId, targetType, active: true },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    const flow = selectFlow(flows, ctx);
    if (!flow) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Chưa cấu hình luồng duyệt cho loại đơn này',
        ERROR_CODES.APPROVAL_NO_FLOW,
      );
    }

    const requester = await this.prisma.employee.findUniqueOrThrow({
      where: { id: requesterEmpId },
      select: { id: true, userId: true, orgId: true },
    });

    const snapshot: SnapshotStep[] = [];
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i]!;
      const resolved = await this.resolver.resolveStep(step, {
        employeeId: requester.id,
        userId: requester.userId,
        orgId,
      });
      // Loại requester khỏi danh sách (không tự duyệt đơn của mình)
      const approverIds = resolved.userIds.filter((id) => id !== requester.userId);
      const names = resolved.names.filter(
        (_, idx) => resolved.userIds[idx] !== requester.userId,
      );
      snapshot.push({
        order: i + 1,
        approverType: step.approverType,
        label: stepLabel(step),
        approverIds,
        approverNames: names,
        skipped: approverIds.length === 0,
        decidedByName: null,
        decision: null,
        note: null,
        decidedAt: null,
      });
    }

    const firstActive = snapshot.find((s) => !s.skipped);
    const status = firstActive ? 'PENDING' : 'APPROVED';

    const instance = await this.prisma.approvalInstance.create({
      data: {
        orgId,
        targetType,
        targetId,
        flowId: flow.id,
        requesterEmpId,
        currentStep: firstActive?.order ?? 0,
        status,
        stepsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    if (status === 'APPROVED') {
      await this.emitDecided(orgId, targetType, targetId, 'APPROVED');
    }
    return { instanceId: instance.id, status };
  }

  /**
   * Duyệt/từ chối bước hiện tại. actor phải nằm trong approverIds của bước,
   * HOẶC canOverride (HR có quyền *:approve — "duyệt thay").
   */
  async decide(
    orgId: string,
    instanceId: string,
    actorUserId: string,
    decision: ApprovalDecision,
    note: string | null,
    canOverride: boolean,
  ): Promise<ApprovalInstanceResponse> {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { id: instanceId, orgId },
    });
    if (!instance) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Không tìm thấy đơn', ERROR_CODES.NOT_FOUND);
    }
    if (instance.status !== 'PENDING') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đơn đã được xử lý',
        ERROR_CODES.APPROVAL_ALREADY_DECIDED,
      );
    }

    const snapshot = instance.stepsSnapshot as unknown as SnapshotStep[];
    const current = snapshot.find((s) => s.order === instance.currentStep);
    if (!current) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Bước duyệt không hợp lệ',
        ERROR_CODES.APPROVAL_ALREADY_DECIDED,
      );
    }
    const isApprover = current.approverIds.includes(actorUserId);
    if (!isApprover && !canOverride) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Bạn không phải người duyệt bước này',
        ERROR_CODES.APPROVAL_NOT_YOUR_TURN,
      );
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });
    const finalNote = !isApprover && canOverride ? `(duyệt thay) ${note ?? ''}`.trim() : note;
    current.decidedByName = actor?.name ?? null;
    current.decision = decision;
    current.note = finalNote ?? null;
    current.decidedAt = new Date().toISOString();

    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        step: current.order,
        actorId: actorUserId,
        decision,
        note: finalNote ?? null,
      },
    });

    let newStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = instance.status;
    let newCurrent = instance.currentStep;
    if (decision === 'REJECT') {
      newStatus = 'REJECTED';
    } else {
      const next = snapshot.find((s) => s.order > current.order && !s.skipped);
      if (next) {
        newCurrent = next.order;
      } else {
        newStatus = 'APPROVED';
      }
    }

    await this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: newStatus,
        currentStep: newCurrent,
        stepsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      await this.emitDecided(orgId, instance.targetType, instance.targetId, newStatus);
    }

    return this.getInstance(orgId, instance.id);
  }

  /** Huỷ instance khi đơn gốc bị huỷ. */
  async cancelByTarget(orgId: string, targetId: string): Promise<void> {
    await this.prisma.approvalInstance.updateMany({
      where: { orgId, targetId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  }

  /** Đơn đang chờ CHÍNH actor duyệt (bước hiện tại). */
  async inbox(orgId: string, actorUserId: string): Promise<ApprovalInstanceResponse[]> {
    const pending = await this.prisma.approvalInstance.findMany({
      where: { orgId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    const mine = pending.filter((inst) => {
      const snap = inst.stepsSnapshot as unknown as SnapshotStep[];
      const step = snap.find((s) => s.order === inst.currentStep);
      return step?.approverIds.includes(actorUserId);
    });
    return Promise.all(mine.map((i) => this.toResponse(i)));
  }

  /** Đơn mà actor ĐÃ xử lý (có ApprovalAction) — lịch sử duyệt của cấp quản lý. */
  async history(orgId: string, actorUserId: string): Promise<ApprovalInstanceResponse[]> {
    const actions = await this.prisma.approvalAction.findMany({
      where: { actorId: actorUserId, instance: { orgId } },
      orderBy: { decidedAt: 'desc' },
      select: { instanceId: true },
    });
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const a of actions) {
      if (!seen.has(a.instanceId)) {
        seen.add(a.instanceId);
        ids.push(a.instanceId);
      }
    }
    const instances = await this.prisma.approvalInstance.findMany({
      where: { id: { in: ids }, orgId },
    });
    const byId = new Map(instances.map((i) => [i.id, i]));
    // Giữ thứ tự đã xử lý gần nhất
    const ordered = ids.map((id) => byId.get(id)).filter((i) => i !== undefined);
    return Promise.all(ordered.map((i) => this.toResponse(i)));
  }

  async getInstance(orgId: string, id: string): Promise<ApprovalInstanceResponse> {
    const instance = await this.prisma.approvalInstance.findFirstOrThrow({
      where: { id, orgId },
    });
    return this.toResponse(instance);
  }

  async getByTarget(
    orgId: string,
    targetId: string,
  ): Promise<ApprovalInstanceResponse | null> {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { orgId, targetId },
      orderBy: { createdAt: 'desc' },
    });
    return instance ? this.toResponse(instance) : null;
  }

  private async toResponse(instance: {
    id: string;
    targetType: ApprovalTargetType;
    targetId: string;
    requesterEmpId: string;
    currentStep: number;
    status: string;
    stepsSnapshot: unknown;
    createdAt: Date;
  }): Promise<ApprovalInstanceResponse> {
    const requester = await this.prisma.employee.findUnique({
      where: { id: instance.requesterEmpId },
      select: { fullName: true },
    });
    return {
      id: instance.id,
      targetType: instance.targetType,
      targetId: instance.targetId,
      requesterName: requester?.fullName ?? '—',
      currentStep: instance.currentStep,
      status: instance.status as ApprovalInstanceResponse['status'],
      steps: instance.stepsSnapshot as unknown as ApprovalStepState[],
      createdAt: instance.createdAt.toISOString(),
    };
  }

  /**
   * Phát APPROVAL_DECIDED và CHỜ các listener (leave/attendance) chạy xong, để
   * trạng thái đơn gốc (LeaveRequest…) nhất quán ngay khi response trả về —
   * tránh cửa sổ race giữa instance=APPROVED và đơn gốc còn PENDING.
   */
  private async emitDecided(
    orgId: string,
    targetType: ApprovalTargetType,
    targetId: string,
    status: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    const event: ApprovalDecidedEvent = { orgId, targetType, targetId, status };
    await this.events.emitAsync(APP_EVENTS.APPROVAL_DECIDED, event);
  }
}
