import { describe, expect, it } from "vitest";
import { decisionStory, finiteNumber, ownerActionKnown } from "./presentation";

describe("truthful OS presentation", () => {
  it("separates a buy recommendation from a rejected execution", () => {
    const story = decisionStory("BUY", false);
    expect(story.title).toContain("kopen");
    expect(story.execution).toBe("Geen paper transactie uitgevoerd");
    expect(story.explanation).toContain("risicocontrole");
  });
  it("does not invent a decision or execution from an unfamiliar action", () => {
    expect(decisionStory("future_action", undefined)).toMatchObject({ title: "Nog geen herkenbaar CIO-besluit", execution: "Uitvoering niet bevestigd" });
  });
  it("distinguishes missing and offline human-action state from an explicit empty gate", () => {
    expect(ownerActionKnown({ telemetry: { stateFeed: false }, runtime: { state: "READY" }, mission: { needsHuman: null } })).toBe(false);
    expect(ownerActionKnown(null)).toBe(false);
    expect(ownerActionKnown({ runtime: { state: "OFFLINE" }, mission: { needsHuman: "none" } })).toBe(false);
    expect(ownerActionKnown({ runtime: { state: "READY" }, mission: {} })).toBe(false);
    expect(ownerActionKnown({ telemetry: { stateFeed: true }, runtime: { state: "READY" }, mission: { needsHuman: "none" } })).toBe(true);
  });
  it.each([null, undefined, "", " ", true, false, {}, [], "NaN", Infinity])("does not turn absent or invalid evidence into a zero: %s", value => {
    expect(finiteNumber(value)).toBeNull();
  });
  it("preserves a real zero and signed returns", () => {
    expect(finiteNumber(0)).toBe(0);
    expect(finiteNumber("-0.025")).toBe(-0.025);
  });
});
