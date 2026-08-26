import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch } from "@/lib/brain/hermes-client";
import { parseControlEnvironment, researchOnly } from "@/lib/brain/control";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Only research runs can be steered from Brain Studio" }, { status: 403 });

  const { runId } = await context.params;
  if (!runId || runId.length > 256 || /[\r\n\0]/.test(runId)) return NextResponse.json({ error: "invalid run id" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (input.length > 4_000) return NextResponse.json({ error: "input is too long" }, { status: 413 });

  try {
    const response = await brainHermesFetch("research", `/v1/runs/${encodeURIComponent(runId)}/steer`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to steer Hermes run" }, { status: 502 });
  }
}