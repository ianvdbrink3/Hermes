import { NextRequest } from "next/server";
import { brainHermesStreamFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { cleanSessionId, parseControlEnvironment, researchOnly } from "@/lib/brain/control";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const requested: Record<string, unknown> = { input };
  if (typeof body.model === "string" && body.model.trim()) requested.model = body.model.trim().slice(0, 160);
  if (typeof body.provider === "string" && body.provider.trim()) requested.provider = body.provider.trim().slice(0, 80);
  if (body.model_options && typeof body.model_options === "object" && !Array.isArray(body.model_options)) requested.model_options = body.model_options;

  try {
    const upstream = await brainHermesStreamFetch("research", `/api/sessions/${encodeURIComponent(id)}/chat/stream`, {
      method: "POST",
      body: JSON.stringify(requested),
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
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hermes stream unavailable" }, { status: 502 });
  }
}