import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from '../mail.provider';

interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  fromName: string;
  fromAddress: string;
}

export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: SmtpOptions) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(options.user && options.pass
        ? { auth: { user: options.user, pass: options.pass } }
        : {}),
    });
    this.from = `"${options.fromName}" <${options.fromAddress}>`;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(`📧 [smtp] đã gửi tới ${message.to}: "${message.subject}"`);
  }
}
