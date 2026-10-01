<div align="center">

# 🎬 XOi · AIショートドラマ工場

**小説から完成映像まで、全工程を自動化するオールインワンAIショートドラマ制作エンジン。**

「企画 → 脚本 → 絵コンテ → 映像制作」の完全なクローズドループを構築。ローカル運用・プログラマブル・反復改善が可能で、制作効率を10倍以上に向上させます。

</div>

---

## 🌐 多言語サポート

| 言語     | Language              |
| -------- | --------------------- |
| 简体中文 | Chinese (Simplified)  |
| 繁體中文 | Chinese (Traditional) |
| English  | English               |
| ไทย      | Thai                  |
| Tiếng Việt | Vietnamese          |
| 日本語   | Japanese              |
| Русский  | Russian               |

---

## 🌟 主な機能

- ✅ **インフィニットキャンバス制作ワークベンチ** — 脚本・キャラクター・絵コンテ・素材・映像ノードを無限キャンバス上で自由に編成し、並行制作に対応。
- ✅ **三層Agent協力体制** — 意思決定層・実行層・監督層が連携し、タスク分解・コンテンツ生成・品質レビュー・改訂フィードバックをカバー。
- ✅ **永続化Agentメモリ** — ローカルONNXベクトル検索に基づくクロスセッション記憶システム。短期メッセージ・長期要約・意味的検索をサポート。
- ✅ **プログラマブルベンダーシステム** — 設定センターでベンダーのTypeScriptロジックを直接記述し、再起動なしで即時反映。
- ✅ **章イベントグラフ駆動の改編** — 原作の章イベントを自動抽出・構造化し、コンテキストを正確に参照。
- ✅ **Skillファイル設定** — ScriptAgentとProductionAgentのコアプロンプトをMarkdown Skillファイルとして外部化し、オンライン編集と素早い調整を可能に。

---

## 🚀 クイックスタート

1. サービスを起動してログイン（初期値：`admin` / `admin123`）。
2. 設定センターでモデルベンダー（テキスト/画像/動画）を設定。
3. プロジェクトを作成し、原作をインポートして章イベントを抽出。
4. ScriptAgentでストーリー骨格・改編戦略・構造化脚本を生成。
5. ProductionAgentに切り替え、無限キャンバスで絵コンテ・素材・映像ノードを整理。
6. 絵コンテ画像をノード単位で微調整し、最終映像を結合・エクスポート。

> ⚠️ **初回ログイン** アカウント：`admin`、パスワード：`admin123`。本番環境では `XOI_ADMIN_PASSWORD` 環境変数でデフォルトパスワードを変更してください。

---

## 🚀 インストール

### 前提条件

- ✅ LLM APIエンドポイント
- ✅ 動画生成APIエンドポイント
- ✅ 画像生成APIエンドポイント

### ローカル実行

```bash
yarn install
yarn dev        # 開発モード、ポート10588
yarn build      # 本番ビルド
yarn start      # 本番実行
```

### Docker

```shell
docker build -t xoi .
docker run -d -p <ローカルポート>:10588 -v <データパス>:/app/data xoi
```

### 環境変数

| 変数                 | 説明                                         |
| -------------------- | -------------------------------------------- |
| `NODE_ENV`           | 実行環境、`prod` は本番                     |
| `PORT`               | サービスポート（デフォルト10588）            |
| `OSSURL`             | 静的アセットのアクセスURL                     |
| `XOI_ADMIN_USERNAME` | 管理者ユーザー名（初回のみ、デフォルトadmin） |
| `XOI_ADMIN_PASSWORD` | 管理者パスワード（初回のみ、デフォルトadmin123） |

### クラウドサーバー展開

```bash
# 1. Node.js / Yarn / PM2 をインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g yarn pm2

# 2. デプロイ
cd /opt
git clone <あなたのXOiリポジトリ>
cd <repo>
yarn install
yarn build

# 3. PM2を設定（pm2.json）
```

```json
{
  "name": "xoi",
  "script": "data/serve/app.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": { "NODE_ENV": "prod", "PORT": 10588, "OSSURL": "http://127.0.0.1:10588/" }
}
```

```bash
# 4. サービス起動
pm2 start pm2.json
pm2 startup
pm2 save
```

---

## 🔧 開発ガイド

### 技術スタック

| カテゴリ | 技術                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| ランタイム | Node.js 23.11.1+                                                                                 |
| 言語     | TypeScript 5.x                                                                                    |
| バックエンド | Express 5                                                                                       |
| DB       | SQLite（better-sqlite3 / knex）                                                                   |
| AI       | Vercel AI SDK（OpenAI / Anthropic / Google / DeepSeek / 智譜 / MiniMax / 通義千問 / xAI）         |
| ローカルAI | @huggingface/transformers（ONNX）                                                                |
| リアルタイム | Socket.IO                                                                                     |
| 画像処理 | Sharp                                                                                             |
| コンテナ | Docker                                                                                            |

```bash
git clone <あなたのXOiリポジトリ>
cd <repo>
yarn install
yarn dev       # バックエンド開発サーバー、ポート10588
yarn lint      # 型チェック
```

---

## 💌 お問い合わせ

- 🌐 Web: https://xoi.net
- 📧 Email: contact@xoi.net

---

## 📜 ライセンス

XOiは**プロプライエタリ（クローズドソース）な商用ソフトウェア**です。XOiの書面による許諾なしに、複製・配布・リバースエンジニアリング・再配布は禁止されています。オープンソースのサードパーティ依存関係はそれぞれのライセンスに従います。詳細は `NOTICES.txt` を参照してください。

完全な規約は [LICENSE](../LICENSE) を参照してください。

---

##### © 2026 XOi. All rights reserved.
