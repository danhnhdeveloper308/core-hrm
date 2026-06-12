import {
  acceptInviteSchema,
  changePasswordSchema,
  disable2faSchema,
  enable2faSchema,
  forgotPasswordSchema,
  loginSchema,
  recovery2faSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verify2faSchema,
  verifyOtpSchema,
} from '@repo/shared';
import { createZodDto } from 'nestjs-zod';

// DTO chỉ wrap zod schema từ @repo/shared — không bao giờ định nghĩa lại rule

export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class ResendOtpDto extends createZodDto(resendOtpSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class Enable2faDto extends createZodDto(enable2faSchema) {}
export class Verify2faDto extends createZodDto(verify2faSchema) {}
export class Recovery2faDto extends createZodDto(recovery2faSchema) {}
export class Disable2faDto extends createZodDto(disable2faSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}
