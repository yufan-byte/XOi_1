<div align="center">

# 🎬 XOi · AI Short Drama Factory

**An all-in-one AI short-drama production engine: from novel to finished video, fully automated.**

A complete closed-loop workflow around "Planning → Screenwriting → Storyboarding → Production," supporting localized, programmable, and iteratively sustainable production with 10x+ efficiency.

</div>

---

## 🌐 Multi-language Support

| Language              |
| --------------------- |
| Chinese (Simplified)  |
| Chinese (Traditional) |
| English               |
| Thai                  |
| Vietnamese            |
| Japanese              |
| Russian               |

---

## 🌟 Key Features

- ✅ **Infinite Canvas Production Workbench** — organize scripts, characters, storyboards, assets, and video nodes on an infinite canvas with free arrangement, backtracking, and parallel production.
- ✅ **Three-Layer Agent Collaboration** — decision, execution, and supervision layers work together to cover task decomposition, content generation, quality review, and revision feedback.
- ✅ **Persistent Agent Memory** — a cross-session memory system based on local ONNX vector retrieval supporting short-term messages, long-term summaries, and semantic recall.
- ✅ **Programmable Vendor System** — write vendor TypeScript logic directly in the settings center and apply it instantly without restarting.
- ✅ **Chapter Event Graph Adaptation** — automatically extracts and structures chapter events from the source novel for precise context-driven adaptation.
- ✅ **Skill File Configuration** — core prompts of ScriptAgent and ProductionAgent are externalized as Markdown Skill files for online editing and rapid tuning.

---

## 🚀 Quick Start

1. Start the service and log in (default: `admin` / `admin123`).
2. Configure model vendors (text / image / video) in the settings center.
3. Create a project, import the source novel, and extract chapter events.
4. Use ScriptAgent to generate the story skeleton, adaptation strategy, and structured script.
5. Switch to ProductionAgent to organize storyboards, assets, and video nodes on the infinite canvas.
6. Refine storyboard images as nodes, then assemble and export the final video.

> ⚠️ **First login** — account: `admin`, password: `admin123`. In production, change the default password via the `XOI_ADMIN_PASSWORD` environment variable.

---

## 🚀 Installation

### Prerequisites

- ✅ LLM API endpoint
- ✅ Video generation API endpoint
- ✅ Image generation API endpoint

### Local Run

```bash
yarn install
yarn dev        # dev mode, port 10588
yarn build      # build for production
yarn start      # run production build
```

### Docker

```shell
docker build -t xoi .
docker run -d -p <local-port>:10588 -v <data-path>:/app/data xoi
```

### Environment Variables

| Variable            | Description                                        |
| ------------------- | -------------------------------------------------- |
| `NODE_ENV`          | Runtime environment, `prod` for production         |
| `PORT`              | Service port (default 10588)                       |
| `OSSURL`            | Static asset access URL                            |
| `XOI_ADMIN_USERNAME`| Admin username (first init only, default admin)    |
| `XOI_ADMIN_PASSWORD`| Admin password (first init only, default admin123) |

### Cloud Server Deployment

```bash
# 1. Install Node.js / Yarn / PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
npm install -g yarn pm2

# 2. Deploy
cd /opt
git clone <your-xoi-repo>
cd <repo>
yarn install
yarn build
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
pm2 start pm2.json
pm2 startup
pm2 save
```

---

## 🔧 Development

### Tech Stack

| Category    | Technology                                                                             |
| ----------- | -------------------------------------------------------------------------------------- |
| Runtime     | Node.js 23.11.1+                                                                       |
| Language    | TypeScript 5.x                                                                         |
| Backend     | Express 5                                                                              |
| Database    | SQLite (better-sqlite3 / knex)                                                         |
| AI          | Vercel AI SDK (OpenAI / Anthropic / Google / DeepSeek / Zhipu / MiniMax / Qwen / xAI)  |
| Local AI    | @huggingface/transformers (ONNX)                                                       |
| Realtime    | Socket.IO                                                                              |
| Image       | Sharp                                                                                  |
| Container   | Docker                                                                                 |

```bash
git clone <your-xoi-repo>
cd <repo>
yarn install
yarn dev       # backend dev server, port 10588
yarn lint      # type check
```

---

## 💌 Contact

- 🌐 Website: https://xoi.net
- 📧 Email: contact@xoi.net

---

## 📜 License

XOi is **proprietary (closed-source) commercial software**. No copying, distribution, reverse engineering, or redistribution is permitted without XOi's written authorization. Third-party open-source dependencies remain under their own licenses; see `NOTICES.txt`.

Full terms: see [LICENSE](../LICENSE).

---

##### © 2026 XOi. All rights reserved.
