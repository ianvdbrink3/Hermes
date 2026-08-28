import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";

const REPO = "/home/ubuntu/Hermes-Stocks/hermes-investment-machine";
const SESSION_ID = "owner-action-git-author-v2";
const TERMINAL = new Set(["completed", "failed", "cancelled", "stopped"]);

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function promptFor(mode: "verify" | "set", name: string, email: string) {
  const identityStep = mode === "verify"
    ? `Do not change the Git identity. Verify it with these exact repository-scoped commands:\n- git -C ${REPO} config --local --get user.name\n- git -C ${REPO} config --local --get user.email\nBoth values must exist and be non-empty.`
    : `Set the repository-local identity only, using the repository at ${REPO}. Set user.name exactly to ${JSON.stringify(name)} and user.email exactly to ${JSON.stringify(email)}. Never use --global. Then verify both values with git -C ${REPO} config --local --get ...`;

  return `OWNER-APPROVED DETERMINISTIC REPOSITORY ACTION — GIT AUTHOR ONLY.\n\nRepository: ${REPO}\n\n${identityStep}\n\nIf the repository-local Git identity is valid, read ${REPO}/state/autonomy/CURRENT.md and clear ONLY the stale Git-author human gate. Set the NEEDS HUMAN value to None. Remove only the blocker text that says local checkpoint creation is blocked because Git author name/email is missing. Preserve the current objective, NEXT, evidence, unrelated blockers, and all other state.\n\nDo not create a checkpoint commit in this action. Do not push. Do not touch GitHub, production, broker configuration, paper/live trading, credentials, risk limits, system services, or files outside ${REPO}.\n\nUse deterministic shell/file operations for the checks and edit. Do not merely describe what should be done.\n\nReturn exactly GIT_AUTHOR_RESOLVED when both Git values are verified and CURRENT.md no longer contains the Git-author human gate. Otherwise return GIT_AUTHOR_NOT_RESOLVED followed by a concise reason.`;
}

const instructions = `You are the Builder worker executing one explicit owner-approved maintenance action. Work only inside ${REPO}. This is not an investment decision and grants no production, broker, execution, credential, or risk authority. Execute only the narrow deterministic Git-author/state operation in the request. Never push or create a commit.`;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "set" ? "set" : body.mode === "verify" ? "verify" : null;
  const name = clean(body.name);
  const email = clean(body.email);

  if (!mode) return NextResponse.json({ error: "mode must be verify or set" }, { status: 400 });
  if (mode === "set" && (!name || !validEmail(email))) {
    return NextResponse.json({ error: "A valid name and email are required" }, { status: 400 });
  }

  const config = getBrainProfileConfig("builder");
  if (!config.configured) {
    return NextResponse.json({ error: "Builder is not configured for owner actions." }, { status: 503 });
  }

  try {
    const response = await brainHermesFetch("builder", "/v1/runs", {
      method: "POST",
      body: JSON.stringify({
        input: promptFor(mode, name, email),
        instructions,
        session_id: SESSION_ID,
      }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json({ error: String(payload.error || `Builder returned HTTP ${response.status}`) }, { status: 502 });
    }
    return NextResponse.json({
      run_id: String(payload.run_id || ""),
      status: String(payload.status || "started"),
      mode,
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Builder owner action" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const runId = clean(request.nextUrl.searchParams.get("run_id"));
  if (!runId || runId.length > 180) return NextResponse.json({ error: "run_id is required" }, { status: 400 });

  const config = getBrainProfileConfig("builder");
  if (!config.configured) return NextResponse.json({ error: "Builder is not configured." }, { status: 503 });

  try {
    const response = await brainHermesFetch("builder", `/v1/runs/${encodeURIComponent(runId)}`);
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json({ error: String(payload.error || `Builder returned HTTP ${response.status}`) }, { status: 502 });
    }
    const status = String(payload.status || "unknown").toLowerCase();
    const output = typeof payload.output === "string" ? payload.output : "";
    const error = typeof payload.error === "string" ? payload.error : "";
    return NextResponse.json({
      run_id: runId,
      status,
      terminal: TERMINAL.has(status),
      resolved: status === "completed" && output.includes("GIT_AUTHOR_RESOLVED"),
      output: TERMINAL.has(status) ? output : undefined,
      error: TERMINAL.has(status) ? error : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Builder owner action" }, { status: 502 });
  }
}
