import { NextRequest } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { cleanSessionId, parseControlEnvironment } from "@/lib/brain/control";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return Response.json({ error: "environment must be research or production" }, { status: 400 });
  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return Response.json({ error: "invalid session id" }, { status: 400 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) return Response.json({ error: `${config.profile} is not configured` }, { status: 503 });

  try {
    const upstream = await brainHermesFetch(environment, `/api/sessions/${encodeURIComponent(id)}/export`);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to export Hermes session" }, { status: 502 });
  }
}