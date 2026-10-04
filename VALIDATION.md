# Focuscape MVP 動作確認

実施日: 2026-10-04（日本時間）

## 完了した確認

| 確認 | 結果 | 方法 |
| --- | --- | --- |
| タイマー・設定の自動テスト | 14件成功 | 実際の `timer.ts` / `settings.ts` をNodeで実行 |
| 音声生成・ミックスの自動テスト | 5件成功 | 実際の `audio.ts` とテスト用AudioContextでPCM・経路・ゲインを確認 |
| React操作・保存の統合テスト | 1件成功 | JSDOMに実際のReactコンポーネントを描画して操作 |
| TypeScript | 成功 | `tsc --noEmit` |
| ESLint | 成功 | `eslint .` |
| 本番ビルド | 成功 | `next build --webpack` |
| 開発サーバー | 起動成功 | Next.jsの同一プロセス起動APIを利用 |
| HTTPレスポンス | 200 | HTMLに25:00と6種類の環境音があることを確認 |
| 本番プレビュー・静的アセット | 成功 | 本番サーバー起動、HTMLとJS/CSSを含む7アセットがHTTP 200 |
| 本番用依存パッケージの監査 | 0件 | `npm audit --omit=dev` |
| GitHub Pages向け静的ビルド | 成功 | `scripts/build-pages.cjs` で `out/` を生成 |
| Pagesのアセット参照 | 成功 | タイマー・6音・`/Focuscape/` 配下の8アセット・アイコン・404を検証 |

### 実際に検証した操作

- START、PAUSE、再開、RESET、Spaceキー。
- 一時停止中の時刻経過で残り時間が減らないこと。
- tickが遅れても終了予定時刻から残り時間を計算すること。
- 25分終了で5分休憩へ、5分休憩終了で25分集中へ移ること。
- 画面内に終了メッセージが出ることと、通常は次のSTARTを待つこと。
- 自動開始時の次のdeadline、スリープ復帰時に未実施セッションを作らないこと。
- 6音のPCMが有限の値で、無音ではなく、クリッピングしていないこと。
- ステレオ・ループ・個別ゲイン・Master Volume・ミュート・150msフェード。
- 停止時のフェードとノード切断、再開時のバッファ再利用。
- 短い低レベルの終了音がMaster Volumeを通ること。
- Rain / Cafeの同時選択、個別音量70% / 20%、Master Volume35%の保存。
- 集中50分／休憩10分への変更、コンポーネント再マウント後の設定復元。
- 音が再生できない場合でもタイマーを操作できること。
- 壊れたlocalStorageの設定を初期値へ復旧できること。

## 実ブラウザで未確認の項目

Windowsの実行制限により、ブラウザ起動は `spawn EPERM` またはMojoのプロセス間通信の `Access denied` で終了しました。ChromeとPlaywrightのChromiumで起動を試しましたが、この環境では実ブラウザの確認を完了できませんでした。

したがって、以下は**実装済みですが未検証**です。

- PC・スマートフォンでの実際の見た目とレイアウト。
- 実際のスピーカー／ヘッドホンからの再生音と音質。
- ネイティブWeb Audioによる再生・音量調整・バックグラウンド挙動。
- OSのブラウザ通知、通知許可画面。
- ネイティブdialogのフォーカストラップとEscape終了。
- iOS / Android固有の自動再生・スリープ制限。

JSDOMの操作テストは実ブラウザの代わりにはなりません。PCM生成のテストも実際の再生音質を保証するものではありません。

`tests/e2e/focuscape.spec.ts` に11件の実ブラウザ用シナリオを同梱しています。ブラウザを起動できる環境で次を実行してください。

```sh
npx playwright install chromium
npm run test:e2e
```

公開前に、実ブラウザと実端末で上記を確認してください。

## 開発環境の補足

この環境ではnpmの子プロセス起動も制限されたため、パッケージは `npm install --ignore-scripts` で導入し、検証コマンドはNodeから各CLIを直接起動しました。Next.jsはworker threadsを利用し、TypeScriptの子プロセスCLIを無効にしています。通常のローカル端末ではREADMEのnpmコマンドを使用できます。

開発・本番ビルドのnpmコマンドには、今回確認したWebpackを明示的に指定しています。

開発用依存関係の監査には、ESLintのglob依存チェーン（braces / micromatch / fast-glob）に5件のhighが残っています。本番用依存関係には検出がありません。公開時点のbraces最新版3.0.3に修正版がないため、Next.jsのLint設定を古い互換性のない版に強制ダウングレードする変更は行っていません。

ソースコードの反映先は `naru18vr/Focuscape` の `main` ブランチです。GitHub Pages用のビルド・公開ワークフローを追加しています。最新の公開成否はGitHub Actionsの「Deploy Focuscape to GitHub Pages」で確認できます。
