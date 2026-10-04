"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AmbientAudio } from "@/lib/audio";
import { DEFAULT_SETTINGS, parseSettings, STORAGE_KEY, type Settings, type SoundId } from "@/lib/settings";
import { createTimer, timerReducer, formatTime } from "@/lib/timer";

export function useFocuscape() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [timer, dispatch] = useReducer(timerReducer, undefined, () => createTimer());
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const audio = useRef<AmbientAudio | null>(null);
  const playbackRequest = useRef({ id: 0 });
  const settingsRef = useRef(settings);
  const handledCompletion = useRef(0);

  useEffect(() => {
    const requests = playbackRequest.current;
    let stored = DEFAULT_SETTINGS;
    try { stored = parseSettings(localStorage.getItem(STORAGE_KEY)); } catch { /* Private browsing may block storage. */ }
    settingsRef.current = stored;
    // Hydrate browser-only preferences after SSR; this one-time update is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(stored);
    dispatch({ type: "configure", durations: { focus: stored.focusMinutes * 60_000, break: stored.breakMinutes * 60_000 } });
    setReady(true);
    return () => { requests.id++; audio.current?.dispose(); audio.current = null; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    settingsRef.current = settings;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* App remains usable without persistence. */ }
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    try { audio.current?.update(settings, playing, muted); }
    catch {
      // Audio failures must not interrupt the independent timer.
      playbackRequest.current.id++;
      audio.current?.dispose();
      audio.current = null;
      // Report an external audio API failure; disposal prevents repeated updates.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      setError("音を再生できませんでした。もう一度「音を再生」を押してください。");
    }
  }, [settings, ready, playing, muted]);

  useEffect(() => {
    if (!timer.running) return;
    const tick = () => dispatch({ type: "tick", now: Date.now(), autoStart: settingsRef.current.autoStart });
    const interval = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
      window.removeEventListener("focus", tick);
    };
  }, [timer.running]);

  useEffect(() => {
    const completion = timer.completion;
    if (!completion || completion.id <= handledCompletion.current) return;
    handledCompletion.current = completion.id;
    const text = completion.phase === "focus" ? "集中、おつかれさまでした。ひと息つきましょう。" : "休憩が終わりました。次の集中を始めましょう。";
    // A reducer completion is an external clock event; announce it once to the UI.
    setMessage(text);
    const current = settingsRef.current;
    if (current.chime) {
      try { audio.current?.chime(); } catch { /* The visible completion still announces the session. */ }
    }
    if (current.notifications && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("Focuscape", { body: text, icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`, tag: "focuscape-session" }); } catch { /* Mobile browsers may not support this constructor. */ }
    }
  }, [timer.completion]);

  useEffect(() => {
    const label = timer.phase === "focus" ? "Focus" : "Break";
    document.title = timer.running ? `${formatTime(timer.remainingMs)} · ${label} — Focuscape` : "Focuscape — ひとつのことに、深く。";
  }, [timer.remainingMs, timer.running, timer.phase]);

  const playAudio = useCallback(async () => {
    const request = ++playbackRequest.current.id;
    // Show the stop control immediately, including while the browser resumes audio.
    setPlaying(true);
    try {
      audio.current ??= new AmbientAudio();
      await audio.current.unlock();
      if (request === playbackRequest.current.id) setError("");
    } catch (cause) {
      if (request === playbackRequest.current.id) {
        setPlaying(false);
        setError(cause instanceof Error ? cause.message : "音を再生できませんでした。もう一度お試しください。");
      }
    }
  }, []);

  const stopAudio = () => {
    playbackRequest.current.id++;
    setPlaying(false);
  };

  const toggleTimer = useCallback(() => {
    if (!ready) return;
    setMessage("");
    dispatch({ type: timer.running ? "pause" : "start", now: Date.now() });
    if (!timer.running) void playAudio();
  }, [timer.running, ready, playAudio]);

  const toggleSound = async (id: SoundId) => {
    const enabling = !settings.sounds[id].enabled;
    setSettings((old) => ({ ...old, sounds: { ...old.sounds, [id]: { ...old.sounds[id], enabled: enabling } } }));
    if (enabling) await playAudio();
    else if (!Object.entries(settings.sounds).some(([other, sound]) => other !== id && sound.enabled)) stopAudio();
  };

  const togglePlayback = async () => {
    if (playing) { stopAudio(); return; }
    await playAudio();
  };

  const saveSettings = (updated: Settings) => {
    setSettings(updated);
    if (updated.focusMinutes !== settings.focusMinutes || updated.breakMinutes !== settings.breakMinutes) {
      dispatch({ type: "configure", durations: { focus: updated.focusMinutes * 60_000, break: updated.breakMinutes * 60_000 } });
    }
  };

  return { settings, ready, timer, dispatch, playing, muted, setMuted, message, setMessage, error, setError,
    toggleTimer, toggleSound, togglePlayback, saveSettings };
}
