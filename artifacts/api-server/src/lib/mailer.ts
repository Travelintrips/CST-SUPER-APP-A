import { Resend } from "resend";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

function getResend(): { client: Resend; from: string } {
  const apiKey = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM ?? "noreply@cstlogistic.co.id").trim();

  if (!apiKey) {
    throw new Error("Resend API key missing. Set SMTP_PASS environment variable.");
  }

  return { client: new Resend(apiKey), from };
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  const { client, from } = getResend();

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
    throw new Error(`Resend error: ${error.message}`);
  }
}

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_PASS?.trim());
}
