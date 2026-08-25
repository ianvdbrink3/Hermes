export type HermesMode = "live" | "mock";

const baseUrl = (process.env.HERMES_BASE_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const apiKey = process.env.HERMES_API_KEY || "";

export function hermesMode(): HermesMode {
  return process.env.HERMES_MOCK_MODE === "false" && apiKey ? "live" : "mock";
}

function profilePath(path: string) {
  const profile = process.env.HERMES_PROFILE?.trim();
  if (!profile) return path;
  return `/p/${encodeURIComponent(profile)}${path}`;
}

export async function hermesFetch(path: string, init: RequestInit = {}) {
  if (hermesMode() === "mock") throw new Error("Hermes is running in mock mode");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const sessionKey = process.env.HERMES_SESSION_KEY;
  if (sessionKey) headers.set("X-Hermes-Session-Key", sessionKey);
  return fetch(`${baseUrl}${profilePath(path)}`, { ...init, headers, cache: "no-store" });
}

export function mockRun(input: string) {
  return {
    run_id: `mock_${Date.now()}`,
    status: "completed",
    session_id: "investment-os-mock",
    model: "hermes-agent",
    output: mockOutput(input),
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    mock: true,
  };
}

function mockOutput(input: string) {
  const normalized = input.toLowerCase();
  if (normalized.includes("risk")) return "Risk Guard: execution is locked. Connect Hermes and the execution-control service for live account state.";
  if (normalized.includes("nq")) return "NQ analysis requested. OS is in mock mode, so no market prices are fabricated. Connect HERMES_BASE_URL and HERMES_API_KEY to run the real CIO workflow.";
  if (normalized.includes("pre-market") || normalized.includes("premarket")) return "Pre-market workflow queued in demo mode. Live mode will delegate Data, TA, Macro and Risk agents through Hermes.";
  return "Hermes Investment OS is in mock mode. Configure the server-side Hermes environment variables to execute real agent runs.";
}
