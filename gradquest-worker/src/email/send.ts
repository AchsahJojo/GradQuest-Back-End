/**
 * Outbound transactional email via Cloudflare Email Sending.
 *
 * Binding needed when a GradQuest sending domain exists:
 *   wrangler.jsonc → send_email: [{ name: "EMAIL" }]
 * Until then this path dry-runs and returns stubbed: true so Spring can wire
 * confirm / due-soon / cancel without a real mailbox.
 */

export type EmailSendPayload = {
  to?: string;
  subject?: string;
  textBody?: string;
  kind?: string;
  reminderId?: number;
  userId?: string;
  schoolId?: number;
};

export type EmailSendResponse = {
  sent: boolean;
  stubbed: boolean;
  reason?: string;
  kind?: string;
};

type EmailBinding = {
  send: (message: {
    to: string | string[];
    from: string;
    subject: string;
    content: Array<{ type: string; value: string }>;
  }) => Promise<void>;
};

export async function handleEmailSend(
  payload: EmailSendPayload,
  env: { EMAIL?: EmailBinding; EMAIL_FROM?: string },
): Promise<EmailSendResponse> {
  const to = (payload.to ?? "").trim();
  const subject = (payload.subject ?? "").trim();
  const textBody = payload.textBody ?? "";
  const kind = payload.kind ?? "unknown";

  if (!to || !subject) {
    return { sent: false, stubbed: false, reason: "missing_to_or_subject", kind };
  }

  const binding = env.EMAIL;
  if (!binding || typeof binding.send !== "function") {
    return {
      sent: false,
      stubbed: true,
      reason: "send_email_binding_not_configured",
      kind,
    };
  }

  const from = (env.EMAIL_FROM ?? "noreply@gradquest.local").trim();
  await binding.send({
    to,
    from,
    subject,
    content: [{ type: "text/plain", value: textBody }],
  });
  return { sent: true, stubbed: false, kind };
}
