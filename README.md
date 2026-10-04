# Focuscape

**ひとつのことに、深く。**

25分の集中と5分の休憩、好きな環境音を重ねられる集中作業アプリ。登録・バックエンド・外部音源は不要です。

## 起動

Node.js **22.14以上** と npm が必要です。

このフォルダで次を実行してください。

```sh
npm ci
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。

本番用ビルド:

```sh
npm run build
npm start
```

スマートフォンから同じLAN内のPCへアクセスする場合は、開発サーバーを `npm run dev -- --hostname 0.0.0.0` で起動し、PCのLAN IPアドレスのポート3000を開いてください。ブラウザ通知はHTTPSまたはlocalhostが必要です。

## GitHub Pagesで公開

公開先: [https://naru18vr.github.io/Focuscape/](https://naru18vr.github.io/Focuscape/)

GitHubの **Settings → Pages → Build and deployment → Source** は **GitHub Actions** に設定します。`main` へのPushで `.github/workflows/pages.yml` がテスト・Lint・静的ビルド・アセット検証・型チェックと、Chromium / Firefox / WebKitでの操作テストを実行し、すべて成功した場合に `out/` を公開します。失敗時は公開版を更新しません。Actions画面から手動実行することもできます。

Pages用の出力を手元で検証する場合:

```sh
npm run build:pages
npm run verify:pages
```

このビルドだけ `GITHUB_PAGES=true` にし、静的出力と `/Focuscape` のベースパスを適用します。通知アイコンもこのパスに対応しています。Pages用の `out/` は静的Webサーバーで配信し、`next start` は通常の `npm run build` 後に使用します。

`out/` と `.next/` は生成物なのでGitには含めません。通常の `npm run dev` は引き続き [http://127.0.0.1:3000](http://127.0.0.1:3000) で動きます。

## 使い方

1. 好きな環境音のカードを選びます。選択時に音が流れます。無音でも使えます。
2. **START** を押して集中を始めます。
3. **PAUSE** で一時停止、回転矢印で現在のセッションをリセットします。
4. 集中終了時は休憩へ、休憩終了時は集中へ切り替わります。初期設定では次のSTARTを待ちます。

音はタイマーとは独立しています。一時停止・リセット・セッション切り替えで音は止まりません。環境音横の「音を停止」、個別カード、Master Volumeのミュートで操作します。再生準備中も停止でき、最後の操作を優先します。通知音もMaster Volumeとミュートに従います。

Spaceキーでも開始・一時停止できます。入力中・日本語変換中・修飾キーとの組み合わせ・ボタン操作中・設定画面表示中はSpaceショートカットを無効にします。

設定アイコンから集中時間（1〜180分）、休憩時間（1〜60分）、通知音、次のセッションの自動開始、任意のブラウザ通知を変更できます。時間の変更は一時停止中に行ってください。時間を変更すると停止中のタイマーは新しい時間にリセットされます。

## 実装したもの

- 終了予定時刻に基づく25分／5分のタイマー、開始・一時停止・再開・リセット。
- Focus／Breakの手動切り替えと、終了時の自動切り替え。
- 小さな2音の終了音、読み上げ対象の画面内メッセージ、許可されたブラウザ通知。
- Rain / White Noise / Cafe / Ocean / Forest / Fireplace の6種類のオリジナル合成環境音。
- 6音の同時ミックス、個別音量、Master Volume、全体ミュート、150msの音量フェード。
- localStorageによる時間・音の選択・音量・通知・自動開始設定の保存。
- ダークUI、休憩時の色分け、円形プログレス、タブタイトルの残り時間。
- デスクトップ6列／スマートフォン3列の音カード。高さの低いPC画面向けのコンパクト表示。
- ネイティブボタン・スライダー・ダイアログ、キーボード操作、明示的ラベル、reduced-motion対応。

## 構成

```text
src/
  app/
    page.tsx               エントリーポイント
    layout.tsx             日本語・メタデータ
    globals.css            テーマ・レスポンシブUI
    icon.svg               オリジナルのアプリアイコン
  components/
    focuscape.tsx          タイマーと音ミキサーの画面
    settings-dialog.tsx    設定ダイアログ
  hooks/
    use-focuscape.ts       タイマー・音声・保存・通知の連携
  lib/
    timer.ts               独立したタイマーステートマシン
    audio.ts               音声生成・音量制御・終了音
    settings.ts            設定型・初期値・保存値の検証
