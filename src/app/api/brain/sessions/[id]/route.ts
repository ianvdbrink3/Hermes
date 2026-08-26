import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { cleanSessionId, cleanTitle, parseControlEnvironment, researchOnly } from "@/lib/brain/control";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) return NextResponse.json({ error: `${config.profile} is not configured` }, { status: 503 });

  try {
    const response = await brainHermesFetch(environment, `/api/sessions/${encodeURIComponent(id)}`);
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Hermes session" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Production sessions are read-only in Hermes Control" }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = cleanSessionId(rawId);
  if (!id) return NextResponse.json({ error: "invalid session id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = cleanTitle(body.title);
  const endReason = typeof body.end_reason === "string" ? body.end_reason.trim().slice(0, 120) : undefined;
  if (!title && !endReason) return NextResponse.json({ error: "title or end_reason is required" }, { status: 400 });

  try {
    const response = await brainHermesFetch("research", `/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...(title ? { title } : {}), ...(endReason ? { end_reason: endReason } : {}) }),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Hermes session" }, { status: 502 });
  }
}