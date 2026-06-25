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
  type ApprovalChangedEvent,
  type ApprovalDecidedEvent,
} from '../../common/events/app.events';
import { AppException } from '../../common/exceptions/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
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
  UNIT_MANAGER_OF_UNIT: 'Quản lý đơn vị',
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
    private readonly notifications: NotificationService,
  ) {}

  /** Emit realtime invalidate cho requester + approver liên quan (bỏ userId null). */
  private emitApprovalChanged(
    userIds: (string | null | undefined)[],
    targetType: ApprovalTargetType,
    targetId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ): void {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    this.events.emit(APP_EVENTS.APPROVAL_CHANGED, {
      userIds: ids,
      targetType,
      targetId,
      status,
    } satisfies ApprovalChangedEvent);
  }

  /** Thông báo cho người duyệt của bước đang chờ (inbox). */
  private async notifyApprovers(
    orgId: string,
    instanceId: string,
    approverIds: string[],
    summary: string | null,
  ): Promise<void> {
    await this.notifications.dispatch({
      orgId,
      userIds: approverIds,
      type: 'APPROVAL_PENDING',
      title: 'Có đơn cần bạn duyệt',
      body: summary ?? 'Bạn có một đơn mới cần phê duyệt',
      link: '/dashboard/approvals',
      data: { approvalInstanceId: instanceId },
    });
  }

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
    summary?: string,
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

    // Chống tạo trùng: 1 đối tượng chỉ có 1 phiếu duyệt đang chờ (backstop bằng
    // partial unique index ApprovalInstance_pending_target_key cho race).
    const existingPending = await this.prisma.approvalInstance.findFirst({
      where: { orgId, targetType, targetId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Đơn này đã có phiếu duyệt đang chờ xử lý',
        ERROR_CODES.APPROVAL_ALREADY_PENDING,
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
        // Nhãn cấu hình (DUYỆT, GĐNM…) ưu tiên; fallback theo loại approver
        label: step.label ?? stepLabel(step),
        approverIds,
        approverNames: names,
        skipped: approverIds.length === 0,
        decidedByName: null,
        decision: null,
        note: null,
        decidedAt: null,
        slaHours: step.slaHours ?? null,
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
        summary: summary ?? null,
        currentStep: firstActive?.order ?? 0,
        status,
        stepsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    if (status === 'APPROVED') {
      await this.emitDecided(orgId, targetType, targetId, 'APPROVED');
    } else if (firstActive) {
      // Thông báo người duyệt bước đầu tiên
      await this.notifyApprovers(
        orgId,
        instance.id,
        firstActive.approverIds,
        summary ?? null,
      );
    }

    // Realtime: cập nhật UI cho requester + người duyệt (không cần reload)
    this.emitApprovalChanged(
      [requester.userId, ...(firstActive?.approverIds ?? [])],
      targetType,
      targetId,
      status,
    );
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

    const requester = await this.prisma.employee.findUnique({
      where: { id: instance.requesterEmpId },
      select: { userId: true },
    });

    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      await this.emitDecided(orgId, instance.targetType, instance.targetId, newStatus);
      // Báo người tạo đơn kết quả cuối
      if (requester?.userId) {
        await this.notifications.dispatch({
          orgId,
          userIds: [requester.userId],
          type: 'APPROVAL_DECIDED',
          title:
            newStatus === 'APPROVED'
              ? 'Đơn của bạn đã được duyệt'
              : 'Đơn của bạn bị từ chối',
          body: instance.summary ?? 'Đơn của bạn đã được xử lý',
          link: '/dashboard/approvals',
          data: { approvalInstanceId: instance.id },
        });
      }
    } else if (newStatus === 'PENDING') {
      // Chuyển sang bước kế → báo người duyệt bước đó
      const nextStep = snapshot.find((s) => s.order === newCurrent);
      if (nextStep) {
        await this.notifyApprovers(
          orgId,
          instance.id,
          nextStep.approverIds,
          instance.summary,
        );
      }
    }

    // Realtime: requester + MỌI approver trong flow (kể cả OR-group, bước trước/sau)
    this.emitApprovalChanged(
      [
        requester?.userId,
        actorUserId,
        ...snapshot.flatMap((s) => s.approverIds),
      ],
      instance.targetType,
      instance.targetId,
      newStatus,
    );

    return this.getInstance(orgId, instance.id);
  }

  /**
   * Huỷ instance khi người gửi huỷ đơn gốc: set CANCELLED + báo realtime cho
   * người duyệt (gỡ khỏi inbox + thông báo) và cập nhật UI requester/approver.
   */
  async cancelByTarget(orgId: string, targetId: string): Promise<void> {
    const instances = await this.prisma.approvalInstance.findMany({
      where: { orgId, targetId, status: 'PENDING' },
    });
    if (instances.length === 0) return;
    await this.prisma.approvalInstance.updateMany({
      where: { orgId, targetId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    for (const inst of instances) {
      const snap = inst.stepsSnapshot as unknown as SnapshotStep[];
      const current = snap.find((s) => s.order === inst.currentStep);
      const requester = await this.prisma.employee.findUnique({
        where: { id: inst.requesterEmpId },
        select: { userId: true },
      });
      // Báo người duyệt bước hiện tại: đơn đã bị người gửi huỷ (in-app, không email)
      if (current && current.approverIds.length > 0) {
        await this.notifications.dispatch({
          orgId,
          userIds: current.approverIds,
          type: 'GENERAL',
          title: 'Đơn đã được người gửi huỷ',
          body: inst.summary ?? 'Một đơn chờ bạn duyệt đã được người gửi huỷ',
          link: '/dashboard/approvals',
          data: { approvalInstanceId: inst.id },
          email: false,
        });
      }
      // Realtime: requester + mọi approver → inbox gỡ item, history hiện "đã huỷ"
      this.emitApprovalChanged(
        [requester?.userId, ...snap.flatMap((s) => s.approverIds)],
        inst.targetType,
        inst.targetId,
        'CANCELLED',
      );
    }
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

  /**
   * "Đã xử lý" của 1 người duyệt: đơn actor ĐÃ duyệt/từ chối (có ApprovalAction)
   * + đơn bị NGƯỜI GỬI HUỶ khi actor đang là người duyệt bước hiện tại (hiển thị
   * trạng thái "Đã huỷ" để biết kết cục, dù chưa kịp xử lý).
   */
  async history(orgId: string, actorUserId: string): Promise<ApprovalInstanceResponse[]> {
    const actions = await this.prisma.approvalAction.findMany({
      where: { actorId: actorUserId, instance: { orgId } },
      select: { instanceId: true },
    });
    const actedIds = [...new Set(actions.map((a) => a.instanceId))];
    const acted = await this.prisma.approvalInstance.findMany({
      where: { id: { in: actedIds }, orgId },
    });

    // Đơn bị huỷ khi actor là người duyệt bước hiện tại (chưa kịp xử lý)
    const cancelled = await this.prisma.approvalInstance.findMany({
      where: { orgId, status: 'CANCELLED' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const actedSet = new Set(actedIds);
    const cancelledMine = cancelled.filter((inst) => {
      if (actedSet.has(inst.id)) return false;
      const snap = inst.stepsSnapshot as unknown as SnapshotStep[];
      const step = snap.find((s) => s.order === inst.currentStep);
      return step?.approverIds.includes(actorUserId) ?? false;
    });

    const merged = [...acted, ...cancelledMine].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return Promise.all(merged.map((i) => this.toResponse(i)));
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
    summary: string | null;
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
      summary: instance.summary,
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
