import { NextRequest } from "next/server";
import { brainHermesStreamFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { cleanSessionId, parseControlEnvironment, researchOnly } from "@/lib/brain/control";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function blockedStatus(code: string) {
  return code === "WAITING_PROVIDER" || code === "WAITING_PROVIDER_UNVERIFIED" ? 429 : 423;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return Response.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return Response.json({ error: "Interactive chat is limited to his-research" }, { status: 403 });

  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return Response.json({ error: "invalid session id" }, { status: 400 });

  const config = getBrainProfileConfig("research");
  if (!config.configured) return Response.json({ error: `${config.profile} is not configured` }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return Response.json({ error: "input is required" }, { status: 400 });
  if (input.length > 16_000) return Response.json({ error: "input is too long" }, { status: 413 });

  if (typeof body.provider === "string" && body.provider.trim() && body.provider.trim() !== "openai-codex") {
    return Response.json({ error: "Provider overrides are disabled; research chat uses the configured openai-codex profile." }, { status: 403 });
  }
  if (typeof body.model === "string" && body.model.trim() && body.model.trim() !== "gpt-5.6-sol") {
    return Response.json({ error: "Model overrides are disabled; research chat uses gpt-5.6-sol." }, { status: 403 });
  }
  if (body.model_options !== undefined) {
    return Response.json({ error: "Per-request model_options overrides are disabled in the bounded research control plane." }, { status: 403 });
  }

  try {
    const runtimeSnapshot = await getRuntimeSnapshot();
    const policy = manualModelInvocationPolicy(runtimeSnapshot);
    if (!policy.allowed) {
      const headers: Record<string, string> = { "X-Hermes-Invocation-Policy": policy.code };
      if (runtimeSnapshot.provider.cooldownActive && runtimeSnapshot.provider.retryNotBeforeUtc) {
        const retryAt = new Date(runtimeSnapshot.provider.retryNotBeforeUtc).getTime();
        if (Number.isFinite(retryAt)) headers["Retry-After"] = String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)));
      }
      return Response.json(
        {
          error: policy.reason,
          policy: {
            allowed: false,
            code: policy.code,
            source: "session_stream",
            runtimeState: runtimeSnapshot.runtime.state,
            retryNotBeforeUtc: runtimeSnapshot.provider.retryNotBeforeUtc,
          },
        },
        { status: blockedStatus(policy.code), headers },
      );
    }

    const upstream = await brainHermesStreamFetch("research", `/api/sessions/${encodeURIComponent(id)}/chat/stream`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return Response.json({ error: text || `Hermes returned HTTP ${upstream.status}` }, { status: upstream.status });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Hermes-Invocation-Policy": policy.code,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hermes stream unavailable" }, { status: 502 });
  }
}