import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { LoginLockoutService } from './login-lockout.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';

@Module({
  imports: [SessionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    TotpService,
    GoogleOAuthService,
    LoginLockoutService,
  ],
  exports: [TokenService, OtpService],
})
export class AuthModule {}
