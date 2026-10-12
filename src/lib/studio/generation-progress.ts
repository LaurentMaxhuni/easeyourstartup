import type { OrbState } from "thinking-orbs";

export type GenerationScreenStage = "preparing" | "queued" | "writing" | "visuals";

const ORB_STATES: Record<GenerationScreenStage, readonly OrbState[]> = {
  preparing: ["connecting", "working"],
  queued: ["working", "breathing"],
  writing: ["composing", "weaving", "solving"],
  visuals: ["shaping", "connecting", "weaving"],
};

export function generationOrbState(stage: GenerationScreenStage, elapsedSeconds: number): OrbState {
  const states = ORB_STATES[stage];
  return states[Math.floor(Math.max(0, elapsedSeconds) / 4) % states.length];
}
