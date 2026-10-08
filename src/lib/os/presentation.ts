/** Presentation only: never derives an order or overrides a risk decision. */
export function decisionStory(action: unknown, executed: unknown) {
  const stories: Record<string, [string, string]> = {
    HOLD: ["Hermes wacht af", "De CIO kiest ervoor de huidige positie aan te houden. Zonder open positie blijft het geld in cash."],
    BUY: ["Hermes kiest voor kopen", "De CIO ziet een koopkans. De afzonderlijke risicocontrole bepaalt of en in welke omvang een paper transactie mag plaatsvinden."],
    SELL: ["Hermes kiest voor verkopen", "De CIO wil de positie sluiten. De uitvoering blijft afhankelijk van de risicocontrole."],
    REDUCE: ["Hermes wil de positie verkleinen", "De CIO wil minder blootstelling. De risicocontrole en uitvoering staan hieronder apart vermeld."],
    AVOID: ["Hermes kiest ervoor niet in te stappen", "De CIO vindt instappen momenteel niet verantwoord."],
  };
  const [title, explanation] = stories[String(action)] || ["Nog geen herkenbaar CIO-besluit", "Bekijk het oorspronkelijke besluit zodra een gevalideerde cyclus beschikbaar is."];
  return { title, explanation, execution: executed === true ? "Paper transactie uitgevoerd" : executed === false ? "Geen paper transactie uitgevoerd" : "Uitvoering niet bevestigd" };
}

export function ownerActionKnown(snapshot: { telemetry?: { stateFeed?: boolean }; runtime?: { state?: string }; mission?: { needsHuman?: unknown } } | null) {
  return Boolean(snapshot?.telemetry?.stateFeed === true && snapshot?.runtime?.state && snapshot.runtime.state !== "OFFLINE" && snapshot.mission && "needsHuman" in snapshot.mission);
}

export function finiteNumber(value: unknown): number | null {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
