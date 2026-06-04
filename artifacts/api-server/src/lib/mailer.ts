import { Resend } from "resend";
import { logNotification } from "./notificationLog.js";
import { getCachedOrEnvConfig } from "./appConfig.js";
import { getSmtpPass, getSmtpFrom } from "./appSecrets.js";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  context?: string;
  refType?: string;
  refId?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

let _hasSmtpKey: boolean = !!(process.env.SMTP_PASS?.trim());

export function isSmtpConfigured(): boolean {
  return _hasSmtpKey || !!getCachedOrEnvConfig("SMTP_PASS");
}

export async function warmupMailer(): Promise<void> {
  try {
    const apiKey = await getSmtpPass();
    _hasSmtpKey = !!apiKey;
  } catch { }
}

async function getResend(): Promise<{ client: Resend; from: string }> {
  const apiKey = await getSmtpPass();
  const from = await getSmtpFrom();

  _hasSmtpKey = !!apiKey;

  if (!apiKey) {
    throw new Error("Resend API key missing. Set SMTP_PASS di env atau Settings → Secrets.");
  }

  return { client: new Resend(apiKey), from };
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  const { client, from } = await getResend();

  const attachments = opts.attachments?.map((a) => ({
    filename: a.filename,
    content: a.content,
  }));

  const { error } = await client.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments,
  });

  if (error) {
    await logNotification({
      channel: "email",
      recipient: opts.to,
      subject: opts.subject,
      message: opts.text,
      status: "failed",
      errorMsg: error.message,
      context: opts.context,
      refType: opts.refType,
      refId: opts.refId,
    });
    throw new Error(`Resend error: ${error.message}`);
  }

  await logNotification({
    channel: "email",
    recipient: opts.to,
    subject: opts.subject,
    message: opts.text,
    status: "sent",
    context: opts.context,
    refType: opts.refType,
    refId: opts.refId,
  });
}
