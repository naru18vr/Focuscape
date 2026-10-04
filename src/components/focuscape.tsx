"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AudioLines, Check, CloudRain, Coffee, Flame, Leaf, Mountain, Pause, Play, RotateCcw, Settings2, Volume2, VolumeX, Waves, Wind, X, type LucideIcon } from "lucide-react";
import { useFocuscape } from "@/hooks/use-focuscape";
import { formatTime } from "@/lib/timer";
import type { SoundId } from "@/lib/settings";
import { SettingsDialog } from "./settings-dialog";

const sounds: { id: SoundId; name: string; description: string; icon: LucideIcon }[] = [
  { id: "rain", name: "Rain", description: "窓辺の雨", icon: CloudRain },
  { id: "white", name: "White Noise", description: "穏やかなノイズ", icon: Wind },
  { id: "cafe", name: "Cafe", description: "遠くのざわめき", icon: Coffee },
  { id: "ocean", name: "Ocean", description: "寄せては返す波", icon: Waves },
  { id: "forest", name: "Forest", description: "木々と鳥の声", icon: Leaf },
  { id: "fireplace", name: "Fireplace", description: "火のぬくもり", icon: Flame },
];

export function Focuscape() {
  const app = useFocuscape();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { timer, settings, ready, toggleTimer } = app;
  const enabledCount = sounds.filter(({ id }) => settings.sounds[id].enabled).length;
  const progress = Math.max(0, Math.min(1, timer.remainingMs / timer.durations[timer.phase]));
  const time = formatTime(timer.remainingMs);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code === "Space" && !event.repeat && !settingsOpen && !target.closest("input, button, textarea, select, a, [contenteditable]")) {
        event.preventDefault(); toggleTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTimer, settingsOpen]);

  return <div className={`app-shell ${timer.phase === "break" ? "break-theme" : ""}`}>
    <div className="ambient-glow" aria-hidden="true" />
    <header className="site-header">
      <div className="brand" aria-label="Focuscape"><span className="brand-icon"><Mountain size={23} strokeWidth={1.7} /></span>Focuscape<span className="brand-dot">.</span></div>
      <div className="header-actions"><span className="header-caption"><span />A little space for focus</span><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="設定を開く" disabled={!ready}><Settings2 size={19} /></button></div>
    </header>

    <main id="main-content">
      <section className="timer-section" aria-label="集中タイマー">
        <p className="intro-line">ひとつのことに、深く。</p>
        <div className="phase-selector" role="group" aria-label="セッションを選択">
          <button aria-pressed={timer.phase === "focus"} onClick={() => { app.dispatch({ type: "phase", phase: "focus" }); app.setMessage(""); }} disabled={!ready}><span className="phase-dot" />Focus <span className="phase-minutes">{settings.focusMinutes}分</span></button>
          <button aria-pressed={timer.phase === "break"} onClick={() => { app.dispatch({ type: "phase", phase: "break" }); app.setMessage(""); }} disabled={!ready}><Leaf size={13} />Break <span className="phase-minutes">{settings.breakMinutes}分</span></button>
        </div>

        <div className="timer-face">
          <svg className="timer-ring" viewBox="0 0 360 360" aria-hidden="true"><circle className="ring-track" cx="180" cy="180" r="165" /><circle className="ring-progress" cx="180" cy="180" r="165" pathLength="1" strokeDasharray={`${progress} 1`} transform="rotate(-90 180 180)" /></svg>
          <div className="timer-content"><span className="timer-label">{timer.phase === "focus" ? "FOCUS TIME" : "TAKE A BREAK"}</span><div className={`timer-digits ${time.length > 5 ? "long-time" : ""}`} role="timer" aria-label={`残り ${time}`} aria-live="off" data-testid="timer">{time}</div><span className="timer-status"><span className={timer.running ? "status-dot running" : "status-dot"} />{timer.running ? (timer.phase === "focus" ? "いま、集中しています" : "ゆっくり、ひと休み") : timer.remainingMs < timer.durations[timer.phase] ? "一時停止中" : "準備ができたら、始めましょう"}</span></div>
        </div>

        <div className="timer-actions"><button className="start-button" onClick={toggleTimer} disabled={!ready}>{timer.running ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}<span>{timer.running ? "PAUSE" : "START"}</span></button><button className="reset-button" aria-label="タイマーをリセット" title="タイマーをリセット" disabled={!ready} onClick={() => { app.dispatch({ type: "reset" }); app.setMessage(""); }}><RotateCcw size={18} /></button></div>
        <p className="session-note">{timer.phase === "focus" ? `次は ${settings.breakMinutes}分の休憩` : `次は ${settings.focusMinutes}分の集中`}<span>·</span>SESSION {String(timer.completedFocus + 1).padStart(2, "0")}</p>
      </section>

      <section className="sound-section" aria-labelledby="sounds-title">
        <div className="sound-heading"><div><p className="eyebrow">SET THE ATMOSPHERE</p><h1 id="sounds-title">自分だけの、静かな場所。</h1><p className="sound-description">好きな音を選んで、重ねてみましょう。</p></div><button className="playback-button" disabled={!ready || enabledCount === 0} onClick={() => void app.togglePlayback()} aria-label={app.playing && enabledCount ? "環境音をすべて停止" : "選択した環境音を再生"}>{app.playing && enabledCount ? <Pause size={14} /> : <Play size={14} />}<span>{app.playing && enabledCount ? "音を停止" : "音を再生"}</span></button></div>
        <div className="sound-grid">
          {sounds.map(({ id, name, description, icon: Icon }) => {
            const sound = settings.sounds[id];
            return <div key={id} className={`sound-card ${sound.enabled ? "selected" : ""}`}>
              <button className="sound-toggle" aria-label={`${name} ${sound.enabled ? "OFF" : "ON"}`} aria-pressed={sound.enabled} disabled={!ready} onClick={() => void app.toggleSound(id)}>
                <span className="sound-card-top"><Icon className="sound-icon" size={27} strokeWidth={1.45} /><span className="sound-selection">{sound.enabled ? <Check size={12} /> : <span />}</span></span>
                <span className="sound-name">{name}</span><span className="sound-subtitle">{description}</span>
              </button>
              <div className="sound-volume"><input aria-label={`${name}の音量`} type="range" min="0" max="100" value={sound.volume} style={{ "--range-progress": `${sound.volume}%` } as CSSProperties} disabled={!ready || !sound.enabled} onChange={(e) => app.saveSettings({ ...settings, sounds: { ...settings.sounds, [id]: { ...sound, volume: Number(e.target.value) } } })} /><span aria-hidden="true">{sound.volume}%</span></div>
            </div>;
          })}
        </div>
        <div className="mixer-footer">
          <div className="master-control"><button className="mute-button" aria-label={app.muted ? "ミュートを解除" : "すべての音をミュート"} aria-pressed={app.muted} onClick={() => app.setMuted(!app.muted)} disabled={!ready}>{app.muted || settings.masterVolume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><label htmlFor="master-volume">Master Volume</label><input id="master-volume" aria-label="Master Volume" type="range" min="0" max="100" value={settings.masterVolume} disabled={!ready} style={{ "--range-progress": `${settings.masterVolume}%` } as CSSProperties} onChange={(e) => app.saveSettings({ ...settings, masterVolume: Number(e.target.value) })} /><span className="master-value">{settings.masterVolume}%</span></div>
          <div className="mix-status"><AudioLines size={15} /><span>{enabledCount ? `${enabledCount}種類の音 ${app.playing && !app.muted && settings.masterVolume > 0 ? "をミックス中" : "を選択中"}` : "音のない静けさも、いいものです。"}</span></div>
        </div>
      </section>
      <div className="inline-status" role="status" aria-live="polite">{app.message && <div className="completion-message"><Leaf size={17} /><span>{app.message}</span><button className="icon-button" aria-label="終了メッセージを閉じる" onClick={() => app.setMessage("")}><X size={15} /></button></div>}</div>
      {app.error && <div role="alert" className="error-message">{app.error}<button className="icon-button" aria-label="エラーメッセージを閉じる" onClick={() => app.setError("")}><X size={15} /></button></div>}
    </main>
    <footer className="site-footer"><span>Less noise. More focus.</span><span className="keyboard-tip"><kbd>space</kbd>で開始 / 一時停止</span><span className="audio-note">オリジナルの合成環境音</span></footer>
    {settingsOpen && <SettingsDialog close={() => setSettingsOpen(false)} settings={settings} running={timer.running} save={app.saveSettings} />}
  </div>;
}
