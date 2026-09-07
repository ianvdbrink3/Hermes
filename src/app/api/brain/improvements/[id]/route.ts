import { NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const clean = id.trim();
  if (!clean || clean.length > 200) return NextResponse.json({ error: "Invalid improvement session id" }, { status: 400 });

  const config = getBrainProfileConfig("research");
  if (!config.configured) return NextResponse.json({ error: "his-research is not configured" }, { status: 503 });

  try {
    const response = await brainHermesFetch("research", `/api/sessions/${encodeURIComponent(clean)}`);
    const item = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: `Hermes returned HTTP ${response.status}`, item }, { status: response.status });
    return NextResponse.json({ item, persistence: "hermes_session" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read improvement session" }, { status: 502 });
  }
}
