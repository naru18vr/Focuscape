"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, AudioLines, Check, Coffee, Flame, Headphones, Leaf, Moon, Pause, Play, RotateCcw, Settings2, Trees, Volume2, VolumeX, Waves, X, CloudRain, type LucideIcon } from "lucide-react";
import { useFocuscape } from "@/hooks/use-focuscape";
import { useAmbientMixer } from "@/hooks/use-ambient-mixer";
import { SOUND_IDS, type Settings, type SoundId, type SoundSetting } from "@/lib/settings";
import { formatTime } from "@/lib/timer";

const SOUNDS: Record<SoundId, { name: string; description: string; icon: LucideIcon; color: string }> = {
  rain: { name: "Rain", description: "窓辺の雨音", icon: CloudRain, color: "#a3bec9" },
  white: { name: "White Noise", description: "思考に、静かな余白", icon: AudioLines, color: "#c5c5c1" },
  cafe: { name: "Cafe", description: "お気に入りの席で", icon: Coffee, color: "#d1b08b" },
  ocean: { name: "Ocean", description: "寄せては返す波", icon: Waves, color: "#8fbcc0" },
  forest: { name: "Forest", description: "木々と、小鳥の声", icon: Trees, color: "#a8bd92" },
  fireplace: { name: "Fireplace", description: "暖かな火のゆらぎ", icon: Flame, color: "#d3a18b" },
};

function Brand() {
  return <div className="brand">
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m6 26 13-18 15 18M12 26l8-11 8 11M13 32h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>focuscape<span className="brand-dot">.</span></span>
  </div>;
}

function VolumeSlider({ label, value, onChange, color, disabled = false }: { label: string; value: number; onChange: (value: number) => void; color?: string; disabled?: boolean }) {
  const percent = Math.round(value * 100);
  return <input type="range" min="0" max="100" step="1" value={percent} disabled={disabled} aria-label={label} aria-valuetext={`${percent}%`} onChange={event => onChange(Number(event.target.value) / 100)} style={{ "--range-progress": `${percent}%`, ...(color ? { "--range-color": color } : {}) } as CSSProperties} />;
}

function SoundCard({ id, sound, onToggle, onVolume, ready }: { id: SoundId; sound: SoundSetting; onToggle: () => void; onVolume: (volume: number) => void; ready: boolean }) {
  const { name, description, icon: Icon, color } = SOUNDS[id];
  return <article className={`sound-card ${sound.enabled ? "selected" : ""}`} style={{ "--sound-color": color } as CSSProperties}>
    <button className="sound-toggle" type="button" aria-label={`${name}を${sound.enabled ? "OFF" : "ON"}`} aria-pressed={sound.enabled} onClick={onToggle} disabled={!ready}>
      <span className="sound-card-top"><Icon className="sound-icon" size={24} strokeWidth={1.5} aria-hidden="true" /><span className="sound-switch" aria-hidden="true">{sound.enabled ? <Check size={12} strokeWidth={2.3} /> : <span />}</span></span>
      <span className="sound-name">{name}</span>
      <span className="sound-description">{description}</span>
    </button>
    <div className="sound-volume"><VolumeSlider label={`${name}の音量`} value={sound.volume} onChange={onVolume} color={color} disabled={!ready} /><span aria-hidden="true">{Math.round(sound.volume * 100)}<span className="percent">%</span></span></div>
  </article>;
}

type Permission = NotificationPermission | "unsupported";

