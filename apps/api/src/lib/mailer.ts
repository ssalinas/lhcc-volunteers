import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProduction } from '../config/env.js';

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

/**
 * No-ops when SMTP isn't configured — callers don't need to guard. Outside production, an
 * unconfigured mailer instead writes each email to `<DATABASE_PATH dir>/dev-outbox/*.html` so
 * email content and links can be checked locally without sending anything.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!isMailerConfigured()) {
    if (!isProduction) await writeToDevOutbox(message);
    return;
  }
  await getTransporter().sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    ...message,
  });
}

async function writeToDevOutbox(message: MailMessage) {
  const dir = join(dirname(env.DATABASE_PATH), 'dev-outbox');
  await mkdir(dir, { recursive: true });
  const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_');
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeTo}.html`);
  await writeFile(file, `<!-- To: ${message.to} | Subject: ${message.subject} -->\n${message.html}`);
  console.log(`[mailer] SMTP not configured — wrote email to ${file}`);
}
