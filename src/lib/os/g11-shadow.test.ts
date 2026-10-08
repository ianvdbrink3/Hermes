import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchShadowSnapshot, parseShadowSnapshot } from "./g11-shadow";
const valid = () => ({ schema_version: 1, generated_at: new Date().toISOString(), read_only: true, live_orders_enabled: false, latest: {}, history: [], metrics: {}, safety: {kill_switch:false,pending_recovery:false,journal_verified:true,incomplete_decisions:false,reconciled:false}, research: [], health: {}, research_health: {}, daemon: {}, risk_counts: {blocks:0,resizes:0} });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("shadow boundary", () => {
  it("rejects live orders and fixture observations", () => {
    expect(() => parseShadowSnapshot({ ...valid(), live_orders_enabled: true })).toThrow();
    expect(() => parseShadowSnapshot({ ...valid(), history: [{ fixture: true, live_execution_allowed: false }] })).toThrow();
    expect(() => parseShadowSnapshot({ ...valid(), history: [{ fixture: false }] })).toThrow();
    expect(() => parseShadowSnapshot({ ...valid(), safety: {} })).toThrow();
    expect(() => parseShadowSnapshot(valid())).not.toThrow();
  });
  it("uses only the authenticated read-only state route and blocks redirects", async () => {
    vi.stubEnv("HERMES_AUTONOMY_STATE_URL", "https://example.invalid/autonomy-state/snapshot");
    vi.stubEnv("HERMES_AUTONOMY_STATE_API_KEY", "unit-test-placeholder");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => valid() });
    vi.stubGlobal("fetch", fetcher);
    await fetchShadowSnapshot();
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://example.invalid/autonomy-state/g11-shadow");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
    expect(options.headers.Authorization).toBe("Bearer unit-test-placeholder");
  });
  it("rejects insecure origins before sending authentication", async () => {
    vi.stubEnv("HERMES_AUTONOMY_STATE_URL", "http://example.invalid/snapshot");
    vi.stubEnv("HERMES_AUTONOMY_STATE_API_KEY", "unit-test-placeholder");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fetchShadowSnapshot()).rejects.toThrow("Insecure");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// Explicit deployment check: uses the managed server connection, never browser credentials.
it.skipIf(process.env.G11_VERIFY_REMOTE !== "true")("production server connection returns real G11 evidence", async () => {
  const result = await fetchShadowSnapshot();
  expect(result.read_only).toBe(true);
  expect(result.live_orders_enabled).toBe(false);
  expect(result.latest.fixture).toBe(false);
  expect(result.safety.journal_verified).toBe(true);
  expect(result.history.length).toBeGreaterThan(0);
}, 15000);
