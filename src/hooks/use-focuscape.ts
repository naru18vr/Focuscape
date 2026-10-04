"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { defaultSettings, parseSettings, SETTINGS_KEY, TIMER_KEY, type Settings, type SoundId } from "@/lib/settings";
import { createTimer, restoreTimer, timerReducer, timerSnapshot } from "@/lib/timer";

type PreferenceState = { settings: Settings; ready: boolean; storageAvailable: boolean };
type PreferenceAction =
  | { type: "hydrate"; settings: Settings; storageAvailable: boolean }
  | { type: "patch"; patch: Partial<Settings> }
  | { type: "sound"; id: SoundId; patch: Partial<Settings["sounds"][SoundId]> }
  | { type: "storage-error" };

function preferenceReducer(state: PreferenceState, action: PreferenceAction): PreferenceState {
  switch (action.type) {
    case "hydrate": return { settings: action.settings, ready: true, storageAvailable: action.storageAvailable };
    case "patch": return { ...state, settings: { ...state.settings, ...action.patch } };
    case "sound": return { ...state, settings: { ...state.settings, sounds: { ...state.settings.sounds, [action.id]: { ...state.settings.sounds[action.id], ...action.patch } } } };
    case "storage-error": return { ...state, storageAvailable: false };
  }
}

export function useFocuscape() {
  const [preferences, dispatchPreferences] = useReducer(preferenceReducer, { settings: defaultSettings(), ready: false, storageAvailable: true });
  const [timer, dispatchTimer] = useReducer(timerReducer, defaultSettings().durations, createTimer);
  const persistedTimer = useRef<string | null>(null);
  const { settings, ready } = preferences;

  useEffect(() => {
    let savedSettings: string | null = null;
    let savedTimer: string | null = null;
    let storageAvailable = true;
    try {
      savedSettings = window.localStorage.getItem(SETTINGS_KEY);
      savedTimer = window.localStorage.getItem(TIMER_KEY);
    } catch { storageAvailable = false; }
    const restored = parseSettings(savedSettings);
    dispatchPreferences({ type: "hydrate", settings: restored, storageAvailable });
    dispatchTimer({ type: "restore", state: restoreTimer(savedTimer, restored.durations, Date.now(), restored.autoStart) });
  }, []);

  useEffect(() => {
    if (!ready || !preferences.storageAvailable) return;
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    catch { dispatchPreferences({ type: "storage-error" }); }
  }, [settings, ready, preferences.storageAvailable]);

  useEffect(() => {
    if (!ready || !preferences.storageAvailable) return;
    // A running deadline does not change on each display tick. Avoid synchronous
    // localStorage writes four times a second while preserving exact pause state.
    const snapshot = timerSnapshot({ ...timer, remainingMs: timer.status === "running" ? timer.durationMs : timer.remainingMs });
    if (snapshot === persistedTimer.current) return;
    try {
      window.localStorage.setItem(TIMER_KEY, snapshot);
      persistedTimer.current = snapshot;
    } catch { dispatchPreferences({ type: "storage-error" }); }
  }, [timer, ready, preferences.storageAvailable]);

  useEffect(() => {
    if (!ready || timer.status !== "running") return;
    const tick = () => dispatchTimer({ type: "tick", now: Date.now(), durations: settings.durations, autoStart: settings.autoStart });
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tick);
    tick();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tick);
    };
  }, [ready, timer.status, settings.durations, settings.autoStart]);

  const patchSettings = useCallback((patch: Partial<Settings>) => dispatchPreferences({ type: "patch", patch }), []);
  const patchSound = useCallback((id: SoundId, patch: Partial<Settings["sounds"][SoundId]>) => dispatchPreferences({ type: "sound", id, patch }), []);
  const start = useCallback(() => dispatchTimer({ type: "start", now: Date.now() }), []);
  const pause = useCallback(() => dispatchTimer({ type: "pause", now: Date.now(), durations: settings.durations }), [settings.durations]);
  const reset = useCallback(() => dispatchTimer({ type: "reset", durations: settings.durations }), [settings.durations]);
  const selectPhase = useCallback((phase: "focus" | "break") => dispatchTimer({ type: "select", phase, durations: settings.durations }), [settings.durations]);

  return {
    ...preferences,
    timer,
    patchSettings,
    patchSound,
    start,
    pause,
    reset,
    selectPhase,
  };
}
