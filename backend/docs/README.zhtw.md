<div align="center">

# 🎬 XOi · AI 短劇工廠

**一站式 AI 短劇生產引擎：從小說到成片，全流程自動化。**

圍繞「策劃 → 編劇 → 分鏡 → 出片」構建完整閉環，支援本地化、可程式化、可持續迭代的生產流程，創作效率提升 10 倍以上。

</div>

---

## 🌐 多語言支援

| 語言       | Language              |
| ---------- | --------------------- |
| 簡體中文   | Chinese (Simplified)  |
| 繁體中文   | Chinese (Traditional) |
| English    | English               |
| ไทย        | Thai                  |
| Tiếng Việt | Vietnamese            |
| 日本語     | Japanese              |
| Русский    | Russian               |

---

## 🌟 主要功能

- ✅ **無限畫布生產工作台** — 在無限畫布上組織劇本、角色、分鏡、素材與影片節點，自由編排、回溯與並行生產。
- ✅ **三層 Agent 協作體系** — 決策層、執行層、監督層協同工作，覆蓋任務拆解、內容生成、品質審閱與修訂回饋。
- ✅ **持久化 Agent 記憶** — 基於本地 ONNX 向量檢索的跨會話記憶系統，支援短期訊息、長期摘要與語義召回。
- ✅ **可程式化供應商系統** — 在設定中心直接編寫供應商 TypeScript 邏輯並即時生效，無需重啟。
- ✅ **章節事件圖譜驅動改編** — 自動提取原著章節事件並結構化儲存，精準調用上下文。
- ✅ **Skill 檔案化設定** — ScriptAgent 與 ProductionAgent 核心提示詞外化為 Markdown Skill 檔案，支援線上編輯與快速調優。

---

## 🚀 快速上手

1. 啟動服務並登入（預設：`admin` / `admin123`）。
2. 在設定中心完成模型供應商設定（文字/圖片/影片）。
3. 新建專案並匯入原著，執行章節事件提取。
4. 使用 ScriptAgent 生成故事骨架、改編策略與結構化劇本。
5. 切換到 ProductionAgent，在無限畫布中組織分鏡、素材與影片節點。
6. 對分鏡圖進行節點化精調後回流工作台，完成影片拼接與匯出。

> ⚠️ **首次登入** 帳號：`admin`，密碼：`admin123`。生產環境請透過 `XOI_ADMIN_PASSWORD` 環境變數修改預設口令。

---

## 🚀 安裝部署

### 前置條件

- ✅ 大語言模型 AI 服務介面位址
- ✅ 影片生成服務介面位址
- ✅ 圖片生成模型服務介面

### 本機執行

```bash
yarn install
yarn dev        # 開發模式，埠 10588
yarn build      # 建置生產版本
yarn start      # 執行生產版本
```

### Docker 部署

```shell
docker build -t xoi .
docker run -d -p <本地埠>:10588 -v <資料路徑>:/app/data xoi
```

### 環境變數說明

| 變數                 | 說明                                          |
| -------------------- | --------------------------------------------- |
| `NODE_ENV`           | 執行環境，`prod` 表示生產環境                 |
| `PORT`               | 服務監聽埠（預設 10588）                      |
| `OSSURL`             | 檔案儲存存取位址，用於靜態資源存取            |
| `XOI_ADMIN_USERNAME` | 管理員使用者名稱（僅首次初始化生效，預設 admin） |
| `XOI_ADMIN_PASSWORD` | 管理員密碼（僅首次初始化生效，預設 admin123）  |

### 雲端伺服器部署

```bash
# 1. 安裝 Node.js / Yarn / PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g yarn pm2

# 2. 部署專案
cd /opt
git clone <您的 XOi 倉庫位址>
cd <repo>
yarn install
yarn build

# 3. 設定 PM2（pm2.json）
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
# 4. 啟動服務
pm2 start pm2.json
pm2 startup
pm2 save
```

---

## 🔧 開發指南

### 技術棧

| 類別     | 技術                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 執行時   | Node.js 23.11.1+                                                                          |
| 語言     | TypeScript 5.x                                                                            |
| 後端框架 | Express 5                                                                                 |
| 資料庫   | SQLite（better-sqlite3 / knex）                                                           |
| AI 整合  | Vercel AI SDK（OpenAI / Anthropic / Google / DeepSeek / 智譜 / MiniMax / 通義千問 / xAI） |
| 本地推理 | @huggingface/transformers（ONNX）                                                         |
| 即時通訊 | Socket.IO                                                                                 |
| 影像處理 | Sharp                                                                                     |
| 容器化   | Docker                                                                                    |

```bash
git clone <您的 XOi 倉庫位址>
cd <repo>
yarn install
yarn dev       # 後端開發環境，埠 10588
yarn lint      # 型別檢查
```

---

## 💌 聯絡我們

- 🌐 官網：https://xoi.net
- 📧 信箱：contact@xoi.net

---

## 📜 許可證

XOi 為**專有（閉源）商業軟體**。未經 XOi 書面授權，禁止複製、散佈、反編譯或二次散佈。第三方開源依賴遵循各自許可證，詳見 `NOTICES.txt`。

完整協議詳見 [LICENSE](../LICENSE) 檔案。

---

##### © 2026 XOi. All rights reserved.
