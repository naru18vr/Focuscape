"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import type { Settings } from "@/lib/settings";

export function SettingsDialog({ close, settings, running, save }: {
  close: () => void; settings: Settings; running: boolean; save: (settings: Settings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [notice, setNotice] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => "Notification" in window ? Notification.permission : "unsupported");

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); opener?.focus({ preventScroll: true }); };
  }, []);

  const requestNotification = async () => {
    if (!("Notification" in window)) { setNotice("このブラウザでは画面内の表示と通知音でお知らせします。"); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setDraft((old) => ({ ...old, notifications: result === "granted" }));
      if (result !== "granted") setNotice("通知は許可されていません。画面内の表示と通知音は引き続き使えます。");
    } catch { setNotice("通知を有効にできませんでした。画面内の表示と通知音を使えます。"); }
  };

  return <dialog ref={dialog} className="settings-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }} aria-labelledby="settings-title">
    <form className="settings-content" onSubmit={(event) => { event.preventDefault(); save(draft); close(); }}>
      <div className="dialog-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="settings-title">集中の設定</h2></div><button type="button" className="icon-button" aria-label="設定を閉じる" onClick={close}><X size={20} /></button></div>
      <p className="dialog-description">自分のペースで、心地よく。</p>
      <fieldset className="duration-fields" disabled={running}>
        <legend className="sr-only">タイマー時間</legend>
        <label>集中時間<span className="number-field"><input aria-label="集中時間（分）" type="number" min="1" max="180" required value={draft.focusMinutes} onChange={(e) => setDraft({ ...draft, focusMinutes: Number(e.target.value) })} /><span>分</span></span></label>
        <label>休憩時間<span className="number-field"><input aria-label="休憩時間（分）" type="number" min="1" max="60" required value={draft.breakMinutes} onChange={(e) => setDraft({ ...draft, breakMinutes: Number(e.target.value) })} /><span>分</span></span></label>
      </fieldset>
      {running && <p className="setting-note">時間を変更するにはタイマーを一時停止してください。</p>}
      <label className="setting-row"><span><strong>やさしい通知音</strong><small>セッション終了時に短い音を鳴らします</small></span><input className="switch" type="checkbox" checked={draft.chime} onChange={(e) => setDraft({ ...draft, chime: e.target.checked })} /></label>
      <label className="setting-row"><span><strong>次のセッションを自動開始</strong><small>集中と休憩を続けて繰り返します</small></span><input className="switch" type="checkbox" checked={draft.autoStart} onChange={(e) => setDraft({ ...draft, autoStart: e.target.checked })} /></label>
      <div className="setting-row"><span><strong>ブラウザ通知</strong><small>{permission === "denied" ? "ブラウザのサイト設定から許可できます" : permission === "unsupported" ? "このブラウザでは対応していません" : "別のタブで作業中も終了をお知らせ"}</small></span>
        {permission === "granted" ? <input aria-label="ブラウザ通知" className="switch" type="checkbox" checked={draft.notifications} onChange={(e) => setDraft({ ...draft, notifications: e.target.checked })} /> : <button className="notification-button" type="button" onClick={requestNotification} disabled={permission === "unsupported" || permission === "denied"}><Bell size={15} />有効にする</button>}
      </div>
      <p className="setting-note">通知音はMaster Volumeに従います。ページを閉じるとタイマーは終了します。</p>
      {notice && <p role="status" className="setting-note">{notice}</p>}
      <button className="save-button" type="submit"><Check size={17} />設定を保存</button>
    </form>
  </dialog>;
}
