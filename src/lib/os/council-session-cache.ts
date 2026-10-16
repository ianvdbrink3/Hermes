/** Owner-browser, session-scoped last VERIFIED Council snapshot.
 * This is never interpreted as live data and can never authorize a trade.
 */
import { parseCouncilSnapshot, type CouncilSnapshot } from "./council";

const KEY = "hermes:verified-council-snapshot:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function rememberVerifiedCouncilSnapshot(
 store: Writer, snapshot: CouncilSnapshot, now = Date.now(),
): void {
 try {
  if (snapshot.fixture !== false || snapshot.live_orders_enabled !== false) return;
  store.setItem(KEY, JSON.stringify({ saved_at: new Date(now).toISOString(), snapshot }));
 } catch {
  // Browsers may deny session storage; live fetch still works.
 }
}

export function restoreVerifiedCouncilSnapshot(
 store: Reader, now = Date.now(),
): { snapshot: CouncilSnapshot; savedAt: string } | null {
 try {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.saved_at !== "string") return null;
  const savedAge = now - Date.parse(obj.saved_at);
  if (!Number.isFinite(savedAge) || savedAge < 0 || savedAge > MAX_AGE_MS) return null;
  const parsed = parseCouncilSnapshot(obj.snapshot);
  const sourceAge = now - Date.parse(parsed.generated_at);
  if (!Number.isFinite(sourceAge) || sourceAge < -60_000 || sourceAge > MAX_AGE_MS) return null;
  return {
   // A restored snapshot is always offline/read-only, never an active
   // invitation to ask agents or submit a paper execution.
   snapshot: { ...parsed, research_active: false },
   savedAt: obj.saved_at,
  };
 } catch {
  // Never render a malformed or tampered local JSON snapshot.
  return null;
 }
}
