import { Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from '../mail.provider';

/** Dev: log mail ra console thay vì gửi thật. */
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `📧 [console] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return Promise.resolve();
  }
}