tests/
  core.test.mjs            時刻計算と設定検証
  audio.test.mjs           PCM波形・音声経路・音量フェード
  dom.test.cjs             React操作と保存の統合テスト
  e2e/focuscape.spec.ts    実ブラウザのタイマー・再生・表示テスト
  serve-pages.mjs         静的出力を本番のベースパスで配信するテスト用サーバー
scripts/
  build-pages.cjs         Pages用の静的ビルド
  verify-pages.mjs        HTML・アセット・ベースパスの検証
.github/workflows/
  pages.yml              テスト・ビルド・Pagesへの自動公開
```

Next.js / React / TypeScript / Tailwind CSS、状態管理はReactのみです。CSSの色変数と `app-shell` のテーマを分離し、ライト・システムテーマを追加しやすくしています。

## 音源とライセンス

すべて `src/lib/audio.ts` がブラウザ内で計算するオリジナルの音です。録音のダウンロード、第三者の音源、使用条件が不明な音源は使っていません。

雨・ノイズ・カフェのざわめき・波・鳥・火をノイズと正弦波で表現しています。カフェは言葉として聞き取れる会話を含まない抽象的な合成音で、実際のカフェ録音ではありません。UIにも「オリジナルの合成環境音」と表示しています。

24秒のステレオループをクロスフェードし、必要な音だけ生成します。PCMは最大24kHzに制限してスマートフォンのメモリ使用を抑えます。音量のゲインとリミッターで6音を混ぜた際の過大なレベルを抑えます。

将来の録音音源への置き換えは、音IDと設定を保ったまま音声エンジン側で対応できます。追加する音源ごとにライセンスと出典を管理してください。

## 確認コマンド

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

実ブラウザのテスト:

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

E2Eは3つのブラウザエンジンで320 / 390 / 768 / 1024 / 1366 / 1440pxの画面、音声のネイティブWeb Audioグラフ、終了処理、設定保存、通知の呼び出し、キーボードを検証し、`test-results/` にスクリーンショットを保存します。GitHub Actionsの `browser-test-results` から結果を取得できます。

Pagesの静的出力そのものを検証する場合は `npm run build:pages` 後に、PowerShellで `$env:TEST_PAGES='true'; npm run test:e2e`、macOS / Linuxでは `TEST_PAGES=true npm run test:e2e` を実行します。テスト専用サーバーで `/Focuscape/` を配信し、本番と同じアセットパスを確認します。

今回の実行結果と未確認項目は [VALIDATION.md](./VALIDATION.md) を参照してください。

## 動作の範囲

- リロードするとタイマーは停止して新しい集中時間に戻ります。設定は保存されます。選択した音は戻りますが、音の再生にはユーザー操作が必要です。
- ページを閉じた後の動作はありません。PCのスリープやモバイルブラウザの凍結中は通知音・通知を鳴らせない場合があります。復帰時には終了予定時刻を確認して現在のセッションを一度だけ終了します。
- 自動開始をONにしても、スリープ中の未実施セッションを集計しません。復帰時から次のセッションを始めます。
- ブラウザ通知の拒否・非対応・音の再生失敗でもタイマーと画面上の終了表示は使えます。
- 保存が禁止されているブラウザでも操作できますが、設定の永続保存はできません。

## 今回の対象外・次の候補

ログイン、課金、SNS、分析、タスク管理、DB、カレンダー連携は実装していません。

次の開発候補は、ライセンスが明確な自然録音による音質向上、サウンドミックスの保存、Light / Systemテーマ、全画面・タイマーだけのFocus Modeです。

ソースコードの反映先は `naru18vr/Focuscape` の `main` ブランチ、公開先はGitHub Pagesです。最新の公開結果はGitHub Actionsの「Deploy Focuscape to GitHub Pages」で確認できます。
