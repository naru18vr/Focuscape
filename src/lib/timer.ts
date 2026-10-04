export type Phase = "focus" | "break";
export type Durations = Record<Phase, number>;
export type TimerState = {
  phase: Phase;
  running: boolean;
  remainingMs: number;
  deadline: number | null;
  durations: Durations;
  completedFocus: number;
  completion: { id: number; phase: Phase } | null;
};
export type TimerAction =
  | { type: "start" | "pause" | "tick"; now: number; autoStart?: boolean }
  | { type: "reset" }
  | { type: "phase"; phase: Phase }
  | { type: "configure"; durations: Durations };

export function createTimer(durations: Durations = { focus: 25 * 60_000, break: 5 * 60_000 }): TimerState {
  return { phase: "focus", running: false, remainingMs: durations.focus, deadline: null, durations, completedFocus: 0, completion: null };
}

function complete(state: TimerState, now: number, autoStart = false): TimerState {
  const phase = state.phase === "focus" ? "break" : "focus";
  // Only complete the current session, even after sleep; never invent missed sessions.
  return {
    ...state, phase, remainingMs: state.durations[phase], running: autoStart,
    deadline: autoStart ? now + state.durations[phase] : null,
    completedFocus: state.completedFocus + Number(state.phase === "focus"),
    completion: { id: (state.completion?.id ?? 0) + 1, phase: state.phase },
  };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "start":
      return state.running ? state : { ...state, running: true, deadline: action.now + state.remainingMs };
    case "pause": {
      if (!state.running || state.deadline === null) return state;
      const remainingMs = Math.max(0, state.deadline - action.now);
      return remainingMs === 0 ? complete(state, action.now) : { ...state, remainingMs, running: false, deadline: null };
    }
    case "tick": {
      if (!state.running || state.deadline === null) return state;
      const remainingMs = Math.max(0, state.deadline - action.now);
      return remainingMs === 0 ? complete(state, action.now, action.autoStart) : { ...state, remainingMs };
    }
    case "reset":
      return { ...state, running: false, deadline: null, remainingMs: state.durations[state.phase] };
    case "phase":
      return action.phase === state.phase ? state : { ...state, phase: action.phase, running: false, deadline: null, remainingMs: state.durations[action.phase] };
    case "configure":
      return { ...state, durations: action.durations, remainingMs: state.running ? state.remainingMs : action.durations[state.phase] };
  }
}

export function formatTime(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
