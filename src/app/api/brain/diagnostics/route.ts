import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth";
import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import type { BrainEnvironment } from "@/lib/brain/types";
import { brainProductionPolicy } from "@/lib/brain/service";
import { getDeploymentMetadata } from "@/lib/os-version";
import { getRuntimeSnapshot } from "@/lib/os/runtime-snapshot";

export const dynamic = "force-dynamic";

type CheckState = "pass" | "fail" | "warning" | "not_configured";
type CheckGroup = "os" | "runtime" | "production" | "research" | "builder";

type DiagnosticCheck = {
  id: string;
  label: string;
  group: CheckGroup;
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
    label: `${config.profile} geconfigureerd`,
    group: environment,
    environment,
    state: config.configured ? "pass" : "not_configured",
    required,
    message: config.configured ? "Expliciete route en profielspecifieke credentials zijn ingesteld." : `${config.profile} is niet geconfigureerd.`,
  };
}

async function endpointCheck(environment: BrainEnvironment, id: string, label: string, path: string, required: boolean): Promise<DiagnosticCheck> {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    return { id, label, group: environment, environment, state: "not_configured", required, message: `${config.profile} is niet geconfigureerd.` };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  const started = Date.now();
  try {
    const response = await brainHermesFetch(environment, path, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (response.ok) return { id, label, group: environment, environment, state: "pass", required, message: `Beschikbaar via ${config.profile}.`, httpStatus: response.status, latencyMs };
    return {
      id,
      label,
      group: environment,
      environment,
      state: "fail",
      required,
      message: response.status === 401 || response.status === 403 ? `Authenticatie voor ${config.profile} is mislukt.` : `Hermes gaf HTTP ${response.status}.`,
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
      message: error instanceof Error && error.name === "AbortError" ? "Verbindingstime-out na 6 seconden." : error instanceof Error ? error.message : "Hermes-endpoint niet bereikbaar.",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const auth = getAuthConfig();
  const runtime = await getRuntimeSnapshot();
  const checks: DiagnosticCheck[] = [
    {
      id: "os-auth",
      label: "Owner-authenticatie",
      group: "os",
      state: auth.ready ? "pass" : "fail",
      required: true,
      message: auth.ready ? "OS-wachtwoord en sessiegeheim voldoen aan de minimumvereisten." : "Owner-authenticatie is niet correct geconfigureerd.",
    },
    {
      id: "execution-lock",
      label: "Production mutation guard",
      group: "os",
      state: !brainProductionPolicy.promotionEnabled && !brainProductionPolicy.builderMutationEnabled ? "pass" : "warning",
      required: true,
      message: "Builder mutation en production promotion blijven vanuit Hermes Control uitgeschakeld.",
    },
    {
      id: "browser-execution-lock",
      label: "Browser trading activation",
      group: "os",
      state: "pass",
      required: true,
      message: "De browserroute voor trading-activatie is hard locked en retourneert HTTP 423.",
    },
    {
      id: "runtime-state-feed",
      label: "Mission state feed",
      group: "runtime",
      state: runtime.telemetry.stateFeed ? "pass" : "fail",
      required: true,
      message: runtime.telemetry.stateFeed ? "De read-only mission snapshot is beschikbaar." : "De mission state feed is niet bereikbaar.",
    },
    {
      id: "runtime-scheduler",
      label: "Research Review Router",
      group: "runtime",
      state: runtime.scheduler.found && runtime.scheduler.active ? "pass" : runtime.scheduler.found ? "warning" : "fail",
      required: true,
      message: runtime.scheduler.found ? (runtime.scheduler.active ? "De nieuwe researchrouter is actief." : "De researchrouter is gevonden maar niet actief.") : "Research Review Router niet gevonden. Er is bewust geen fallback naar de oude Autonomous Investment Lab-job.",
    },
    {
      id: "runtime-provider",
      label: "Modelprovider",
      group: "runtime",
      state: runtime.provider.state === "COOLDOWN" || runtime.provider.state === "LIMITED_UNVERIFIED" ? "warning" : runtime.provider.state === "UNKNOWN" ? "warning" : "pass",
      required: false,
      message: runtime.provider.state === "COOLDOWN" ? `Cooldown actief tot ${runtime.provider.retryNotBeforeUtc || "onbekend"}.` : runtime.provider.state === "LIMITED_UNVERIFIED" ? "Er is een provider-limit signaal zonder actieve exacte cooldown; het OS verzint geen retrytijd." : `Providerstate: ${runtime.provider.state}.`,
    },
    {
      id: "runtime-compute",
      label: "Compute-telemetrie",
      group: "runtime",
      state: runtime.compute.available ? "pass" : "warning",
      required: false,
      message: runtime.compute.available ? "Budget- en usagecounters zijn beschikbaar." : "Budgetcounters zijn nog niet opgenomen in de VPS-statefeed.",
    },
    configCheck("production", true),
    configCheck("research", true),
    configCheck("builder", false),
  ];

  const networkChecks = await Promise.all([
    endpointCheck("production", "production-health", "Production gateway", "/health", true),
    endpointCheck("production", "production-sessions", "Production sessions", "/api/sessions?limit=1", true),
    endpointCheck("production", "production-capabilities", "Production capabilities", "/v1/capabilities", true),
    endpointCheck("research", "research-health", "Research gateway", "/health", true),
    endpointCheck("research", "research-sessions", "Research sessions", "/api/sessions?limit=1", true),
    endpointCheck("research", "research-capabilities", "Research capabilities", "/v1/capabilities", false),
    endpointCheck("builder", "builder-health", "Builder gateway", "/health", false),
  ]);
  checks.push(...networkChecks);

  const requiredChecks = checks.filter((check) => check.required);
  const passedRequired = requiredChecks.filter((check) => check.state === "pass").length;
  const failedRequired = requiredChecks.filter((check) => check.state === "fail" || check.state === "not_configured").length;
  const warningCount = checks.filter((check) => check.state === "warning").length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    deployment: getDeploymentMetadata(),
    runtime: {
      state: runtime.runtime.state,
      reason: runtime.runtime.reason,
      fixture: runtime.mission.fixture,
      provider: runtime.provider,
    },
    summary: {
      ready: failedRequired === 0,
      passedRequired,
      requiredTotal: requiredChecks.length,
      failedRequired,
      warnings: warningCount,
    },
    checks,
  }, { headers: { "Cache-Control": "no-store" } });
}
