import { NextRequest, NextResponse } from "next/server";
import { hermesFetch, hermesMode } from "@/lib/hermes";

export async function GET(_: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  if (!runId || runId.length > 256 || /[\r\n\0]/.test(runId)) return NextResponse.json({ error: "invalid run id" }, { status: 400 });
  if (hermesMode() === "mock" || runId.startsWith("mock_")) return NextResponse.json({ run_id: runId, status: "completed", output: "Mock run completed." });
  try {
    const response = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}`);
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes request failed" }, { status: 502 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy production run stop/approval/rejection actions are disabled. Production is inspect-only from the browser control plane.",
      code: "LEGACY_PRODUCTION_RUN_MUTATION_DISABLED",
      production_mutation: false,
    },
    { status: 423, headers: { "Cache-Control": "no-store" } },
  );
}