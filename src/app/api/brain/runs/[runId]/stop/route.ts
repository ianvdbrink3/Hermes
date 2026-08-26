import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch } from "@/lib/brain/hermes-client";
import { parseControlEnvironment, researchOnly } from "@/lib/brain/control";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Only research runs can be stopped from Brain Studio" }, { status: 403 });

  const { runId } = await context.params;
  if (!runId || runId.length > 256 || /[\r\n\0]/.test(runId)) return NextResponse.json({ error: "invalid run id" }, { status: 400 });

  try {
    const response = await brainHermesFetch("research", `/v1/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to stop Hermes run" }, { status: 502 });
  }
}