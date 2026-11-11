import { getAgentByName } from "agents";
import { secretsMatch } from "./auth/secret";
import { SopAgent } from "./agent/SopAgent";

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

    let userId = "anonymous";
    try {
      const payload = (await request.clone().json()) as { userId?: string };
      userId = String(payload.userId ?? "anonymous").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "anonymous";
    } catch {
      return Response.json({ error: "Expected JSON" }, { status: 400 });
    }

    const agent = await getAgentByName(env.SopAgent, `user-${userId}`);
    return agent.fetch(request);
  },
} satisfies ExportedHandler<Env>;