function SettingsDialog({ onClose, settings, onChange, storageAvailable, permission, requestNotifications }: { onClose: () => void; settings: Settings; onChange: (patch: Partial<Settings>) => void; storageAvailable: boolean; permission: Permission; requestNotifications: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function closeDialog() {
    // Close while the dialog is still connected. Removing it first can leave
    // keyboard focus on the document instead of returning to the trigger.
    dialog.current?.close();
    onClose();
  }

  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); closeDialog(); }} onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div className="dialog-inner">
      <div className="dialog-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2 id="settings-title">設定</h2></div><button type="button" className="icon-button" aria-label="設定を閉じる" onClick={closeDialog}><X size={20} /></button></div>
      <div className="settings-session"><div><Leaf size={18} /><span>FOCUS</span><strong>{settings.durations.focus / 60000}<small>分</small></strong></div><ArrowRight size={15} /><div><Moon size={18} /><span>BREAK</span><strong>{settings.durations.break / 60000}<small>分</small></strong></div></div>
      <p className="settings-description">セッション終了後、次のタイマーに切り替わります。準備ができたらSTARTで始めましょう。</p>
      <div className="settings-row"><div><span>終了チャイム</span><p>小さな音で、区切りをお知らせ</p></div><button type="button" role="switch" aria-checked={settings.chime} aria-label="終了チャイム" className={`toggle-switch ${settings.chime ? "on" : ""}`} onClick={() => onChange({ chime: !settings.chime })}><span /></button></div>
      <div className="settings-row"><div><span>ブラウザ通知</span><p>{permission === "unsupported" ? "このブラウザでは利用できません" : permission === "denied" ? "ブラウザのサイト設定から許可できます" : "ほかのタブで作業していてもお知らせ"}</p></div><button type="button" role="switch" aria-checked={settings.notifications && permission === "granted"} aria-label="ブラウザ通知" disabled={permission === "unsupported" || permission === "denied"} className={`toggle-switch ${settings.notifications && permission === "granted" ? "on" : ""}`} onClick={() => { if (settings.notifications && permission === "granted") onChange({ notifications: false }); else void requestNotifications(); }}><span /></button></div>
      <div className="settings-note"><Headphones size={18} /><p>環境音はブラウザ内で生成したオリジナルの合成音です。音はタイマーと独立して再生され、ミュートで一括停止できます。</p></div>
      <p className="storage-note">{storageAvailable ? "設定はこのブラウザに保存されます。" : "このブラウザでは設定を保存できません。現在のページでは通常どおり使えます。"}</p>
      <button type="button" className="dialog-done" onClick={closeDialog}>閉じて、集中する<ArrowRight size={15} /></button>
    </div>
  </dialog>;
}

