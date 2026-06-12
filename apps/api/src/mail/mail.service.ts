import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { MAIL_PROVIDER, type MailProvider } from './mail.provider';

export type OtpMailKind = 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'LOGIN_OTP';

const OTP_SUBJECTS: Record<OtpMailKind, string> = {
  EMAIL_VERIFY: 'Xác thực email của bạn',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  LOGIN_OTP: 'Mã đăng nhập một lần',
};

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly config: AppConfigService,
  ) {}

  /** Cảnh báo đăng nhập từ thiết bị chưa từng thấy. */
  async sendNewDeviceAlert(info: {
    to: string;
    deviceName: string;
    ip: string | null;
    time: string;
  }): Promise<void> {
    const subject = 'Đăng nhập mới từ thiết bị lạ';
    const lines = [
      'Tài khoản của bạn vừa đăng nhập từ một thiết bị chưa từng thấy:',
      `• Thiết bị: ${info.deviceName}`,
      `• IP: ${info.ip ?? 'không rõ'}`,
      `• Thời gian: ${info.time}`,
      '',
      'Nếu là bạn, hãy bỏ qua email này.',
      'Nếu KHÔNG phải bạn: đổi mật khẩu ngay và đăng xuất mọi thiết bị tại trang Bảo mật.',
    ];
    await this.provider.send({
      to: info.to,
      subject,
      text: lines.join('\n'),
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>${subject}</h2>
        <p>Tài khoản của bạn vừa đăng nhập từ một thiết bị chưa từng thấy:</p>
        <ul>
          <li><b>Thiết bị:</b> ${info.deviceName}</li>
          <li><b>IP:</b> ${info.ip ?? 'không rõ'}</li>
          <li><b>Thời gian:</b> ${info.time}</li>
        </ul>
        <p>Nếu là bạn, hãy bỏ qua email này.</p>
        <p style="color:#c00"><b>Nếu KHÔNG phải bạn:</b> đổi mật khẩu ngay và đăng xuất mọi thiết bị tại trang Bảo mật.</p>
      </div>`,
    });
  }

  /** Lời mời tham gia hệ thống — user bấm link để đặt mật khẩu. */
  async sendInvite(info: {
    to: string;
    inviterEmail: string;
    link: string;
  }): Promise<void> {
    const subject = 'Bạn được mời tham gia hệ thống';
    await this.provider.send({
      to: info.to,
      subject,
      text: [
        `${info.inviterEmail} đã mời bạn tham gia hệ thống.`,
        `Nhấn vào link sau để đặt mật khẩu và kích hoạt tài khoản (hết hạn sau 7 ngày):`,
        info.link,
      ].join('\n'),
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>${subject}</h2>
        <p><b>${info.inviterEmail}</b> đã mời bạn tham gia hệ thống.</p>
        <p><a href="${info.link}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Kích hoạt tài khoản</a></p>
        <p style="color:#888">Link hết hạn sau 7 ngày. Nếu bạn không mong đợi lời mời này, hãy bỏ qua email.</p>
      </div>`,
    });
  }

  async sendOtp(to: string, code: string, kind: OtpMailKind): Promise<void> {
    const minutes = Math.ceil(this.config.otpTtlSeconds / 60);
    const subject = OTP_SUBJECTS[kind];
    const text = [
      `Mã xác thực của bạn: ${code}`,
      `Mã có hiệu lực trong ${minutes} phút và chỉ dùng được 1 lần.`,
      'Nếu bạn không yêu cầu mã này, hãy bỏ qua email.',
    ].join('\n');
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>${subject}</h2>
        <p>Mã xác thực của bạn:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
        <p>Mã có hiệu lực trong <b>${minutes} phút</b> và chỉ dùng được 1 lần.</p>
        <p style="color:#888">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
      </div>`;
    await this.provider.send({ to, subject, text, html });
  }
}
