import { Global, Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { MAIL_PROVIDER } from './mail.provider';
import { MailService } from './mail.service';
import { BrevoMailProvider } from './providers/brevo-mail.provider';
import { ConsoleMailProvider } from './providers/console-mail.provider';
import { SmtpMailProvider } from './providers/smtp-mail.provider';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [AppConfigService],
      // Ưu tiên: Brevo HTTP API → SMTP relay → console (dev).
      // LƯU Ý: mọi instance API cùng consume queue `email` — instance nào
      // cấu hình mail khác (vd console) sẽ "nuốt" job của instance khác.
      useFactory: (config: AppConfigService) => {
        const logger = new Logger('Mail');
        if (config.brevo) {
          logger.log(`Mail provider: Brevo API (from: ${config.brevo.fromAddress})`);
          return new BrevoMailProvider(config.brevo);
        }
        if (config.mail) {
          logger.log(
            `Mail provider: SMTP ${config.mail.host}:${config.mail.port} (from: ${config.mail.fromAddress})`,
          );
          return new SmtpMailProvider(config.mail);
        }
        logger.warn('Mail provider: console — OTP chỉ log ra terminal, KHÔNG gửi mail thật');
        return new ConsoleMailProvider();
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
