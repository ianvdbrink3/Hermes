import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { clampInteger, cleanTitle, parseControlEnvironment, researchOnly } from "@/lib/brain/control";
import { normalizeHermesTimestamps } from "@/lib/brain/normalize-hermes-time";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    return NextResponse.json({ error: `${config.profile} is not configured`, environment, profile: config.profile }, { status: 503 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const limit = clampInteger(request.nextUrl.searchParams.get("limit"), 40, 1, 100);
  const offset = clampInteger(request.nextUrl.searchParams.get("offset"), 0, 0, 100_000);
  const includeChildren = request.nextUrl.searchParams.get("include_children") === "true";
  const source = request.nextUrl.searchParams.get("source")?.trim();

  const params = new URLSearchParams();
  if (q) params.set("q", q.slice(0, 500));
  else {
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (includeChildren) params.set("include_children", "true");
    if (source) params.set("source", source.slice(0, 80));
  }

  const path = q ? `/api/sessions/search?${params}` : `/api/sessions?${params}`;
  try {
    const response = await brainHermesFetch(environment, path);
    const payload = await response.json().catch(() => ({ error: `Hermes returned HTTP ${response.status}` }));
    return NextResponse.json({ environment, profile: config.profile, payload: normalizeHermesTimestamps(payload) }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes sessions unavailable" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Production sessions are read-only in Hermes Control" }, { status: 403 });

  const config = getBrainProfileConfig(environment);
  if (!config.configured) return NextResponse.json({ error: `${config.profile} is not configured` }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const title = cleanTitle(body.title);
  const payload = title ? { title } : {};

  try {
    const response = await brainHermesFetch("research", "/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return NextResponse.json(normalizeHermesTimestamps(await response.json().catch(() => ({}))), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Hermes session" }, { status: 502 });
  }
}
