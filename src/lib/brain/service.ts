import { randomUUID } from "node:crypto";
import { brainHermesFetch, getBrainProfileConfig, safeHermesJson } from "@/lib/brain/hermes-client";
import type {
  BrainEnvironment,
  BrainRun,
  BrainStatus,
  CapabilityItem,
  HermesSkill,
  HermesToolset,
  ImprovementRequest,
} from "@/lib/brain/types";

type HermesModelsResponse = { data?: Array<{ id?: string }> };
type BrainGlobal = typeof globalThis & { __hermesBrainImprovements?: Map<string, ImprovementRequest> };
const brainGlobal = globalThis as BrainGlobal;
const improvementStore = brainGlobal.__hermesBrainImprovements || new Map<string, ImprovementRequest>();
brainGlobal.__hermesBrainImprovements = improvementStore;

function extractArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["skills", "toolsets", "data", "items"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export async function getBrainStatus(): Promise<BrainStatus> {
  const [skillsResult, toolsetsResult, capabilitiesResult, modelsResult] = await Promise.all([
    safeHermesJson<unknown>("production", "/v1/skills"),
    safeHermesJson<unknown>("production", "/v1/toolsets"),
    safeHermesJson<Record<string, unknown>>("production", "/v1/capabilities"),
    safeHermesJson<HermesModelsResponse>("production", "/v1/models"),
  ]);

  const researchConfig = getBrainProfileConfig("research");
  const builderConfig = getBrainProfileConfig("builder");

  return {
    generatedAt: new Date().toISOString(),
    production: {
      state: capabilitiesResult.state,
      profile: "his-production",
      model: modelsResult.data?.data?.[0]?.id,
      message: capabilitiesResult.message,
    },
    research: {
      state: researchConfig.configured ? "connected" : "not_configured",
      profile: "his-research",
      message: researchConfig.configured ? "Configured; live health is checked when used." : "Research profile is not connected yet.",
    },
    builder: {
      state: builderConfig.configured ? "connected" : "not_configured",
      profile: "his-builder",
      message: builderConfig.configured ? "Configured; production promotion remains disabled." : "Builder profile is not connected yet.",
    },
    skills: {
      state: skillsResult.state,
      data: extractArray<HermesSkill>(skillsResult.data),
      message: skillsResult.message,
    },
    toolsets: {
      state: toolsetsResult.state,
      data: extractArray<HermesToolset>(toolsetsResult.data),
      message: toolsetsResult.message,
    },
    apiCapabilities: {
      state: capabilitiesResult.state,
      data: capabilitiesResult.data,
      message: capabilitiesResult.message,
    },
  };
}

export async function getCapabilityItems(): Promise<{ items: CapabilityItem[]; state: string; message?: string }> {
  const status = await getBrainStatus();
  const skills = status.skills.data.map<CapabilityItem>((skill) => ({
    id: `skill:${skill.name}`,
    name: skill.name,
    type: "skill",
    description: skill.description || "No description supplied by Hermes.",
    category: skill.category || "Uncategorized",
    environment: "production",
  }));
  const toolsets = status.toolsets.data.map<CapabilityItem>((toolset) => ({
    id: `toolset:${toolset.name}`,
    name: toolset.label || toolset.name,
    type: "toolset",
    description: toolset.description || "Hermes toolset",
    category: "Toolset",
    environment: "production",
    enabled: toolset.enabled,
    configured: toolset.configured,
    tools: toolset.tools,
  }));

  const state = status.skills.state === "connected" || status.toolsets.state === "connected" ? "connected" : status.production.state;
  return {
    items: [...skills, ...toolsets],
    state,
    message: status.skills.message || status.toolsets.message || status.production.message,
  };
}

const RESEARCH_INSTRUCTIONS = `You are Hermes CIO operating inside the Hermes Investment OS research environment.\n\nYour purpose is evidence-based improvement of investment intelligence. You may inspect available skills, analyse prior work, identify weaknesses, research hypotheses, propose capabilities and design validation plans.\n\nYou must NOT modify production investment behaviour, change live risk limits, promote skills to production, claim improvement without evidence, optimise around tiny samples, or treat in-sample results as validation.\n\nWhen proposing an improvement, explicitly provide: observed problem, evidence, hypothesis, proposed capability, required data, validation method, success criteria, potential risks, and state when evidence is insufficient. Prefer one strong measurable improvement over several speculative ones. Production must remain unchanged.`;

const PRODUCTION_CONSOLE_INSTRUCTIONS = `You are Hermes CIO inside Hermes Investment OS. This console may inspect and discuss the production brain, but it must not modify production skills, risk policy, execution settings or investment behaviour. Be evidence-first, never fabricate prices or state, and clearly distinguish missing data from conclusions.`;

export async function startBrainRun(environment: BrainEnvironment, input: string, sessionId?: string): Promise<BrainRun> {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    return {
      run_id: `unavailable_${Date.now()}`,
      status: "failed",
      error: `${config.profile} is not configured. Connect that profile before running this action.`,
      environment,
      profile: config.profile,
    };
  }

  if (environment === "builder") {
    return {
      run_id: `blocked_${Date.now()}`,
      status: "failed",
      error: "Builder execution is intentionally disabled in v0.3. Brain Studio may inspect and propose, but it cannot build or mutate Hermes skills yet.",
      environment,
      profile: config.profile,
    };
  }

  const response = await brainHermesFetch(environment, "/v1/runs", {
    method: "POST",
    body: JSON.stringify({
      input,
      instructions: environment === "research" ? RESEARCH_INSTRUCTIONS : PRODUCTION_CONSOLE_INSTRUCTIONS,
      session_id: sessionId || `brain-${environment}-primary`,
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return {
    run_id: String(payload.run_id || `unknown_${Date.now()}`),
    status: String(payload.status || (response.ok ? "started" : "failed")),
    output: typeof payload.output === "string" ? payload.output : undefined,
    error: !response.ok ? String(payload.error || `Hermes returned HTTP ${response.status}`) : undefined,
    environment,
    profile: config.profile,
    session_id: typeof payload.session_id === "string" ? payload.session_id : undefined,
  };
}

export async function getBrainRun(environment: BrainEnvironment, runId: string): Promise<BrainRun> {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    return { run_id: runId, status: "failed", error: `${config.profile} is not configured.`, environment, profile: config.profile };
  }
  const response = await brainHermesFetch(environment, `/v1/runs/${encodeURIComponent(runId)}`);
  const payload = (await response.json()) as Record<string, unknown>;
  return {
    run_id: String(payload.run_id || runId),
    status: String(payload.status || (response.ok ? "unknown" : "failed")),
    output: typeof payload.output === "string" ? payload.output : undefined,
    error: !response.ok ? String(payload.error || `Hermes returned HTTP ${response.status}`) : undefined,
    environment,
    profile: config.profile,
    session_id: typeof payload.session_id === "string" ? payload.session_id : undefined,
  };
}

function titleFromGoal(goal: string) {
  const compact = goal.replace(/\s+/g, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
}

export function createImprovement(userGoal: string): ImprovementRequest {
  const improvement: ImprovementRequest = {
    id: randomUUID(),
    title: titleFromGoal(userGoal),
    userGoal,
    createdAt: new Date().toISOString(),
    createdBy: "owner",
    sourceProfile: "his-research",
    targetProfile: "his-builder",
    status: "DRAFT",
    evidence: [],
    requiredKnowledge: [],
    requiredData: [],
    approvalState: "NOT_REQUESTED",
    persistence: "ephemeral",
  };
  improvementStore.set(improvement.id, improvement);
  return improvement;
}

export function listImprovements() {
  return Array.from(improvementStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getImprovement(id: string) {
  return improvementStore.get(id) || null;
}

export const brainProductionPolicy = {
  promotionEnabled: false,
  builderMutationEnabled: false,
  explanation: "v0.3 is research-only. Production changes, approvals, skill mutation and promotion are intentionally not implemented.",
};
