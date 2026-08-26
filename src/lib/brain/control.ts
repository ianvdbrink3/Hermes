import type { BrainEnvironment } from "@/lib/brain/types";

export type ControlEnvironment = Extract<BrainEnvironment, "research" | "production">;

export function parseControlEnvironment(value: string | null): ControlEnvironment | null {
  if (value === "research" || value === "production") return value;
  return null;
}

export function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function cleanSessionId(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 256 || /[\r\n\0]/.test(clean)) return null;
  return clean;
}

export function cleanTitle(value: unknown) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  return clean.slice(0, 180);
}

export function researchOnly(environment: ControlEnvironment) {
  return environment === "research";
}

export const CONTROL_POLICY = {
  productionInteractive: false,
  researchInteractive: true,
  builderInteractive: false,
  executionMutable: false,
  explanation:
    "Hermes Control can inspect production sessions, but interactive agent turns, session mutation and forks are limited to his-research. Broker execution remains outside Brain Studio.",
} as const;