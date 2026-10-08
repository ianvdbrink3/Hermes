import { describe, expect, it } from "vitest";
import * as presentation from "./presentation";

type Card = { role: string; title: string; direction: string; explanation: string; reconsider: string };
const api = presentation as unknown as {
  explainAssessment: (role: string, thesis: unknown, score?: unknown) => Card;
  explainRecordedThesis: (value: unknown) => Card[];
  riskExplanation: (status: unknown) => string;
  runtimeExplanation: (state: unknown) => string;
  plainStatus: (state: unknown) => string;
  explainInvalidation: (conditions: unknown) => string[];
};
const explain = (role: string, thesis: unknown, score?: unknown) => {
  expect(typeof api.explainAssessment).toBe("function");
  return api.explainAssessment(role, thesis, score);
};

describe("begrijpelijke uitleg zonder verzonnen bewijs", () => {
  it("keeps missing macro evidence distinct from a neutral market forecast", () => {
    const card = explain("MACRO", "No defensible directional inference: the sources provide only titles and descriptions—not their policy substance.", "0");
    expect(card.direction).toBe("Onvoldoende informatie");
    expect(card.explanation).toContain("onvoldoende inhoud");
    expect(card.explanation).not.toContain("economie blijft stabiel");
  });
  it("summarizes explicit momentum and volatility with Dutch numbers", () => {
    const card = explain("QUANT", "MSFT has a modest positive directional bias. The 20-day momentum was +7.75%, tempered by elevated annualized volatility of 38.98%.", ".35");
    expect(card.explanation).toContain("7,75%");
    expect(card.explanation).toContain("38,98%");
    expect(card.explanation).toContain("schommelingen");
    expect(card.explanation.length).toBeLessThan(260);
  });
  it("does not turn a quoted bullish narrative into a positive unknown assessment", () => {
    const card = explain("SENTIMENT", "The bullish narrative failed; results contradict previous expectations.");
    expect(card.direction).toBe("Richting onbekend");
    expect(card.explanation).not.toContain("positief");
  });
  it("preserves negative and real zero structured scores", () => {
    expect(explain("FUNDAMENTAL", "A specialist assessment.", "-0.4").direction).toBe("Negatief beeld");
    expect(explain("QUANT", "A specialist assessment.", "0").direction).toBe("Geen duidelijke richting");
  });
  it("uses the analysis frozen into a decision rather than newer research", () => {
    expect(typeof api.explainRecordedThesis).toBe("function");
    const cards = api.explainRecordedThesis("FUNDAMENTAL=Slightly positive direction over the next five daily observations. | MACRO=No defensible directional inference from supplied evidence. | QUANT=MSFT has a modest positive directional bias. | SENTIMENT=The supplied evidence supports a moderately positive direction.");
    expect(cards).toHaveLength(4);
    expect(cards[0].direction).toBe("Positief beeld");
    expect(cards[1].direction).toBe("Onvoldoende informatie");
    expect(cards[0].reconsider).not.toMatch(/\d|stop.loss/i);
  });
  it("does not copy unrecognized English text into everyday screens", () => {
    expect(typeof api.explainRecordedThesis).toBe("function");
    expect(api.explainRecordedThesis("Unrecognized narrative with a speculative claim")).toEqual([]);
    const card = explain("FUTURE_AGENT", "Unrecognized narrative with a speculative claim");
    expect(card.title).toBe("Aanvullend onderzoek");
    expect(card.explanation).not.toContain("speculative");
  });
  it("separates risk clearance from an actual purchase", () => {
    expect(typeof api.riskExplanation).toBe("function");
    expect(api.riskExplanation("APPROVE")).toContain("geen koopadvies");
    expect(api.riskExplanation("BLOCK")).toContain("tegengehouden");
    expect(api.riskExplanation(undefined)).toContain("niet bevestigd");
  });
  it("uses understandable Dutch for known and unknown operating states", () => {
    expect(typeof api.runtimeExplanation).toBe("function");
    expect(typeof api.plainStatus).toBe("function");
    expect(api.runtimeExplanation("WAITING_PROVIDER")).toContain("modelcapaciteit");
    expect(api.plainStatus("NEW_UNRECOGNIZED_STATE")).toBe("Status onbekend");
    expect(api.runtimeExplanation("OFFLINE")).toContain("niet bereikbaar");
  });
  it("does not replace a precise exit rule with a generic reconsideration rule", () => {
    expect(typeof api.explainInvalidation).toBe("function");
    expect(api.explainInvalidation(["Exit below 500 dollars"]))
      .toEqual(["Er is een specifieke voorwaarde vastgelegd. Bekijk de oorspronkelijke tekst voordat je die interpreteert."]);
    expect(api.explainInvalidation([])).toEqual([]);
    expect(api.explainInvalidation(["QUANT: invalidate if evidence no longer supports 'A forecast'"])[0]).toContain("koersanalyse");
  });
  it("does not treat a previous positive prediction as the current conclusion", () => {
    expect(explain("QUANT", "A prior report supports a moderately positive direction, but that forecast failed.").direction).toBe("Richting onbekend");
  });
  it("does not promote a quote or conditional forecast to the actual conclusion", () => {
    expect(explain("SENTIMENT", 'One analyst writes "MSFT has a modest positive directional bias", whereas the current evidence is inconclusive.').direction).toBe("Richting onbekend");
    expect(explain("QUANT", "MSFT has a modest positive directional bias if the next earnings release exceeds expectations.").direction).toBe("Richting onbekend");
  });
  it("does not invent AI growth from words such as retail or maintain", () => {
    const card = explain("FUNDAMENTAL", "Cloud sales are supporting growth, while retail sales decline.", "0.2");
    expect(card.explanation).not.toContain("AI");
  });
  it("does not turn negated supporting evidence into affirmative Dutch copy", () => {
    expect(explain("SENTIMENT", "The assertion that near-term sentiment is helped is false; current news is adverse.", "-0.4").explanation).not.toContain("positief");
    expect(explain("FUNDAMENTAL", "Results are not supporting continued cloud and AI momentum.", "0.2").explanation).not.toContain("cloud en AI als steun");
  });
});
