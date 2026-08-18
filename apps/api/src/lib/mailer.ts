import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: true,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_APP_PASSWORD! },
  });
  return transporter;
}

export function isMailerConfigured(): boolean {
  return !!(env.SMTP_USER && env.SMTP_APP_PASSWORD);
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** No-ops when SMTP isn't configured — callers don't need to guard. */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!isMailerConfigured()) return;
  await getTransporter().sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    ...message,
  });
}
