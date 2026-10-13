import type { Fix, Receipt } from "./types";
export type Phase = "ready" | "requesting" | "calibrating" | "locked" | "manual" | "submitting" | "submitted" | "critical";
export type State = { phase: Phase; fix: Fix | null; problem: string | null; receipt: Receipt | null; previousPhase: "locked" | "manual" };
export type Event =
  | { type: "REQUEST" }
  | { type: "SAMPLE"; fix: Fix; locked: boolean }
  | { type: "MANUAL"; fix?: Fix }
  | { type: "FALLBACK"; message: string; clearFix?: boolean }
  | { type: "SEND" }
  | { type: "ACK"; receipt: Receipt }
  | { type: "FAIL"; message: string; critical?: boolean };
export const initialState: State = { phase: "ready", fix: null, problem: null, receipt: null, previousPhase: "manual" };
export function reducer(state: State, event: Event): State {
  if (state.phase === "submitted" || state.phase === "critical") return state;
  switch (event.type) {
    case "REQUEST": return state.phase === "submitting" ? state : { ...state, phase: "requesting", problem: null };
    case "SAMPLE": return ["requesting", "calibrating", "locked"].includes(state.phase) ? { ...state, phase: event.locked ? "locked" : "calibrating", fix: event.fix, problem: null } : state;
    case "MANUAL": return state.phase === "submitting" ? state : { ...state, phase: "manual", fix: event.fix ?? state.fix, problem: null };
    case "FALLBACK": return state.phase === "submitting" ? state : { ...state, phase: "manual", fix: event.clearFix ? null : state.fix, problem: event.message };
    case "SEND": return state.fix && ["locked", "manual"].includes(state.phase) ? { ...state, phase: "submitting", previousPhase: state.phase as "locked" | "manual", problem: null } : state;
    case "ACK": return state.phase === "submitting" ? { ...state, phase: "submitted", receipt: event.receipt } : state;
    case "FAIL": return { ...state, phase: event.critical ? "critical" : state.previousPhase, problem: event.message };
  }
}
