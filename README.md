# Omind v5.4 — 一张白板，把想法聊成方案

> **在线体验 Demo**：[https://kokowork.top](https://kokowork.top)
> **架构栈**：Cloudflare Workers · `1 Room = 1 SQLite Durable Object` · `OMIND_SHARES` KV · Streamable HTTP MCP Server (`/mcp`) · 零构建原生 ES Modules 画布引擎

Omind 是一个面向产品、设计与研发团队的**半异步圆桌共创桌面**——语音、截图、链接随手往桌上贴，多角色思维搭档与个人外部 AI（BYOA MCP）辅助归拢脉络，重要结论由人类拍板锁定并一键生成带 30 秒过程回放的定稿文档。

---

## ✨ v5.4 核心特性

1. **对话式极简启动台（Prompt-First Launchpad）**
   - 免注册一键分配可爱风 Emoji 头像与昵称入座；支持一句话/语音开桌、3 套高频预设圆桌局，以及 **8 步半透明聚光灯镂空遮罩实操引导**。
2. **手作质感自由桌面 × 三大无缝同源视图（快捷键 `1 / 2 / 3`）**
   - **自由桌面**：双击空白原地建便签打字（`contenteditable`）、双击卡片/连线原地改字、5 色和纸胶带换色、悬停卡片长按 `Space` 空间锚定语音、`⌘V` 秒贴截图或继承上一场定稿链接。
   - **🕸 星图组织（方案 2 + 3 融合：同心引力星轨 × Obsidian 发光星点）**：一键将杂乱便签经 60fps 物理引擎收拢至「✦ 中心引力核 · ◎ 内环强关联轨 · ◌ 外环灵感星云」（支持 `🪐 同心星轨 | 🔮 自由星云` 切换），自动提取语义织出隐式弱关联虚丝，3 遍 AABB 硬碰撞分离确保 **100% 零重叠**；支持悬停一阶邻域聚光、原卡浮窗预览与点击钉住跳回桌面编辑。
   - **整理归类 & 因果脉络**：四象限自动归位、人类 `🔒` 拍板防 AI 覆写、上游结论变更自动标黄下游（`stale_upstream`）并生成 Diff 修订提案。
3. **60fps 胡克定律弹簧物理连线**
   - `🟢 佐证 / 🟣 推导 / 🟠 碰撞` 三色弹性虚线跟随拖拽惯性回弹、鼠标扫过如拨琴弦，线上胶囊支持一键合成结论、A/B 投票与并行推演。
4. **双层 Agent 协作与全链路轻量凭证隔离**
   - **公共角色团**：可拖拽角色胶囊到单张卡片评估或在对讲流 `@召唤`；单人局自动落火花卡，多人局自动切为 `≤20 字` 举手微气泡防刷屏。
   - **个人连接器 PA（`POST /mcp`）**：支持 Cursor / Claude Code 等外部 Agent 会前投递立场包（一次性 `claimCode` 认领防冒领），触及排期/预算红线强制挂起为本人专属签字卡（非本人签字 `403` 拦截）。
   - **交付与 RAW 严格隔离**：公开分享链接仅凭 `shareToken` 查看脱敏成品文档与 30 秒关键帧回放，严禁穿透拉取会中原始对话。

---

## 📂 目录结构与产品规范文档

```text
├── docs/
│   ├── Omind_AI开发用产品需求文档（PRD）.md      # v5.4 完整 AI-Coding-Ready PRD（含 T01~T21 验收矩阵）
│   └── Omind_新版架构与产品规范文档.md           # v5.4 架构与交互规范总览
├── public/                                      # 前端原生 ES Modules 画布与聚光灯引导
├── src/                                         # 核心房间引擎、分诊路由、MCP Server 与本地 Node 适配层
├── worker/index.mjs                             # Cloudflare Worker & SQLite Durable Object 入口
├── tests/omind.test.mjs                         # T01 ~ T21 全链路自动化验收测试套件
└── wrangler.jsonc                               # Cloudflare Workers 部署配置
```

---

## 🚀 本地快速启动（零外部依赖 / 零 API Key 开箱即跑）

> 环境要求：**Node.js >= 22.5.0**（使用内置 `node:sqlite` 驱动本地模拟 Durable Object SQLite 存储）

```bash
# 1. 运行全部 T01 ~ T21 自动化验收测试
npm test

# 2. 启动本地开发服务器（默认监听 http://127.0.0.1:3500）
npm start

# 3. 如需部署到自己的 Cloudflare Workers 账号
npx wrangler deploy
```