export function Focuscape() {
  const app = useFocuscape();
  const { timer, settings, ready, start, pause, reset } = app;
  const mixer = useAmbientMixer(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [permission, setPermission] = useReducer((_: Permission, next: Permission) => next, "default");
  const notified = useRef<typeof timer.completion>(null);
  const { chime, play } = mixer;
  const isFocus = timer.phase === "focus";
  const running = timer.status === "running";
  const activeSounds = SOUND_IDS.filter(id => settings.sounds[id].enabled).length;
  const remaining = formatTime(timer.remainingMs);
  const progress = Math.min(100, Math.max(0, timer.remainingMs / timer.durationMs * 100));

  useEffect(() => { setPermission("Notification" in window ? Notification.permission : "unsupported"); }, []);

  useEffect(() => {
    if (!ready || !timer.completion || notified.current === timer.completion) return;
    notified.current = timer.completion;
    chime();
    if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Focuscape", {
          body: timer.completion.phase === "focus" ? `集中、おつかれさまでした。${settings.durations.break / 60000}分休憩しましょう。` : "休憩が終わりました。次の集中を始めましょう。",
          tag: "focuscape-session",
          silent: true,
        });
      } catch { /* The on-screen status remains available if the OS blocks notifications. */ }
    }
  }, [timer.completion, ready, settings.notifications, settings.durations.break, chime]);

  useEffect(() => {
    document.title = timer.status === "idle" && !timer.completion ? "Focuscape — A quieter place to focus" : `${remaining} · ${isFocus ? "Focus" : "Break"} — Focuscape`;
  }, [remaining, isFocus, timer.status, timer.completion]);

  function startOrPause() {
    if (!ready) return;
    if (running) pause();
    else { start(); void play(); }
  }

  function closeSettings() {
    setSettingsOpen(false);
    settingsTrigger.current?.focus();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ready || settingsOpen || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, a, [contenteditable], dialog")) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (timer.status === "running") pause();
        else { start(); void play(); }
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        reset();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [start, pause, reset, play, ready, settingsOpen, timer.status]);

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      app.patchSettings({ notifications: result === "granted" });
    } catch { setPermission("unsupported"); }
  }

  const statusCopy = mixer.status === "error" ? "音を開始できませんでした。STARTか音カードで再試行できます。" : mixer.status === "suspended" ? "音が中断されました。ここを押すと再開できます。" : mixer.status === "playing" ? "あなたのサウンドを再生中" : mixer.status === "muted" ? "環境音はミュート中" : "音を選んで、STARTで始めよう";
  const notice = timer.completion ? (timer.completion.phase === "focus" ? `集中、おつかれさまでした。${settings.durations.break / 60000}分、ひと息つきましょう。` : "休憩が終わりました。次の集中を始めましょう。") : timer.status === "paused" ? "ひと休み中。準備ができたら、続きを。" : running ? (isFocus ? "今は、目の前のことだけ。" : "肩の力を抜いて、ひと息。") : "小さな一歩が、深い集中のはじまり。";

  return <div className={`app-shell ${isFocus ? "focus-phase" : "break-phase"}`}>
    <a className="skip-link" href="#focus-timer">タイマーへ移動</a>
    <header className="app-header"><Brand /><div className="header-actions"><span className="header-note"><span className={`status-dot ${running ? "live" : ""}`} />{running ? (isFocus ? "集中の時間" : "ひと息の時間") : "A quieter place to focus"}</span><span className="header-divider" /><button ref={settingsTrigger} className="icon-button" type="button" aria-label="設定を開く" onClick={() => setSettingsOpen(true)} disabled={!ready}><Settings2 size={19} strokeWidth={1.6} /></button></div></header>

    <main>
      <div className="intro"><span className="eyebrow"><span />YOUR SPACE. YOUR PACE.</span><h1>ここから、深く集中<span>。</span></h1><p>好きな音を選んで、START。あとは、目の前のことだけ。</p></div>
      <div className="workspace">
        <section className="timer-section" id="focus-timer" aria-label="集中タイマー" tabIndex={-1}>
          <div className="mode-selector" role="group" aria-label="セッション選択"><button type="button" aria-pressed={isFocus} onClick={() => { if (!isFocus) app.selectPhase("focus"); }} disabled={!ready} className={isFocus ? "active" : ""}><Leaf size={14} />FOCUS<span>{settings.durations.focus / 60000}m</span></button><button type="button" aria-pressed={!isFocus} onClick={() => { if (isFocus) app.selectPhase("break"); }} disabled={!ready} className={!isFocus ? "active" : ""}><Moon size={14} />BREAK<span>{settings.durations.break / 60000}m</span></button></div>
          <div className="timer-face">
            <div className="timer-halo" />
            <svg className="timer-ring" viewBox="0 0 360 360" aria-hidden="true"><circle className="ring-track" cx="180" cy="180" r="164" /><circle className="ring-progress" cx="180" cy="180" r="164" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress} /></svg>
            <div className="timer-content"><span className="timer-mode">{running ? "IN THE FLOW" : timer.status === "paused" ? "ON A PAUSE" : isFocus ? "TIME TO FOCUS" : "TAKE A BREATH"}</span><div className="timer-number" role="timer" aria-live="off" aria-label={`${isFocus ? "集中" : "休憩"} 残り${remaining}`} data-testid="timer-display">{remaining}</div><span className="timer-caption">{isFocus ? "ひとつのことに、心地よく。" : "次の集中のために、ひと息。"}</span></div>
          </div>
          <div className="timer-controls"><button className="start-button" type="button" onClick={startOrPause} disabled={!ready} aria-label={`${isFocus ? "集中" : "休憩"}タイマーを${running ? "一時停止" : timer.status === "paused" ? "再開" : "開始"}`}>{running ? <Pause size={18} fill="currentColor" strokeWidth={1.5} /> : <Play size={17} fill="currentColor" strokeWidth={1.5} />}<span>{running ? "PAUSE" : timer.status === "paused" ? "RESUME" : isFocus ? "START" : "START BREAK"}</span></button><button className="reset-button" type="button" onClick={app.reset} aria-label="タイマーをリセット" disabled={!ready}><RotateCcw size={17} strokeWidth={1.6} /><span>RESET</span></button></div>
          <div className="session-cycle"><span className={isFocus ? "current" : ""}><i />{settings.durations.focus / 60000}分 集中</span><ArrowRight size={13} aria-hidden="true" /><span className={!isFocus ? "current" : ""}><i />{settings.durations.break / 60000}分 休憩</span></div>
          <p className={`session-feedback ${timer.completion ? "completed" : ""}`} role="status" aria-live="polite" aria-atomic="true">{timer.completion && <Check size={14} aria-hidden="true" />}{notice}</p>
        </section>

        <section className="sound-section" aria-labelledby="sound-heading">
          <div className="sound-heading"><div><h2 id="sound-heading"><Headphones size={18} strokeWidth={1.6} />環境音</h2><p>音を重ねて、あなたの作業空間に。</p></div><span className="sound-count"><span />{activeSounds} SELECTED</span></div>
          <div className="sound-grid">{SOUND_IDS.map(id => <SoundCard key={id} id={id} sound={settings.sounds[id]} ready={ready} onToggle={() => { app.patchSound(id, { enabled: !settings.sounds[id].enabled }); void mixer.play(); }} onVolume={volume => app.patchSound(id, { volume })} />)}</div>
          <div className="master-volume"><button className={`icon-button master-mute ${settings.muted ? "is-muted" : ""}`} type="button" disabled={!ready} aria-label={settings.muted ? "環境音のミュートを解除" : "すべての環境音をミュート"} aria-pressed={settings.muted} onClick={() => { app.patchSettings({ muted: !settings.muted }); if (settings.muted) void mixer.play(); }}>{settings.muted ? <VolumeX size={19} strokeWidth={1.6} /> : <Volume2 size={19} strokeWidth={1.6} />}</button><span className="master-label">Master volume</span><VolumeSlider label="全体音量" value={settings.masterVolume} onChange={masterVolume => app.patchSettings({ masterVolume })} disabled={!ready} /><span className="master-percent">{Math.round(settings.masterVolume * 100)}<span>%</span></span></div>
          <div className={`audio-status ${mixer.status === "error" ? "audio-error" : ""}`} role="status"><span className={`audio-indicator ${mixer.status === "playing" ? "playing" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>{mixer.status === "suspended" || mixer.status === "error" || (mixer.status === "idle" && running && activeSounds > 0) ? <button type="button" onClick={() => void mixer.play()}>{mixer.status === "idle" ? "環境音を再生" : statusCopy}</button> : <span>{statusCopy}</span>}</div>
        </section>
      </div>
    </main>

    <footer className="app-footer"><p><Leaf size={14} strokeWidth={1.6} />少しの静けさが、大きな一歩に。</p><div className="keyboard-hints"><span><kbd>Space</kbd>開始 / 一時停止</span><span><kbd>R</kbd>リセット</span></div><span className="footer-mark">LESS NOISE. MORE FOCUS.</span></footer>
    <div className="sr-only" aria-live="polite">{!app.storageAvailable ? "設定を保存できません。現在のページでは引き続き利用できます。" : ""}</div>
    {settingsOpen && <SettingsDialog onClose={closeSettings} settings={settings} onChange={app.patchSettings} storageAvailable={app.storageAvailable} permission={permission} requestNotifications={requestNotifications} />}
  </div>;
}
