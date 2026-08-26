import type { BrainEnvironment, ConnectionState } from "@/lib/brain/types";

type ProfileConfig = {
  environment: BrainEnvironment;
  profile: string;
  baseUrl: string;
  apiKey: string;
  pathPrefix: string;
  sessionKey: string;
  configured: boolean;
};

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function normalizePrefix(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  return `/${clean.replace(/^\/+|\/+$/g, "")}`;
}

export function getBrainProfileConfig(environment: BrainEnvironment): ProfileConfig {
  const productionBase = normalizeBaseUrl(process.env.HERMES_BASE_URL || "");
  const productionKey = process.env.HERMES_API_KEY || "";
  const productionPrefix = normalizePrefix(process.env.HERMES_PATH_PREFIX || "");
  const productionSession = process.env.HERMES_SESSION_KEY || "agent:investment:webos:primary";

  if (environment === "production") {
    const liveMode = process.env.HERMES_MOCK_MODE === "false";
    return {
      environment,
      profile: "his-production",
      baseUrl: productionBase,
      apiKey: productionKey,
      pathPrefix: productionPrefix,
      sessionKey: productionSession,
      configured: Boolean(liveMode && productionBase && productionKey),
    };
  }

  const prefixKey = environment === "research" ? "HERMES_RESEARCH_PATH_PREFIX" : "HERMES_BUILDER_PATH_PREFIX";
  const baseKey = environment === "research" ? "HERMES_RESEARCH_BASE_URL" : "HERMES_BUILDER_BASE_URL";
  const apiKeyName = environment === "research" ? "HERMES_RESEARCH_API_KEY" : "HERMES_BUILDER_API_KEY";
  const sessionKeyName = environment === "research" ? "HERMES_RESEARCH_SESSION_KEY" : "HERMES_BUILDER_SESSION_KEY";
  const explicitBase = normalizeBaseUrl(process.env[baseKey] || "");
  const explicitPrefix = normalizePrefix(process.env[prefixKey] || "");
  const configured = Boolean((explicitBase || explicitPrefix) && (process.env[apiKeyName] || productionKey));

  return {
    environment,
    profile: environment === "research" ? "his-research" : "his-builder",
    baseUrl: explicitBase || productionBase,
    apiKey: process.env[apiKeyName] || productionKey,
    pathPrefix: explicitPrefix,
    sessionKey: process.env[sessionKeyName] || `agent:investment:brain:${environment}`,
    configured,
  };
}

function targetPath(config: ProfileConfig, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${config.pathPrefix}${normalized}`;
}

export async function brainHermesFetch(environment: BrainEnvironment, path: string, init: RequestInit = {}) {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) {
    throw new Error(`${config.profile} is not configured`);
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("X-Hermes-Session-Key", config.sessionKey);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`${config.baseUrl}${targetPath(config, path)}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function classifyHermesResponse(status: number): ConnectionState {
  if (status === 401 || status === 403) return "auth_error";
  if (status >= 500) return "degraded";
  return status >= 200 && status < 300 ? "connected" : "degraded";
}

export async function safeHermesJson<T>(environment: BrainEnvironment, path: string): Promise<{ state: ConnectionState; data: T | null; message?: string }> {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) return { state: "not_configured", data: null, message: `${config.profile} is not connected.` };
  try {
    const response = await brainHermesFetch(environment, path);
    const state = classifyHermesResponse(response.status);
    if (!response.ok) return { state, data: null, message: `Hermes returned HTTP ${response.status}.` };
    return { state, data: (await response.json()) as T };
  } catch (error) {
    return {
      state: "offline",
      data: null,
      message: error instanceof Error ? error.message : "Hermes gateway unavailable.",
    };
  }
}
