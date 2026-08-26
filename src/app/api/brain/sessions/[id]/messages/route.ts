import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { clampInteger, cleanSessionId, parseControlEnvironment } from "@/lib/brain/control";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) return NextResponse.json({ error: `${config.profile} is not configured` }, { status: 503 });

  const limit = clampInteger(request.nextUrl.searchParams.get("limit"), 250, 1, 500);
  const offset = clampInteger(request.nextUrl.searchParams.get("offset"), 0, 0, 100_000);
  const order = request.nextUrl.searchParams.get("order") === "latest" ? "latest" : "oldest";
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), order });

  try {
    const response = await brainHermesFetch(environment, `/api/sessions/${encodeURIComponent(id)}/messages?${params}`);
    const payload = await response.json().catch(() => ({ error: `Hermes returned HTTP ${response.status}` }));
    return NextResponse.json({ environment, profile: config.profile, payload }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Hermes messages" }, { status: 502 });
  }
}