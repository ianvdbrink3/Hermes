import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import type { BrainEnvironment } from "@/lib/brain/types";
import { brainProductionPolicy } from "@/lib/brain/service";
import { getDeploymentMetadata } from "@/lib/os-version";

export const dynamic = "force-dynamic";

type CheckState = "pass" | "fail" | "warning" | "not_configured" | "untested";

type DiagnosticCheck = {
  id: string;
  label: string;
  group: "os" | "production" | "research" | "builder" | "manual";
  environment?: BrainEnvironment;
  state: CheckState;
  required: boolean;
  message: string;
  httpStatus?: number;
  latencyMs?: number;
};

function configCheck(environment: BrainEnvironment, required: boolean): DiagnosticCheck {
  const config = getBrainProfileConfig(environment);
  return {
    id: `${environment}-config`,
    label: `${config.profile} configured`,
    group: environment,
    environment,
    state: config.configured ? "pass" : "not_configured",
    required,
    message: config.configured
      ? `${config.profile} has an explicit route and profile-specific credential configuration.`
      : `${config.profile} is not configured yet.`,
  };
}

async function endpointCheck(
  environment: BrainEnvironment,
  id: string,
  label: string,
  path: string,
  required: boolean,
): Promise<DiagnosticCheck> {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    return {
      id,
      label,
      group: environment,
      environment,
      state: "not_configured",
      required,
      message: `${config.profile} is not configured.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  const started = Date.now();
  try {
    const response = await brainHermesFetch(environment, path, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (response.ok) {
      return {
        id,
        label,
        group: environment,
        environment,
        state: "pass",
        required,
        message: `Available from ${config.profile}.`,
        httpStatus: response.status,
        latencyMs,
      };
    }

    const authenticationFailure = response.status === 401 || response.status === 403;
    return {
      id,
      label,
      group: environment,
      environment,
      state: "fail",
      required,
      message: authenticationFailure
        ? `Authentication failed for ${config.profile}.`
        : `Hermes returned HTTP ${response.status}.`,
      httpStatus: response.status,
      latencyMs,
    };
  } catch (error) {
    return {
      id,
      label,
      group: environment,
      environment,
      state: "fail",
      required,
      message: error instanceof Error && error.name === "AbortError"
        ? "Connection timed out after 6 seconds."
        : error instanceof Error
          ? error.message
          : "Hermes endpoint unavailable.",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const auth = getAuthConfig();
  const checks: DiagnosticCheck[] = [
    {
      id: "os-auth",
      label: "Owner authentication configured",
      group: "os",
      state: auth.ready ? "pass" : "fail",
      required: true,
      message: auth.ready
        ? "OS_ACCESS_PASSWORD and OS_SESSION_SECRET meet the configured minimums."
        : "Owner authentication is incomplete or too weak.",
    },
    {
      id: "execution-lock",
      label: "Production mutation guard",
      group: "os",
      state: !brainProductionPolicy.promotionEnabled && !brainProductionPolicy.builderMutationEnabled ? "pass" : "warning",
      required: true,
      message: !brainProductionPolicy.promotionEnabled && !brainProductionPolicy.builderMutationEnabled
        ? "Builder mutation and production promotion remain disabled from Hermes Control."
        : "A production mutation capability is enabled; review before activation.",
    },
    configCheck("production", true),
    configCheck("research", true),
    configCheck("builder", false),
  ];

  const networkChecks = await Promise.all([
    endpointCheck("production", "production-health", "Production gateway", "/health", true),
    endpointCheck("production", "production-sessions", "Production sessions", "/api/sessions?limit=1", true),
    endpointCheck("production", "production-models", "Production model inventory", "/v1/models", false),
    endpointCheck("production", "production-skills", "Production skills", "/v1/skills", true),
    endpointCheck("production", "production-toolsets", "Production toolsets", "/v1/toolsets", true),
    endpointCheck("production", "production-capabilities", "Production capabilities", "/v1/capabilities", true),
    endpointCheck("research", "research-health", "Research gateway", "/health", true),
    endpointCheck("research", "research-sessions", "Research sessions", "/api/sessions?limit=1", true),
    endpointCheck("research", "research-capabilities", "Research capabilities", "/v1/capabilities", false),
  ]);

  checks.push(...networkChecks);
  checks.push(
    {
      id: "manual-streaming",
      label: "Research streaming turn",
      group: "manual",
      state: "untested",
      required: true,
      message: "Run one real Research conversation after cutover and confirm streamed Hermes output appears.",
    },
    {
      id: "manual-persistence",
      label: "Conversation persistence",
      group: "manual",
      state: "untested",
      required: true,
      message: "After a Research turn, reload Hermes Control and confirm the conversation and messages persist.",
    },
    {
      id: "manual-plan",
      label: "Current Plan refresh",
      group: "manual",
      state: "untested",
      required: true,
      message: "Ask Hermes for Current Plan and confirm it returns persisted plan state rather than fabricated frontend data.",
    },
    {
      id: "manual-mac-off",
      label: "Mac-off continuity test",
      group: "manual",
      state: "untested",
      required: true,
      message: "Final cutover test: shut down the old Mac-hosted gateway and confirm Hermes Control still works through the VPS.",
    },
  );

  const requiredChecks = checks.filter((check) => check.required && check.group !== "manual");
  const passedRequired = requiredChecks.filter((check) => check.state === "pass").length;
  const failedRequired = requiredChecks.filter((check) => check.state === "fail" || check.state === "not_configured").length;
  const automaticReady = failedRequired === 0;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    deployment: getDeploymentMetadata(),
    summary: {
      automaticReady,
      passedRequired,
      requiredTotal: requiredChecks.length,
      failedRequired,
      manualRemaining: checks.filter((check) => check.group === "manual").length,
    },
    checks,
  });
}
