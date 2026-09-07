import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { startBrainRun } from "@/lib/brain/service";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function titleFromGoal(goal: string) {
  const clean = goal.replace(/\s+/g, " ").trim();
  return `Hermes Improvement · ${clean.length > 80 ? `${clean.slice(0, 77)}…` : clean}`;
}

function sessionId(payload: Record<string, unknown>) {
  for (const key of ["id", "session_id", "sessionId"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const session = record(payload.session);
  for (const key of ["id", "session_id", "sessionId"]) {
    const value = session[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function GET() {
  const config = getBrainProfileConfig("research");
  if (!config.configured) return NextResponse.json({ items: [], persistence: "hermes_session", error: "his-research is not configured" }, { status: 503 });
  try {
    const params = new URLSearchParams({ q: "Hermes Improvement" });
    const response = await brainHermesFetch("research", `/api/sessions/search?${params}`);
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ items: payload, persistence: "hermes_session" }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ items: [], persistence: "hermes_session", error: error instanceof Error ? error.message : "Unable to load improvement sessions" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const goal = typeof body.userGoal === "string" ? body.userGoal.trim() : "";
  if (!goal) return NextResponse.json({ error: "userGoal is required" }, { status: 400 });
  if (goal.length > 6000) return NextResponse.json({ error: "userGoal is too long" }, { status: 413 });

  const runtime = await getRuntimeSnapshot();
  const policy = manualModelInvocationPolicy(runtime);
  if (!policy.allowed) {
    return NextResponse.json({ error: policy.reason, policy }, { status: policy.code.startsWith("WAITING_PROVIDER") ? 429 : 423 });
  }

  try {
    const createResponse = await brainHermesFetch("research", "/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: titleFromGoal(goal) }),
    });
    const created = record(await createResponse.json().catch(() => ({})));
    if (!createResponse.ok) return NextResponse.json({ error: String(created.error || `Hermes returned HTTP ${createResponse.status}`) }, { status: createResponse.status });
    const id = sessionId(created);
    if (!id) return NextResponse.json({ error: "Hermes created a session but did not return a stable session id" }, { status: 502 });

    const prompt = `Onderzoek deze improvement request als een evidence-based capability proposal.\n\nDOEL VAN DE OWNER:\n${goal}\n\nWerk in deze volgorde: probleem, bestaand bewijs, hypothese, voorgestelde capability, benodigde data, validatiemethode, succescriteria, risico's en expliciete onzekerheden. Wijzig production niet. Een voorstel is pas klaar voor een volgende lifecyclefase wanneer er meetbaar bewijs bestaat.`;
    const run = await startBrainRun("research", prompt, id);
    return NextResponse.json({
      item: {
        id,
        title: titleFromGoal(goal),
        userGoal: goal,
        status: run.status === "failed" ? "RESEARCH_FAILED" : "RESEARCHING",
        lifecycle: ["DRAFT", "RESEARCHING", "PROPOSED", "TESTING", "VALIDATED", "HUMAN_APPROVED", "BUILT", "PAPER", "PRODUCTION"],
        persistence: "hermes_session",
        sessionId: id,
        runId: run.run_id,
      },
      run,
      persistence: "hermes_session",
      invocationPolicy: policy,
    }, { status: run.status === "failed" ? 503 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create durable improvement research" }, { status: 502 });
  }
}
