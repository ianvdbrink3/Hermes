import { NextRequest, NextResponse } from "next/server";
import { brainHermesFetch } from "@/lib/brain/hermes-client";
import { parseControlEnvironment, researchOnly } from "@/lib/brain/control";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";

function blockedStatus(code: string) {
  return code === "WAITING_PROVIDER" || code === "WAITING_PROVIDER_UNVERIFIED" ? 429 : 423;
}

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const environment = parseControlEnvironment(request.nextUrl.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "environment must be research or production" }, { status: 400 });
  if (!researchOnly(environment)) return NextResponse.json({ error: "Only research runs can be steered from Brain Studio" }, { status: 403 });

  const { runId } = await context.params;
  if (!runId || runId.length > 256 || /[\r\n\0]/.test(runId)) return NextResponse.json({ error: "invalid run id" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (input.length > 4_000) return NextResponse.json({ error: "input is too long" }, { status: 413 });

  try {
    const runtime = await getRuntimeSnapshot();
    const policy = manualModelInvocationPolicy(runtime);
    if (!policy.allowed) {
      const headers: Record<string, string> = { "X-Hermes-Invocation-Policy": policy.code };
      if (runtime.provider.cooldownActive && runtime.provider.retryNotBeforeUtc) {
        const retryAt = new Date(runtime.provider.retryNotBeforeUtc).getTime();
        if (Number.isFinite(retryAt)) headers["Retry-After"] = String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)));
      }
      return NextResponse.json(
        {
          error: policy.reason,
          policy: {
            allowed: false,
            code: policy.code,
            source: "run_steer",
            runtimeState: runtime.runtime.state,
          },
        },
        { status: blockedStatus(policy.code), headers },
      );
    }

    const response = await brainHermesFetch("research", `/v1/runs/${encodeURIComponent(runId)}/steer`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });
    const payload = await response.json().catch(() => ({}));
    const safePayload = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : { result: payload };
    return NextResponse.json(
      { ...safePayload, invocationPolicy: { allowed: true, code: policy.code, source: "run_steer" } },
      { status: response.status, headers: { "X-Hermes-Invocation-Policy": policy.code } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to steer Hermes run" }, { status: 502 });
  }
}