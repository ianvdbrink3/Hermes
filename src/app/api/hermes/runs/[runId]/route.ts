import { NextRequest, NextResponse } from "next/server";
import { hermesFetch, hermesMode } from "@/lib/hermes";

export async function GET(_: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  if (hermesMode() === "mock" || runId.startsWith("mock_")) return NextResponse.json({ run_id: runId, status: "completed", output: "Mock run completed." });
  try {
    const response = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}`);
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes request failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!["stop", "approve", "reject"].includes(action)) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  if (hermesMode() === "mock" || runId.startsWith("mock_")) return NextResponse.json({ run_id: runId, status: action === "stop" ? "cancelled" : "completed", mock: true });
  const path = action === "stop" ? `/v1/runs/${encodeURIComponent(runId)}/stop` : `/v1/runs/${encodeURIComponent(runId)}/approval`;
  const payload = action === "stop" ? undefined : JSON.stringify({ decision: action === "approve" ? "approve" : "reject" });
  try {
    const response = await hermesFetch(path, { method: "POST", body: payload });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes request failed" }, { status: 502 });
  }
}
