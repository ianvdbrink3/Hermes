import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";

function asText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const encoded = JSON.stringify(value);
    return encoded && encoded !== "{}" ? encoded : undefined;
  } catch {
    return undefined;
  }
}

function firstText(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asText(payload[key]);
    if (value) return value;
  }
  return undefined;
}

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const environment = request.nextUrl.searchParams.get("environment");
  if (environment !== "research") {
    return NextResponse.json({ error: "Research environment required" }, { status: 403 });
  }

  const config = getBrainProfileConfig("research");
  if (!config.configured) {
    return NextResponse.json({
      run_id: runId,
      status: "failed",
      error: "his-research is not configured.",
      environment: "research",
      profile: "his-research",
    }, { status: 503 });
  }

  try {
    const response = await brainHermesFetch("research", `/v1/runs/${encodeURIComponent(runId)}`);
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      payload = raw ? { message: raw } : {};
    }

    const status = String(payload.status || (response.ok ? "unknown" : "failed")).toLowerCase();
    const failed = ["failed", "cancelled", "stopped"].includes(status) || !response.ok;
    const output = firstText(payload, ["output", "last_output", "partial_output", "result"]);
    const error = failed
      ? firstText(payload, ["error", "reason", "detail", "failure_reason", "message"])
        || (!response.ok ? `Hermes returned HTTP ${response.status}` : `Hermes run ended with status ${status}.`)
      : undefined;

    return NextResponse.json({
      run_id: String(payload.run_id || runId),
      status,
      output,
      error,
      environment: "research",
      profile: "his-research",
      session_id: typeof payload.session_id === "string" ? payload.session_id : undefined,
      diagnostics: {
        backend_http_status: response.status,
        backend_fields: Object.keys(payload).filter((key) => !["token", "api_key", "secret", "authorization"].includes(key.toLowerCase())).sort(),
      },
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      run_id: runId,
      status: "unknown",
      error: error instanceof Error ? error.message : "Unable to read Hermes research run",
      environment: "research",
      profile: "his-research",
      transient: true,
    }, { status: 502 });
  }
}
