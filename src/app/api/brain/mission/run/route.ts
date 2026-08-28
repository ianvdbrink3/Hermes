import { NextRequest, NextResponse } from "next/server";
import { startBrainRun } from "@/lib/brain/service";

function clean(value: unknown, max = 12_000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function missionPrompt({
  missionId,
  objective,
  attempt,
  mode,
  previousRunId,
  failureReason,
}: {
  missionId: string;
  objective: string;
  attempt: number;
  mode: "start" | "recover" | "continue";
  previousRunId?: string;
  failureReason?: string;
}) {
  return `RESILIENT AUTONOMOUS RESEARCH MISSION\n\nMISSION ID: ${missionId}\nMODE: ${mode}\nATTEMPT/CYCLE: ${attempt}\n\nOWNER OBJECTIVE\n${objective}\n\n${previousRunId ? `PREVIOUS WORKER RUN: ${previousRunId}\n` : ""}${failureReason ? `OBSERVED WORKER FAILURE: ${failureReason}\n` : ""}\nMISSION SUPERVISOR CONTRACT\n\nTreat this owner objective as a durable mission, not as one fragile chat turn. A worker run may fail; the mission must not be considered failed merely because one worker failed.\n\nBefore doing new work:\n1. Inspect the real investment-machine repository and persisted autonomy state.\n2. Read state/autonomy/CURRENT.md plus any mission/capability/experiment/decision state already present.\n3. Inspect git status and the latest safe local checkpoint.\n4. Resume from persisted evidence instead of restarting completed work.\n5. If this is recovery mode, classify the previous failure as TRANSIENT, CONTEXT_RESOURCE, CODE_TEST, HUMAN_GATE, SAFETY, or UNKNOWN. Do not blindly repeat the same failing action.\n\nExecution rules:\n- Work in one bounded, evidence-producing cycle. Prefer a small verified step over a huge monolithic run.\n- If context or resource pressure is plausible, split the work into smaller independently resumable tasks.\n- Persist CURRENT/NEXT/evidence before or immediately after meaningful state transitions.\n- Use Builder for bounded engineering when the existing Research↔Builder contract allows it. Research remains owner of hypothesis, benchmark, adversarial review and accept/reject decisions.\n- For code changes: RED → GREEN → REFACTOR and run the repository's required sandboxed verification gates.\n- Create or preserve safe local rollback/checkpoint commits when the existing repository rules allow it. Never push.\n- Never fabricate successful evidence. A rejected capability or failed experiment is a valid research result.\n- A capability failure is learning; a worker failure is recovery; only a genuine human/safety boundary may block the mission.\n- Continue other safe work if one subtask is human-blocked.\n\nHard boundaries remain unchanged:\n- no live orders or financial transactions;\n- no paper/live broker binding;\n- no production promotion;\n- no GitHub/main push unless separately and explicitly authorized;\n- no credential invention or secret disclosure;\n- no weakening or bypassing risk controls;\n- no irreversible external action.\n\nPersistence requirement:\nMaintain durable mission state under state/autonomy using the repository's existing conventions. If no mission-specific record exists yet, add the minimal machine-readable mission record necessary to resume this mission after a fresh session or worker crash. Do not corrupt append-only ledgers.\n\nAt the end, the final line of your response MUST be exactly one of:\nMISSION_CONTINUE\nMISSION_COMPLETE\nMISSION_BLOCKED_HUMAN\nMISSION_BLOCKED_SAFETY\n\nUse MISSION_CONTINUE whenever more safe work remains. Use MISSION_COMPLETE only when the owner objective is genuinely satisfied and evidence is persisted. Human/safety blockers must be explicit in CURRENT.md.\n`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const objective = clean(body.objective);
  const missionId = clean(body.mission_id, 160);
  const previousRunId = clean(body.previous_run_id, 200) || undefined;
  const failureReason = clean(body.failure_reason, 2_000) || undefined;
  const mode = body.mode === "recover" || body.mode === "continue" ? body.mode : "start";
  const attemptRaw = Number(body.attempt || 1);
  const attempt = Number.isFinite(attemptRaw) ? Math.max(1, Math.min(50, Math.floor(attemptRaw))) : 1;

  if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });
  if (!missionId) return NextResponse.json({ error: "mission_id is required" }, { status: 400 });

  const sessionId = `mission:${missionId}:${mode}:${attempt}`;
  const input = missionPrompt({ missionId, objective, attempt, mode, previousRunId, failureReason });

  try {
    const run = await startBrainRun("research", input, sessionId);
    return NextResponse.json(
      { ...run, mission_id: missionId, mission_mode: mode, mission_attempt: attempt },
      { status: run.status === "failed" ? 503 : 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to start resilient research mission",
        mission_id: missionId,
      },
      { status: 502 },
    );
  }
}
