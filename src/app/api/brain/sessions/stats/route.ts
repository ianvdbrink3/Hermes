import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { parseControlEnvironment } from "@/lib/brain/control";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) return NextResponse.json({ error: `${config.profile} is not configured` }, { status: 503 });

  try {
    const response = await brainHermesFetch(environment, "/api/sessions/stats");
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ environment, profile: config.profile, payload }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read session stats" }, { status: 502 });
  }
}