import { brainHermesFetch, getBrainProfileConfig, safeHermesJson } from "@/lib/brain/hermes-client";
import type {
  BrainEnvironment,
  BrainRun,
  BrainStatus,
  CapabilityItem,
  HermesSkill,
  HermesToolset,
} from "@/lib/brain/types";

type HermesModelsResponse = { data?: Array<{ id?: string }> };

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
  const [skillsResult, toolsetsResult, capabilitiesResult, modelsResult, researchHealth, builderHealth] = await Promise.all([
    safeHermesJson<unknown>("production", "/v1/skills"),
    safeHermesJson<unknown>("production", "/v1/toolsets"),
    safeHermesJson<Record<string, unknown>>("production", "/v1/capabilities"),
    safeHermesJson<HermesModelsResponse>("production", "/v1/models"),
    safeHermesJson<Record<string, unknown>>("research", "/health"),
    safeHermesJson<Record<string, unknown>>("builder", "/health"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    production: {
      state: capabilitiesResult.state,
      profile: "his-production",
      model: modelsResult.data?.data?.[0]?.id,
      message: capabilitiesResult.message,
    },
    research: {
      state: researchHealth.state,
      profile: "his-research",
      message: researchHealth.message,
    },
    builder: {
      state: builderHealth.state,
      profile: "his-builder",
      message: builderHealth.message,
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

export async function startBrainRun(environment: BrainEnvironment, input: string, sessionId?: string): Promise<BrainRun> {
  if (environment !== "research") {
    return {
      run_id: `blocked_${Date.now()}`,
      status: "failed",
      error: "Model-backed Brain Studio runs are research-only. Production and Builder are inspect/health surfaces until separate promotion and checkpoint workflows are proven.",
      environment,
      profile: environment === "production" ? "his-production" : "his-builder",
    };
  }

  const config = getBrainProfileConfig("research");
  if (!config.configured) {
    return {
      run_id: `unavailable_${Date.now()}`,
      status: "failed",
      error: `${config.profile} is not configured. Connect that profile before running this action.`,
      environment: "research",
      profile: config.profile,
    };
  }

  const response = await brainHermesFetch("research", "/v1/runs", {
    method: "POST",
    body: JSON.stringify({
      input,
      instructions: RESEARCH_INSTRUCTIONS,
      session_id: sessionId || "brain-research-primary",
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return {
    run_id: String(payload.run_id || `unknown_${Date.now()}`),
    status: String(payload.status || (response.ok ? "started" : "failed")),
    output: typeof payload.output === "string" ? payload.output : undefined,
    error: !response.ok ? String(payload.error || `Hermes returned HTTP ${response.status}`) : undefined,
    environment: "research",
    profile: config.profile,
    session_id: typeof payload.session_id === "string" ? payload.session_id : sessionId,
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

export const brainProductionPolicy = {
  promotionEnabled: false,
  builderMutationEnabled: false,
  explanation: "Research may inspect and propose improvements. Production promotion, builder mutation, broker execution and live risk changes remain explicitly gated and unavailable from the browser control plane.",
};
