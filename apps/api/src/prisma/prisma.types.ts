/**
 * Alias ngắn gọn cho model types của Prisma 7 (generator mới đặt tên
 * `UserModel`, `SessionModel`...). App code import từ đây thay vì đụng
 * trực tiếp vào src/generated.
 */
import type {
  AttendanceCorrectionModel,
  AttendanceLogModel,
  AuditLogModel,
  DeviceModel,
  EmployeeModel,
  EmploymentContractModel,
  FaceProfileModel,
  HolidayCalendarModel,
  HolidayModel,
  ShiftAssignmentModel,
  TimesheetDayModel,
  WorkShiftModel,
  OAuthAccountModel,
  OrgUnitModel,
  OrgUnitTypeModel,
  OrganizationModel,
  PermissionModel,
  PositionModel,
  RecoveryCodeModel,
  RoleModel,
  RolePermissionModel,
  SessionModel,
  UserModel,
  UserRoleModel,
  VerificationTokenModel,
  WorksiteModel,
} from '../generated/prisma/models';

export type User = UserModel;
export type Role = RoleModel;
export type Permission = PermissionModel;
export type RolePermission = RolePermissionModel;
export type UserRole = UserRoleModel;
export type Session = SessionModel;
export type Device = DeviceModel;
export type OAuthAccount = OAuthAccountModel;
export type VerificationToken = VerificationTokenModel;
export type RecoveryCode = RecoveryCodeModel;
export type AuditLog = AuditLogModel;
export type Organization = OrganizationModel;
export type Employee = EmployeeModel;
export type EmploymentContract = EmploymentContractModel;
export type OrgUnitType = OrgUnitTypeModel;
export type OrgUnit = OrgUnitModel;
export type Position = PositionModel;
export type Worksite = WorksiteModel;
export type WorkShift = WorkShiftModel;
export type ShiftAssignment = ShiftAssignmentModel;
export type HolidayCalendar = HolidayCalendarModel;
export type Holiday = HolidayModel;
export type AttendanceLog = AttendanceLogModel;
export type TimesheetDay = TimesheetDayModel;
export type AttendanceCorrection = AttendanceCorrectionModel;
export type FaceProfile = FaceProfileModel;

export {
  UserStatus,
  OAuthProvider,
  VerificationType,
  OrgStatus,
  EmployeeStatus,
  Gender,
  ContractType,
  AttendanceType,
  AttendanceSource,
  TimesheetStatus,
  CorrectionStatus,
} from '../generated/prisma/enums';
