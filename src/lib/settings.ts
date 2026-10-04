export const SOUND_IDS = ["rain", "white", "cafe", "ocean", "forest", "fireplace"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export type Phase = "focus" | "break";
export type SoundSetting = { enabled: boolean; volume: number };
export type Settings = {
  version: 1;
  durations: Record<Phase, number>;
  masterVolume: number;
  muted: boolean;
  sounds: Record<SoundId, SoundSetting>;
  chime: boolean;
  notifications: boolean;
  autoStart: boolean;
  theme: "dark";
};

export const SETTINGS_KEY = "focuscape.settings.v1";
export const TIMER_KEY = "focuscape.timer.v1";

export function defaultSettings(): Settings {
  return {
    version: 1,
    durations: { focus: 25 * 60 * 1000, break: 5 * 60 * 1000 },
    masterVolume: 0.5,
    muted: false,
    sounds: {
      rain: { enabled: true, volume: 0.6 },
      white: { enabled: false, volume: 0.35 },
      cafe: { enabled: false, volume: 0.4 },
      ocean: { enabled: false, volume: 0.5 },
      forest: { enabled: false, volume: 0.5 },
      fireplace: { enabled: false, volume: 0.45 },
    },
    chime: true,
    notifications: false,
    autoStart: false,
    theme: "dark",
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unitVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

// Whitelist known fields: stale, malformed, or manually edited storage stays safe.
export function parseSettings(raw: string | null): Settings {
  const defaults = defaultSettings();
  if (!raw) return defaults;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== 1) return defaults;
    const sounds = isRecord(saved.sounds) ? saved.sounds : {};
    for (const id of SOUND_IDS) {
      const sound = sounds[id];
      if (isRecord(sound)) {
        defaults.sounds[id] = {
          enabled: typeof sound.enabled === "boolean" ? sound.enabled : defaults.sounds[id].enabled,
          volume: unitVolume(sound.volume, defaults.sounds[id].volume),
        };
      }
    }
    defaults.masterVolume = unitVolume(saved.masterVolume, defaults.masterVolume);
    for (const field of ["muted", "chime", "notifications", "autoStart"] as const) {
      if (typeof saved[field] === "boolean") defaults[field] = saved[field];
    }
    if (isRecord(saved.durations)) {
      for (const phase of ["focus", "break"] as const) {
        const duration = saved.durations[phase];
        if (typeof duration === "number" && Number.isFinite(duration) && duration >= 60000 && duration <= 10800000) {
          defaults.durations[phase] = Math.round(duration);
        }
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}
