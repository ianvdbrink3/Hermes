import { NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function extractJobs(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
  if (payload && typeof payload === "object") {
    const record = payload as JsonRecord;
    for (const key of ["jobs", "data", "items"]) {
      const value = record[key];
      if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"));
    }
  }
  return [];
}

function findHeartbeat(jobs: JsonRecord[]) {
  const target = jobs.find((job) => String(job.name || "").toLowerCase() === "autonomous investment lab");
  if (!target) return null;
  return {
    id: String(target.id || target.job_id || ""),
    name: String(target.name || "Autonomous Investment Lab"),
    active: target.active !== false && target.enabled !== false && String(target.status || "active").toLowerCase() !== "paused",
    schedule: target.schedule || target.schedule_text || null,
    nextRun: target.next_run || target.nextRun || target.next_run_at || null,
    lastRun: target.last_run || target.lastRun || target.last_run_at || null,
    lastStatus: target.last_status || target.lastStatus || null,
  };
}

async function fetchHeartbeat() {
  try {
    const response = await brainHermesFetch("research", "/api/jobs");
    if (!response.ok) return { state: "degraded", heartbeat: null, message: `Research jobs returned HTTP ${response.status}.` };
    const payload = (await response.json()) as unknown;
    return { state: "connected", heartbeat: findHeartbeat(extractJobs(payload)), message: undefined };
  } catch (error) {
    return {
      state: "offline",
      heartbeat: null,
      message: error instanceof Error ? error.message : "Unable to read research scheduler state.",
    };
  }
}

export async function GET() {
  const productionBase = normalizeBaseUrl(process.env.HERMES_BASE_URL || "");
  const stateUrl = normalizeBaseUrl(process.env.HERMES_AUTONOMY_STATE_URL || "") || (productionBase ? `${productionBase}/autonomy-state/snapshot` : "");
  const stateKey = process.env.HERMES_AUTONOMY_STATE_API_KEY || process.env.HERMES_RESEARCH_API_KEY || "";
  const researchConfig = getBrainProfileConfig("research");

  if (!stateUrl || !stateKey) {
    return NextResponse.json(
      {
        connected: false,
        state: "not_configured",
        message: "Autonomy state feed is not configured.",
        researchConfigured: researchConfig.configured,
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const [stateResponse, heartbeat] = await Promise.all([
      fetch(stateUrl, {
        headers: { Authorization: `Bearer ${stateKey}`, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }),
      fetchHeartbeat(),
    ]);

    if (!stateResponse.ok) {
      return NextResponse.json(
        {
          connected: false,
          state: stateResponse.status === 401 || stateResponse.status === 403 ? "auth_error" : "degraded",
          message: `Autonomy state feed returned HTTP ${stateResponse.status}.`,
          heartbeat,
        },
        { status: 502 },
      );
    }

    const snapshot = (await stateResponse.json()) as JsonRecord;
    return NextResponse.json({ connected: true, state: "connected", snapshot, heartbeat }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        state: "offline",
        message: error instanceof Error ? error.message : "Autonomy state feed unavailable.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
