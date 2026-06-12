import { Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from '../mail.provider';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoOptions {
  apiKey: string;
  fromName: string;
  fromAddress: string;
}

/**
 * Gửi mail qua Brevo HTTP API (ưu tiên hơn SMTP relay):
 * - Lỗi trả về rõ ràng (sender chưa verify, hết quota...) thay vì
 *   "250 queued" rồi im lặng như SMTP.
 * - Không phụ thuộc port 587 (hay bị chặn trên VPS/firewall).
 * Lấy API key (xkeysib-...) tại Brevo dashboard → Settings → API Keys.
 */
export class BrevoMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  constructor(private readonly options: BrevoOptions) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': this.options.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: this.options.fromName,
          email: this.options.fromAddress,
        },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Throw để BullMQ retry + log lý do cụ thể từ Brevo
      throw new Error(`Brevo API ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as { messageId?: string };
    this.logger.log(
      `📧 [brevo] đã gửi tới ${message.to}: "${message.subject}" (${data.messageId ?? 'không có messageId'})`,
    );
  }
}
