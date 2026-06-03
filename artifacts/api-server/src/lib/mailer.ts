import { Resend } from "resend";
import { logNotification } from "./notificationLog.js";
import { getAppConfig, getCachedOrEnvConfig } from "./appConfig.js";

// Pre-warm cache so sync isSmtpConfigured() check is accurate immediately
getAppConfig("SMTP_PASS").catch(() => {});
getAppConfig("SMTP_FROM").catch(() => {});

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

async function getResend(): Promise<{ client: Resend; from: string }> {
  const apiKey = await getAppConfig("SMTP_PASS");
  const from = (await getAppConfig("SMTP_FROM", "noreply@cstlogistic.co.id")).trim();

  if (!apiKey) {
    throw new Error("Resend API key missing. Set SMTP_PASS environment variable or add SMTP_PASS to App Config (DB).");
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

export function isSmtpConfigured(): boolean {
  return !!getCachedOrEnvConfig("SMTP_PASS");
}
