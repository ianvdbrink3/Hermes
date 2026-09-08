import { NextRequest, NextResponse } from "next/server";
import { startBrainRun } from "@/lib/brain/service";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";
import { guardManualInvocation, repairRuntimeSnapshot } from "@/lib/os/runtime-snapshot-repair";

const allowedSources = new Set(["manual_chat", "brain_studio", "improvement_research"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const environment = body.environment;
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : undefined;
  const source = typeof body.source === "string" && allowedSources.has(body.source) ? body.source : "manual_chat";

  if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (input.length > 12_000) return NextResponse.json({ error: "input is too long" }, { status: 413 });
  if (environment !== "research") {
    return NextResponse.json(
      {
        error: "Hermes model runs are research-only. Production remains inspect-only because the production Hermes tool surface can mutate state.",
      },
      { status: 403 },
    );
  }

  try {
    const rawRuntime = await getRuntimeSnapshot();
    const runtime = repairRuntimeSnapshot(rawRuntime);
    const policy = guardManualInvocation(
      runtime,
      manualModelInvocationPolicy(runtime),
    );

    if (!policy.allowed) {
      const status = policy.code === "WAITING_PROVIDER" || policy.code === "WAITING_PROVIDER_UNVERIFIED" ? 429 : 423;
      const headers: Record<string, string> = { "X-Hermes-Invocation-Policy": policy.code };
      if (runtime.provider.retryNotBeforeUtc) {
        const retryAt = new Date(runtime.provider.retryNotBeforeUtc).getTime();
        if (Number.isFinite(retryAt)) headers["Retry-After"] = String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)));
      }
      return NextResponse.json(
        {
          error: policy.reason,
          policy: {
            allowed: false,
            code: policy.code,
            source,
            runtimeState: runtime.runtime.state,
            retryNotBeforeUtc: runtime.provider.retryNotBeforeUtc,
          },
        },
        { status, headers },
      );
    }

    const run = await startBrainRun("research", input, sessionId);
    return NextResponse.json(
      {
        ...run,
        invocationPolicy: {
          allowed: true,
          code: policy.code,
          source,
          computeTelemetry: runtime.compute.available,
          note: policy.reason,
        },
      },
      {
        status: run.status === "failed" ? 503 : 202,
        headers: { "X-Hermes-Invocation-Policy": policy.code },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brain Studio research run failed" },
      { status: 502 },
    );
  }
}
