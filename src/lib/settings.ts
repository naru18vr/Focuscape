export const SOUND_IDS = ["rain", "white", "cafe", "ocean", "forest", "fireplace"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export type SoundSetting = { enabled: boolean; volume: number };
export type Settings = {
  version: 1;
  focusMinutes: number;
  breakMinutes: number;
  masterVolume: number;
  chime: boolean;
  notifications: boolean;
  autoStart: boolean;
  sounds: Record<SoundId, SoundSetting>;
};
export const STORAGE_KEY = "focuscape.settings.v1";
export const DEFAULT_SETTINGS: Settings = {
  version: 1, focusMinutes: 25, breakMinutes: 5, masterVolume: 45,
  chime: true, notifications: false, autoStart: false,
  sounds: Object.fromEntries(SOUND_IDS.map((id) => [id, { enabled: false, volume: 50 }])) as Record<SoundId, SoundSetting>,
};

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;
}

// Treat browser storage as untrusted: old/corrupt values must not break the timer.
export function parseSettings(raw: string | null): Settings {
  let input: Partial<Settings> = {};
  try { input = JSON.parse(raw ?? "{}") ?? {}; } catch { /* Use defaults. */ }
  return {
    version: 1,
    focusMinutes: bounded(input.focusMinutes, 25, 1, 180),
    breakMinutes: bounded(input.breakMinutes, 5, 1, 60),
    masterVolume: bounded(input.masterVolume, 45, 0, 100),
    chime: typeof input.chime === "boolean" ? input.chime : true,
    notifications: input.notifications === true,
    autoStart: input.autoStart === true,
    sounds: Object.fromEntries(SOUND_IDS.map((id) => [id, {
      enabled: input.sounds?.[id]?.enabled === true,
      volume: bounded(input.sounds?.[id]?.volume, 50, 0, 100),
    }])) as Record<SoundId, SoundSetting>,
  };
}
