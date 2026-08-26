import { NextRequest, NextResponse } from "next/server";
import { startBrainRun } from "@/lib/brain/service";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const environment = body.environment;
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : undefined;

  if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (input.length > 12_000) return NextResponse.json({ error: "input is too long" }, { status: 413 });
  if (environment !== "research") {
    return NextResponse.json(
      {
        error: "Brain Studio agent runs are research-only in v0.3. Production is inspect-only because the Hermes API server exposes a full toolset, including mutating tools.",
      },
      { status: 403 },
    );
  }

  try {
    const run = await startBrainRun("research", input, sessionId);
    return NextResponse.json(run, { status: run.status === "failed" ? 503 : 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brain Studio research run failed" },
      { status: 502 },
    );
  }
}
