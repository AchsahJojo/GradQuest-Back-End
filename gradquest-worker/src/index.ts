import { getAgentByName } from "agents";
import { secretsMatch } from "./auth/secret";
import { SopAgent } from "./agent/SopAgent";
import { handleEmailSend, type EmailSendPayload } from "./email/send";

export { SopAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/internal/")) {
      return new Response("Not found", { status: 404 });
    }
    const allowed = await secretsMatch(
      request.headers.get("X-GradQuest-Proxy-Secret") ?? "",
      env.SOP_PROXY_SECRET,
    );
    if (!allowed) return Response.json({ error: "unauthorized" }, { status: 401 });

    let payload: Record<string, unknown>;
    try {
      payload = (await request.clone().json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Expected JSON" }, { status: 400 });
    }

    // Transactional email (deadline reminders). Stubbed until send_email binding + domain.
    if (url.pathname === "/internal/email/send") {
      const result = await handleEmailSend(
        payload as EmailSendPayload,
        // EMAIL / EMAIL_FROM are optional until a Cloudflare sending domain is onboarded.
        env as Env & {
          EMAIL?: {
            send: (message: {
              to: string | string[];
              from: string;
              subject: string;
              content: Array<{ type: string; value: string }>;
            }) => Promise<void>;
          };
          EMAIL_FROM?: string;
        },
      );
      return Response.json(result);
    }
    if (url.pathname.startsWith("/internal/email/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    let userId = "anonymous";
    userId =
      String(payload.userId ?? "anonymous").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) ||
      "anonymous";

    const agent = await getAgentByName(env.SopAgent, `user-${userId}`);
    return agent.fetch(request);
  },
} satisfies ExportedHandler<Env>;
