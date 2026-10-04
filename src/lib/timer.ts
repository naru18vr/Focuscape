import { isRecord, type Phase } from "./settings";

export type TimerState = {
  phase: Phase;
  status: "idle" | "running" | "paused";
  durationMs: number;
  remainingMs: number;
  endTime: number | null;
  completion: { id: number; phase: Phase } | null;
};

export type TimerAction =
  | { type: "restore"; state: TimerState }
  | { type: "start"; now: number }
  | { type: "pause"; now: number; durations: Record<Phase, number> }
  | { type: "tick"; now: number; durations: Record<Phase, number>; autoStart: boolean }
  | { type: "reset"; durations: Record<Phase, number> }
  | { type: "select"; phase: Phase; durations: Record<Phase, number> };

export function createTimer(durations: Record<Phase, number>, phase: Phase = "focus"): TimerState {
  return { phase, status: "idle", durationMs: durations[phase], remainingMs: durations[phase], endTime: null, completion: null };
}

export function remainingAt(state: TimerState, now: number): number {
  return state.status === "running" && state.endTime !== null
    ? Math.max(0, Math.min(state.durationMs, state.endTime - now))
    : state.remainingMs;
}

function complete(state: TimerState, durations: Record<Phase, number>, now: number, autoStart = false): TimerState {
  const phase = state.phase === "focus" ? "break" : "focus";
  return {
    phase,
    status: autoStart ? "running" : "idle",
    durationMs: durations[phase],
    remainingMs: durations[phase],
    endTime: autoStart ? now + durations[phase] : null,
    completion: { id: (state.completion?.id ?? 0) + 1, phase: state.phase },
  };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "restore": return action.state;
    case "start":
      if (state.status === "running") return state;
      return { ...state, status: "running", endTime: action.now + state.remainingMs, completion: null };
    case "pause": {
      if (state.status !== "running") return state;
      const remainingMs = remainingAt(state, action.now);
      if (remainingMs === 0) return complete(state, action.durations, action.now);
      return { ...state, status: "paused", remainingMs, endTime: null };
    }
    case "tick": {
      if (state.status !== "running") return state;
      const remainingMs = remainingAt(state, action.now);
      if (remainingMs === 0) return complete(state, action.durations, action.now, action.autoStart);
      return { ...state, remainingMs };
    }
    case "reset": return createTimer(action.durations, state.phase);
    case "select": return createTimer(action.durations, action.phase);
  }
}

export function formatTime(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function restoreTimer(raw: string | null, durations: Record<Phase, number>, now: number, autoStart = false): TimerState {
  const fallback = createTimer(durations);
  if (!raw) return fallback;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== 1 || (saved.phase !== "focus" && saved.phase !== "break")) return fallback;
    if (saved.status !== "idle" && saved.status !== "paused" && saved.status !== "running") return fallback;
    if (typeof saved.durationMs !== "number" || !Number.isFinite(saved.durationMs) || saved.durationMs < 60000 || saved.durationMs > 10800000) return fallback;
    if (typeof saved.remainingMs !== "number" || !Number.isFinite(saved.remainingMs) || saved.remainingMs < 0 || saved.remainingMs > saved.durationMs) return fallback;
    if (saved.status === "running" && (typeof saved.endTime !== "number" || !Number.isFinite(saved.endTime) || saved.endTime > now + saved.durationMs)) return fallback;
    const restored: TimerState = {
      phase: saved.phase,
      status: saved.status,
      durationMs: saved.durationMs,
      remainingMs: saved.remainingMs,
      endTime: saved.status === "running" ? saved.endTime as number : null,
      completion: null,
    };
    if (restored.status === "running") return timerReducer(restored, { type: "tick", now, durations, autoStart });
    return restored;
  } catch {
    return fallback;
  }
}

export function timerSnapshot(state: TimerState): string {
  // Completion events are transient; reloading should not repeat old notifications.
  return JSON.stringify({ version: 1, phase: state.phase, status: state.status, durationMs: state.durationMs, remainingMs: state.remainingMs, endTime: state.endTime });
}
