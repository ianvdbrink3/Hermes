/** Presentation only: never derives an order or overrides a risk decision. */
export function decisionStory(action: unknown, executed: unknown) {
  const stories: Record<string, [string, string]> = {
    HOLD: ["Hermes wacht af", "Hermes kiest ervoor de huidige positie aan te houden. Zonder open positie blijft het geld beschikbaar."],
    BUY: ["Hermes kiest voor kopen", "Hermes ziet een koopkans. De afzonderlijke risicocontrole bepaalt of en in welke omvang een oefentransactie mag plaatsvinden."],
    SELL: ["Hermes kiest voor verkopen", "Hermes wil de positie sluiten. De uitvoering blijft afhankelijk van de risicocontrole."],
    REDUCE: ["Hermes wil de positie verkleinen", "Hermes wil het bedrag in dit aandeel verkleinen. De risicocontrole en uitvoering staan hieronder apart vermeld."],
    AVOID: ["Hermes kiest ervoor niet in te stappen", "Hermes vindt instappen momenteel niet verantwoord."],
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

export const analysisRoles: Record<string, string> = {
  FUNDAMENTAL: "Bedrijf", MACRO: "Economie", QUANT: "Koers", SENTIMENT: "Nieuws en verwachtingen",
};

type AssessmentExplanation = { role: string; title: string; direction: string; explanation: string; reconsider: string };

/** A conservative reading aid, not a new agent assessment or trading rule.
 * Numeric direction comes from the structured score when present. For a frozen
 * decision only explicit directional phrases are recognized. Unknown prose is
 * retained on the originals page, never guessed or copied into the dashboard.
 */
export function explainAssessment(role: string, thesis: unknown, score?: unknown): AssessmentExplanation {
  const source = typeof thesis === "string" ? thesis.replace(/\s+/g, " ").trim() : "";
  const title = analysisRoles[role] || "Aanvullend onderzoek";
  const missing = /no defensible directional inference|neutral\/indeterminate|insufficient (?:evidence|information)|only titles and descriptions|onvoldoende (?:informatie|bewijs)/i.test(source);
  let n = finiteNumber(score);
  const opening = source.split(/\.\s/)[0];
  if (n === null && !missing && !/\b(?:not|no longer|previous|prior|failed|if|unless)\b|["“”]/i.test(opening)) {
    // Only supported opening conclusions, never a quotation later in a report.
    if (/^(?:slightly|moderately|strongly) positive direction\b|^[A-Z][A-Z0-9.^-]{0,15} has a (?:modest|slight|moderate|strong) positive directional bias\b|^The supplied evidence(?:,[^.]*,)? supports a (?:modestly|slightly|moderately|strongly) positive direction\b/i.test(opening)) n = 1;
    else if (/^(?:slightly|moderately|strongly) negative direction\b|^[A-Z][A-Z0-9.^-]{0,15} has a (?:modest|slight|moderate|strong) negative directional bias\b|^The supplied evidence(?:,[^.]*,)? supports a (?:modestly|slightly|moderately|strongly) negative direction\b/i.test(opening)) n = -1;
  }
  const direction = missing ? "Onvoldoende informatie" : n === null ? "Richting onbekend" : n > 0 ? "Positief beeld" : n < 0 ? "Negatief beeld" : "Geen duidelijke richting";
  let explanation = missing
    ? "De bronnen bevatten onvoldoende inhoud voor een betrouwbare richting. Dit is ontbrekende informatie, geen voorspelling dat de markt gelijk blijft."
    : n === null ? "De richting is niet betrouwbaar samen te vatten. De volledige beoordeling staat bij Uitgebreide analyses."
    : n > 0 ? "Deze analyse ziet aanwijzingen die gunstig zijn voor het aandeel. Dat is op zichzelf geen reden om te kopen."
    : n < 0 ? "Deze analyse ziet aanwijzingen die ongunstig zijn voor het aandeel."
    : "Deze analyse geeft geen duidelijke voorkeur voor stijgen of dalen.";
  if (missing && role === "MACRO" && /Federal Reserve/i.test(source) && /only titles and descriptions/i.test(source) && /policy substance/i.test(source) && /market interpretation|interest-rate reaction/i.test(source)) {
    explanation = "Hermes kreeg alleen koppen en korte beschrijvingen van berichten van de Amerikaanse centrale bank. De volledige inhoud van die berichten en de reactie van de markt ontbreken. Daarom kan deze analyse niet bepalen of dit gunstig of ongunstig is voor het aandeel.";
  }
  const affirmativeEvidence = !/\b(?:not|no|false|adverse|contradicts?|if|unless)\b|["“”]/i.test(source);
  if (!missing && n !== null && n > 0 && affirmativeEvidence && role === "FUNDAMENTAL" && /\bcloud\b/i.test(source) && /\bAI\b/.test(source) && /supporting continued cloud and AI momentum/i.test(source)) {
    explanation = "De analyse noemt cloud en AI als steun voor het aandeel.";
    if (/declines in Windows OEM and Devices and XBOX content and services/i.test(source)) {
      explanation += " Volgens deze analyse deden Windows-licenties en apparaten, en Xbox-games en -diensten het minder goed. Dat beperkt het positieve beeld.";
    } else if (/weakness|declines|zwakk/i.test(source)) {
      explanation += " De analyse noemt ook zwakke onderdelen, maar geeft geen namen die hier betrouwbaar zijn samen te vatten. Bekijk daarvoor de volledige analyse.";
    }
  }
  if (!missing && n !== null && role === "QUANT") {
    const momentum = source.match(/20-day momentum (?:was|is|of)\s*([+-]?\d+(?:\.\d+)?)%/i);
    const volatility = source.match(/annualized volatility (?:of|was|is)\s*(\d+(?:\.\d+)?)%/i);
    const percent = (v: string) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(Number(v)) + "%";
    if (momentum) explanation = "De koers " + (Number(momentum[1]) > 0 ? "steeg" : Number(momentum[1]) < 0 ? "daalde" : "veranderde") + " in de 20 handelsdagen vóór deze analyse met " + percent(String(Math.abs(Number(momentum[1])))) + ".";
    if (volatility) explanation += " Dit voorspelt niet wat de koers hierna doet; verlies blijft mogelijk. De cijfers over koersschommelingen staan bij Uitgebreide analyses.";
  }
  if (!missing && n !== null && n > 0 && affirmativeEvidence && role === "SENTIMENT" && /(?:near-term sentiment is helped|reinforces the positive narrative|supports a moderately positive direction)/i.test(source)) {
    explanation = "De analyse ziet een positief nieuwsbeeld rond het aandeel.";
    if (/already reflect|priced.?in|al ingeprijsd/i.test(source)) explanation += " Een deel van dat optimisme kan al in de koers zitten.";
  }
  return { role, title, direction, explanation, reconsider: "Hermes bekijkt " + title.toLowerCase() + " opnieuw als nieuwe informatie het huidige beeld niet meer ondersteunt." };
}

/** Separate the reports frozen into this decision from newer agent reports. */
export function explainRecordedThesis(value: unknown): AssessmentExplanation[] {
  if (typeof value !== "string") return [];
  return value.split(/\s*\|\s*(?=[A-Z_]+=)/).flatMap(part => {
    const match = part.match(/^\s*(FUNDAMENTAL|MACRO|QUANT|SENTIMENT)=([\s\S]*)$/);
    return match ? [explainAssessment(match[1], match[2])] : [];
  });
}

export function explainInvalidation(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: Record<string, string> = { FUNDAMENTAL: "bedrijfsanalyse", MACRO: "economische analyse", QUANT: "koersanalyse", SENTIMENT: "nieuwsanalyse" };
  return value.map(condition => {
    const match = typeof condition === "string" && condition.match(/^(FUNDAMENTAL|MACRO|QUANT|SENTIMENT): invalidate if evidence no longer supports '[\s\S]+'\.?$/);
    return match ? "Bekijk de " + labels[match[1]] + " opnieuw als nieuwe informatie het eerdere beeld niet meer ondersteunt."
      : "Er is een specifieke voorwaarde vastgelegd. Bekijk de oorspronkelijke tekst voordat je die interpreteert.";
  });
}

export function riskExplanation(status: unknown, action?: unknown, executed?: unknown): string {
  if (status === "APPROVE") {
    const execution = executed === true ? "Er is een oefentransactie uitgevoerd." : executed === false ? "Er is geen oefentransactie uitgevoerd." : "Uitvoering niet bevestigd: het is nog niet bekend of er een oefentransactie is uitgevoerd.";
    const decision = action === "HOLD" ? "Hermes besloot niets te kopen of verkopen. De risicocontrole accepteerde dat afwachtbesluit."
      : "De risicocontrole gaf toestemming voor het voorgestelde besluit.";
    return decision + " " + execution;
  }
  const known: Record<string, string> = {
    BLOCK: "De risicocontrole heeft de voorgestelde transactie tegengehouden. De vastgelegde redenen staan bij Uitgebreide analyses.",
    REJECT: "De risicocontrole heeft de voorgestelde transactie afgewezen. De vastgelegde redenen staan bij Uitgebreide analyses.",
    RESIZE: "De risicocontrole heeft de toegestane omvang aangepast. Kijk bij de uitvoering of er daarna werkelijk een oefentransactie is gedaan.",
  };
  return known[String(status)] || "De uitkomst van de risicocontrole is niet bevestigd.";
}

const statusLabels: Record<string, string> = {
  READY: "Klaar voor de volgende stap", RUNNING: "Bezig", PASS: "Controle geslaagd", FAILED: "Controle mislukt", FAIL: "Controle mislukt", ERROR: "Fout gemeld",
  DAILY_COMPLETE: "Vandaag afgerond", INCONCLUSIVE: "Nog onvoldoende bewijs", APPROVE: "Goedgekeurd", BLOCK: "Geblokkeerd", REJECT: "Afgewezen", RESIZE: "Omvang aangepast",
  WAITING_PROVIDER: "Wacht op modelcapaciteit", WAITING_PROVIDER_UNVERIFIED: "Modelbeschikbaarheid onzeker", WAITING_BUDGET: "Gebruiksbudget bereikt", WAITING_SPACING: "Wacht op het volgende tijdstip",
  NEEDS_HUMAN: "Jouw hulp nodig", BLOCKED_UNVERIFIED_USAGE: "Verbruik niet bevestigd", BLOCKED_INTEGRITY: "Veiligheidscontrole blokkeert", IDLE: "Momenteel niet bezig", DEGRADED: "Beperkt beschikbaar", OFFLINE: "Niet bereikbaar",
  COOLDOWN: "Wacht op modelcapaciteit", READY_OR_UNKNOWN: "Gereed of nog niet bevestigd", READY_FOR_REVIEW: "Klaar voor beoordeling", AVAILABLE: "Beschikbaar", CONNECTED: "Verbonden", LIMITED: "Beperkt beschikbaar", LIMITED_UNVERIFIED: "Beschikbaarheid niet bevestigd", AUTH_ERROR: "Toegang geweigerd", NOT_CONFIGURED: "Niet ingesteld", WARNING: "Aandacht nodig", WAIT: "In afwachting", PENDING: "In afwachting", COMPLETED: "Afgerond", SUCCEEDED: "Afgerond", ACCEPTED: "Geaccepteerd", REJECTED: "Afgewezen",
};
export function plainStatus(value: unknown): string {
  return typeof value === "string" ? statusLabels[value.toUpperCase()] || "Status onbekend" : "Status onbekend";
}

export function runtimeExplanation(state: unknown): string {
  const known: Record<string, string> = {
    READY: "Hermes is klaar voor een volgende onderzoeksstap. Dit zegt niets over de uitkomst van dat onderzoek.",
    RUNNING: "Hermes onderzoekt een verbetering en verzamelt bewijs. Het resultaat is nog niet bevestigd.",
    WAITING_PROVIDER: "Hermes wacht op beschikbare modelcapaciteit en probeert het op het geplande moment opnieuw.",
    WAITING_PROVIDER_UNVERIFIED: "Het is nog niet bevestigd of het model beschikbaar is.",
    WAITING_BUDGET: "Het ingestelde gebruiksbudget is bereikt. Hermes wacht tot er weer ruimte is.",
    WAITING_SPACING: "Hermes wacht tot het volgende toegestane onderzoeksmoment.",
    NEEDS_HUMAN: "Een onderzoeksstap wacht op jouw keuze. Bekijk Jouw acties voor de vervolgstap.",
    BLOCKED_UNVERIFIED_USAGE: "Het modelverbruik is niet bevestigd. Hermes gaat pas verder nadat dit is gecontroleerd.",
    BLOCKED_INTEGRITY: "Een veiligheidscontrole houdt het onderzoek tegen. Controleer de systeemstatus.",
    IDLE: "Er wordt momenteel geen onderzoeksstap uitgevoerd.",
    DEGRADED: "Een deel van het systeem is beperkt beschikbaar. De systeemstatus laat zien wat aandacht vraagt.",
    OFFLINE: "De actuele onderzoeksstatus is niet bereikbaar. Eerdere resultaten bevestigen niet dat Hermes nu actief is.",
  };
  return known[String(state)] || "De actuele onderzoeksstatus is nog niet bevestigd. Bekijk de systeemstatus of de uitgebreide toelichting.";
}

export function activityLabel(value: unknown): string {
  const key = String(value || "").toLowerCase();
  if (/fail|error|reject/.test(key)) return "Een stap is mislukt of afgewezen";
  if (/block|halt/.test(key)) return "Een stap is tegengehouden";
  if (/complete|finish|success|accepted|\.pass/.test(key)) return "Een stap is afgerond";
  if (/start|running/.test(key)) return "Een stap is gestart";
  if (/wait|cooldown/.test(key)) return "Hermes wacht op de volgende stap";
  if (/review|check|validat/.test(key)) return "Een controle is vastgelegd";
  return "Activiteit vastgelegd";
}
