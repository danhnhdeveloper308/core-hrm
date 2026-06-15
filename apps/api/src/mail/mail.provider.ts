export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Interface cho mọi provider gửi mail — swap console/SMTP/SES... qua DI. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = 'MAIL_PROVIDER';
