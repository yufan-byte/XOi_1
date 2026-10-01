# XOi Docker 部署指南

镜像自包含：前端静态站、后端 API、WebSocket、AI 技能包全部打进一个容器，
**单容器单端口 10588 对外服务**。数据通过命名卷 `xoi-data` 持久化。

## 一、构建并启动（三步）

```bash
# 1. 准备配置（改一下管理员密码）
cp .env.docker.example .env
vi .env   # 至少把 XOI_ADMIN_PASSWORD 改掉

# 2. 构建镜像 + 启动容器（后台运行）
docker compose up -d --build

# 3. 查看日志确认就绪
docker compose logs -f xoi
```

日志出现 `[服务启动成功]: http://localhost:10588` 即可访问：
浏览器打开 **`http://服务器IP:10588`** ，用上面设置的管理员账密登录。

> 首次启动会自动建库、生成 tokenKey、写入管理员账号，约 2~5 秒完成。

## 二、数据持久化说明

所有运行数据都在卷 `xoi-data` → `/app/backend/data` 下：

| 路径 | 内容 | 是否随升级保留 |
|------|------|----------------|
| `db2.sqlite` | 主数据库 | ✅ 保留 |
| `oss/` | 用户生成的图片/视频资源 | ✅ 保留 |
| `canvases/` | 无限画布创作数据 | ✅ 保留 |
| `serve/app.js`、`web/`、`skills/` 等 | 程序与内置资产 | 🔄 自动随新版本刷新 |

入口脚本 [`docker-entrypoint.sh`](docker-entrypoint.sh) 在每次启动时只同步“代码侧”资产，
绝不会动你的数据库和用户上传文件——所以重建容器既安全又能拿到最新程序代码。

## 三、用 Nginx 反代到域名（推荐生产做法）

宝塔面板新建站点绑定域名后，“网站设置 → 反向代理”或直接写伪静态：

```nginx
location / {
    proxy_pass http://127.0.0.1:10588;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # WebSocket 支持(AI 对话 / 生产 Agent 实时流必须)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    client_max_body_size 200m;   # 图片视频上传上限
    proxy_read_timeout 300s;     # AI 推理可能较慢,放宽读超时
}
```

配好后 `.env` 里仍保持 `PORT=10588`(或任意未被占用的宿主端口)即可,Nginx 转发到它.
若想直接让容器占 80 口省一层代理: 把 `.env` 改成 `PORT=80`,但建议留 Nginx 层便于上 HTTPS.

## 四、常用运维命令

```bash
docker compose ps                 # 查看状态
docker compose restart            # 重启
docker compose down               # 停止并删除容器(数据卷保留)
docker compose up -d --build      # 改完代码重新构建上线
docker volume ls | grep xoi       # 数据卷名一般为 <项目目录>_xoi-data 或 xoi_xoi-data
```

## 五、备份与迁移

```bash
# 备份整个数据卷（含数据库+OSS+画布）
docker run --rm -v $(docker volume ls -q | grep xoi-data):/data \
  -v "$PWD":/backup alpine tar czf /backup/xoi-backup.tar.gz -C /data .

# 还原到一台新机器（先确保已有同名空卷或新建项目跑过一次）
docker run --rm -v $(docker volume ls -q | grep xoi-data):/data \
  -v "$PWD":/backup alpine sh -c "cd /data && tar xzf /backup/xoi-backup.tar.gz"
```

## 六、宝塔可视化部署（可选）

若装了「Docker管理器」插件：

1. 用 SSH 执行一次 `docker compose build` 本地出好镜像 `xoi:v1`
2. 插件里「创建容器」→ 选择现有镜像 `xoi:v1`
3. 映射端口 `10588→自定义`;挂载卷填 `xoi-data:/app/backend/data`
4. 启动后再按第三节加 Nginx 反代即可.

命令行方式(`docker compose`)更简单可靠,推荐优先采用.

## 七、已知注意点

- **embedding 向量检索**(RAG 类增强)依赖 onnxruntime-node 运行时库；
  默认未预装以减小体积。若用到相关 Agent 报错缺该模块,
  可临时进容器补装:`docker exec -it xoi yarn add onnxruntime-node && docker compose restart`.
  核心 AI 生图生文对话不受影响.
- 后端监听端口固定为 **10588**,不可通过环境变量更改(源码硬编码);
  要换对外端口请改 compose 的左端映射或走 Nginx 反代.
