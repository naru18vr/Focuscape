"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { AmbientEngine, type AudioStatus } from "@/lib/audio/ambient-engine";
import type { Settings } from "@/lib/settings";

export function useAmbientMixer(settings: Settings) {
  const engine = useRef<AmbientEngine | null>(null);
  const [status, setStatus] = useReducer((_: AudioStatus, next: AudioStatus) => next, "idle");

  useEffect(() => { engine.current?.setSettings(settings); }, [settings]);
  useEffect(() => () => { engine.current?.destroy(); engine.current = null; }, []);

  const play = useCallback(async () => {
    try {
      engine.current ??= new AmbientEngine(settings, setStatus);
      engine.current.setSettings(settings);
      await engine.current.play();
    } catch { setStatus("error"); }
  }, [settings]);

  const chime = useCallback(() => engine.current?.chime(), []);
  return { status, play, chime };
}
