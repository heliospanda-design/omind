# Omind v5.4 — AI 开发用产品需求文档（AI-Coding-Ready PRD）

> **文档版本**：v5.4（鉴权隔离 + V4 手感自由桌面 + 同心星轨 Obsidian 星图组织 + 8 步全功能聚光灯引导合并版）
> **最后更新**：2026-11-26
> **目标读者**：AI Coding Agents（Cursor / Claude Code / Antigravity 等）与全栈工程师
> **代码演进基线**：基于现有 [`omind-demo-v4/`](./omind-demo-v4/) 与 [`omind-demo-v5/`](./omind-demo-v5/)（Cloudflare Workers + SQLite Durable Objects + 原生前端画布）持续演进至 `v5.4`
>
> **修订记录（v5.0 $\rightarrow$ v5.1 $\rightarrow$ v5.2 $\rightarrow$ v5.3 $\rightarrow$ v5.4）**
>
> | 版本 | 日期 | 修订内容 |
> | :--- | :--- | :--- |
> | **v5.4** | 2026-11-26 | **升级「🕸 星图组织」为方案 2 + 3 深度融合版（Obsidian 发光星点星云 × 三层向心引力同心星轨）**：① 点击自由桌面二级栏「🕸 星图组织」，杂乱便签经 60fps 四力物理引擎丝滑收拢为按连接度数缩放的发光星球圆点 + 单行标题胶囊，并按连接权重自动落入 `✦ 中心引力核`、`◎ 内环强关联轨`、`◌ 外环灵感星云`（附带 `🪐 同心星轨 | 🔮 自由星云` 轻量切换）；② 自动提取中文主题词与语义共现织出 **强/弱双层语义脉络**（三色弹性实虚线 + 灰蓝隐式语义虚丝，彻底消除孤岛）；③ **3 遍硬碰撞分离（AABB Box Solver）** 确保任意卡片数量下 100% 零重叠；④ **纯净一阶邻域聚光（Ego-Network Focus）**：悬停星点时无关星点柔和退暗并浮现完整便签预览卡（支持直接投票/连线/召唤），点击星点固定钉住并可一键「回到桌面编辑 ↗」或关闭星图无损还原自由坐标。 |
> | **v5.3** | 2026-11-26 | ① **自由桌面回归并超越 V4 手感**：移除右侧占屏大虚线框与画布重复大标题，支持双击空白画布原地建便签直接打字（`contenteditable`）、双击便签/连线原地改字、5 色和纸胶带便签一键换色、拖拽本地文件上桌，恢复左上角 **Host 实时梳理灵动岛**（悬停结论高亮桌面源便签）与可记忆原位的 **星图引力排布**；<br>② **全页面零重叠布局架构（三栏 Grid 顶栏 + 方案 B 单条合一底坞）**：顶栏重构为 `minmax(0,1fr) auto minmax(0,1fr)` 防撞网格（`<1420px` 自动收拢右侧列表），底部缩放/快捷键气泡合入单条精炼创作坞并自动避让右侧对讲流，连线胶囊默认紧凑态悬停展开，在场光标强制单行并停靠卡片外侧，新建卡片自动碰撞避让；<br>③ **60fps 弹簧物理弹性连线 + 双路召唤 Agent**：胡克定律阻尼回弹、鼠标扫过拨弦与橡皮筋磁吸连线；支持点卡片 `🤖` 或从右上角拖拽角色/队友 PA 上卡召唤，用户与 Agent 列表左端固定明显无圆圈箭头展开回收；<br>④ **8 步全功能聚光灯引导**：支持快捷跳步胶囊与聚光灯下实时无缝切换 `自由桌面 / 整理归类 / 因果脉络` 三大视图，验收矩阵扩展至 `T01`–`T21`。 |
> | **v5.2** | 2026-11-26 | ① **品牌与视觉回归纯净 A 版（Warm Editorial Craft）**：确立 `1A 流光穿环圆桌星轨` 官方 Logo，统一 `#FBF9F5` / `#FAF7F1` 暖白点阵画布与轻盈毛玻璃胶囊，移除重型硬件拟物纹理；<br>② **对话式极简首页（Prompt-First Launchpad）**：去 AI 腔精简文案（`一张白板，把想法聊成方案。`）+ 首访 4 大核心功能微缩卡 + 底部 30 家模拟合作企业与 PM/CTO/CCO 口碑双轨无缝跑马灯；<br>③ **自由桌面新手引导案例 + 聚光灯镂空遮罩引导（Spotlight Mask Tour）**：保留预置互动案例沙盒（`room_starter_v5` / `seedStarterCase`），新增半透明暗化镂空聚焦环与跟随式气泡指引，彻底解决新用户找不到点击位置问题；<br>④ **可爱风 / Emoji 头像与多元模拟昵称池**：扩充 30+ 组自然模拟昵称与柔和马卡龙底色 Emoji 头像体系；<br>⑤ **验收矩阵扩展至 `T01`–`T20`**：全量覆盖 v5.1 鉴权隔离、PA `claimCode` 认领与 v5.2 新手引导沙盒。 |
> | **v5.1** | 2026-11-26 | 补齐身份鉴权与权限隔离（YM UPDATE）。新增 `participantToken`（进房签发）、`shareToken`（分享链接携带）、`claimCode`（PA 会前投递认领）；Schema 增加对应字段（含存量 DO 在线平滑迁移）；API 要求 Bearer 校验并新增 `/pa-briefs/claim`；严格隔离分享只读快照与 RAW 穿透权限。 |
> | **v5.0** | 2026-11-25 | 全新 `1 Room = 1 SQLite DO` 架构、双层 Agent（公共角色团 + BYOA MCP 连接器）与产品基线。 |

---

## 0. AI 开发执行公约（Coding Agent Directives）

在编写任何代码之前，AI 开发代理必须严格遵守以下边界与工程约束：

### 0.1 必须坚守的核心原则
1. **单房物理隔离**：必须彻底废弃 v4 中 `env.OMIND_HUB.idFromName('global-omind-v5')` 的全局单实例模式，升级为 **`1 Room = 1 SQLite Durable Object`**（按 `roomId` 路由），并对存量 DO 实例提供幂等列迁移保障。
2. **双层 Agent 严格解耦**：
   - **公共层（Room Role Agents）** 属于房间，按「思维动作角色 + 业务岗位角色」双维拼装；
   - **个人层（PA, Personal Agent）** 属于参会人，采用**纯连接器模式（BYOA）**——Omind 不内置个人长期记忆养成系统，而是通过标准 **Streamable HTTP MCP Server (`/mcp`)** 接收会前立场包、在会后交付成品与 RAW 上下文。
3. **全链路轻量凭证与权限隔离（v5.1+ 强制约束）**：
   - 保持“免账号密码快速入座”的低阻力体验，但**所有写入、敏感配置与跨端拉取均须携带加密哈希校验的轻量凭证**（`participantToken`、`roomMcpToken`、`claimCode`、`shareToken`）；
   - 严禁仅凭昵称同名顶替已投递的 PA 座席（必须经一次性 `claimCode` 认领绑定），严禁仅凭公开分享链接的 `shareToken` 穿透查询会议原始 RAW 对话与 PA 简报。
4. **防刷屏与成本硬约束**：多角色 Agent 绝不可在每次用户操作时并行发起 N 次大模型调用。必须实现 **3 秒事件防抖 $\rightarrow$ 单次极速小模型 Triage Router $\rightarrow$ 举手懒展开（Lazy Generation）** 两级流水线。
5. **双模运行（无 Key 开箱可测）**：所有 LLM 节点（Triage Router、卡片展开、成品编译）必须具备确定性的 **本地规则降级引擎（`local_fallback`）**，确保无 `LLM_API_KEY` 环境下全部功能与自动化测试 100% 通过。
6. **诚实数据与人类终审权**：AI 产出的结论永远默认为 `draft`，严禁覆盖人类已锁定（`locked`）条目；PA 代言涉及死线承诺或红线事项时，必须强制挂起为 `pending_human_signoff` 待本人确认卡。

### 0.2 V1 严格不做清单（Strict Non-Goals）
AI 开发代理**严禁自行添加**以下超出 V1 范围的功能：
- ❌ 实时音视频连麦 / WebRTC 语音通话房（仅做“文字 + 按住说语音条”对讲机式半异步流）；
- ❌ 平台内建的“个人 AI 长期记忆养成系统”或复杂个人知识库后台；
- ❌ 跨房间的企业级目录树、多层文件夹、复杂组织架构与重型账号密码注册墙；
- ❌ 跨房间向量记忆库（V1 跨场记忆完全通过「将上一场定稿分享链接 `⌘V` 贴上新桌面变为前序会议参考卡」实现，保持单房无状态极简）。

---

## 1. 产品核心心智模型与术语表（Ubiquitous Language）

Omind 的交互基于**「物理会议室 3 层空间模型」**：

| 层级 | 对应载体 | 职责边界 | 数据生命周期 |
| :--- | :--- | :--- | :--- |
| **空气层（Air Stream）** | 右下悬浮对讲流（文字 + 按住发语音条） | 零门槛瞬时表达，支持悬停卡片按住 `Space` 发起**空间锚定语音**；普通闲聊留在流里不污染白板 | 追加写入 `messages` 与 `room_event_log` |
| **焦点层（Shared Desk）** | 85% 留白呼吸感共享白板 | 全员共同注视的视觉焦点：便签、拍立得截图、链接卡、前序会议卡、语义虚线、边缘灵感区；支持 `自由桌面 / 整理归类 / 因果脉络` 3 视图 | 实时同步至 `canvas_artifacts`、`artifact_links`、`consensus_items` |
| **交付与 RAW 层（Outcome & RAW）** | 定稿成品页 + `/mcp` 标准服务端 | 收敛时按人类骨架编译**完整业务成品文档**（PRD / 决策备忘录 / 排期表等），同时封存全量不可变 **RAW 会议上下文** 供持房间/成员凭证的下游 Agent 按需穿透检索 | 冻结写入 `deliverable_snapshots` + 只读 `room_event_log` |

### 关键领域实体定义
- **Room Preset（开局预设局）**：开房时的 3 套开箱模板（`brainstorm_breakthrough`、`decision_review`、`schedule_align`），预置对应的公共角色组合与默认收敛交付模板。
- **Public Role Agent（公共角色 Agent）**：驻场辅助开会的 AI 搭档，分为两维：
  - `cognitive`（思维动作角色）：`host`（控场与记录）、`linker`（逻辑串联与冲突识别）、`spark`（跳脱破局火花）、`critic`（魔鬼挑刺）；
  - `domain`（业务岗位角色）：`tech_feasibility`（技术可行性）、`cost_risk`（成本与风控）、`target_user`（挑剔目标用户替身）及用户轻量自定义岗位。
- **PA Brief（个人 Agent 立场上下文包）**：参会人会前在其外部工具（Cursor / Claude / 飞书助理等）通过 MCP 携带房间凭证投递进房的结构化上下文包，返回一次性 `claimCode` 供本人进房认领，绑定于房间顶栏的**座席胶囊（Seat Capsule）**。
- **Hand Raise（举手微气泡）**：跳脱者或岗位角色在多人局不直接刷屏或强行占桌面，而是先在头像旁挂出 `≤ 20 字` 悬念钩子；真人点击才触发懒加载展开上墙。
- **Spotlight Mask Tour（聚光灯镂空引导）**：面向首次访问用户的 8 步全功能半透明遮罩聚焦引导层（覆盖自由贴卡、空间语音、双路召唤 Agent、Agent/用户列表折叠与座席红线、弹簧弹性连线合成、三大画布切换与星图组织、因果脉络过期预警与收敛定稿），支持快捷胶囊跳步、聚光灯下跨视图无缝切换与一键代演。

---

## 2. 核心功能规格与精确状态机（Functional Specs）

### FR-00：极简对话式首页、核心能力速览与聚光灯新手案例（v5.2 新增）

1. **Prompt-First 对话式启动首页（Home Launchpad）**：
   - **顶栏**：左侧展示 `1A 流光穿环圆桌星轨` 品牌标志与 `Omind` 字样；右侧提供 `🎯 60 秒新手实操案例` 快捷入口，以及**可爱风 Emoji 头像 + 模拟昵称 + `🎲` 随机换身份胶囊**（内置 30+ 组多元中英昵称与马卡龙色 Emoji 头像池，点击头像可自选最爱的 Emoji 徽章与昵称）。
   - **主视觉文案（去 AI 腔自然表达）**：
     - 主标题（H1）：`一张白板，把想法聊成方案。`
     - 副标题：`语音、截图、链接随手往桌上贴，AI 自动归拢脉络，重要结论你们拍板。`
     - 核心对话输入框占位提示：`按住右侧麦克风说说背景，或者写下今天想讨论的话题…`
     - 输入框内底栏：左侧为 3 枚场景预设胶囊（`💡 脑暴新点子` / `⚖️ 方案二选一` / `📋 对齐排期`），右侧为 `🎙` 语音输入按钮与主行动按钮 `进入桌面 →`（输入话题点击后自动建房并投递首条破冰消息；未填话题可直接开启对应预设空白桌面）。
     - 新手引导副入口：`第一次来？进入预置好的新手案例桌面，跟着聚光灯点 5 下就会用 →`。
2. **首访核心产品功能展示区（4 张可视化微缩卡片）**：
   - 在首屏中部直观呈现 4 大核心差异化机制，点击任一卡片均可直接进入新手实操桌面体验：
     1. **`指着卡片就能说`**：鼠标指着卡片按空格说话，重点自动贴在它旁边；
     2. **`AI 先举手，绝不刷屏`**：挑刺、算成本、想新招的搭档只在右上角亮一句短提示，有意思再点开上墙；
     3. **`人没空，他的 AI 先顶上`**：从 Cursor 或飞书把背景和排期带进房间代答，碰到死线或预算红线自动留给本人签字；
     4. **`散会直接拿走定稿`**：按拍板结论生成 PRD、排期表或纪要，附带 30 秒推演回放与已排除方案避坑记录。
3. **底部双轨无限滚动社会证明栏（Social Proof Dual Marquee）**：
   - **第一轨（向左匀速无缝滚动）**：30 家模拟创新合作企业徽章条（`星澜智造`、`NovaFlow`、`矩石科技`、`Looma AI`、`青禾互娱`、`砚山设计`、`CloudPulse`、`深蓝动力` 等 30 家）；
   - **第二轨（向右匀速无缝滚动，悬停暂停）**：来自合作企业 CTO、PM、CCO、设计合伙人的真实场景化口碑卡片（配可爱风 Emoji 头像与职务标签）。
4. **自由桌面预置新手案例 + 5 步聚光灯镂空遮罩引导（Spotlight Mask Tour）**：
   - 支持创建每名访客隔离的专属引导沙盒（`seedStarterCase: true`）及共享演示局（`room_starter_v5`），预置拍立得线框草图、痛点与新方案便签、PA 实验核实卡、三色语义虚线及待展开的 Spark 举手微气泡，并提供顶栏 `↺ 重置案例` 与 `🎯 引导` 随时重播按钮；
   - **半透明聚光灯遮罩机制**：采用全屏暖黑半透明遮罩（`rgba(22, 20, 18, 0.50)`）配合圆角高光镂空视窗与脉冲聚焦环，依次精准框选真实 DOM 目标：① 拍立得草图卡（空间语音） $\rightarrow$ ② 紫色推导连线胶囊（一键合成结论） $\rightarrow$ ③ 右上角 AI 举手微气泡（点将展开） $\rightarrow$ ④ 顶栏队友 AI 座席胶囊（查看数据与签字边界） $\rightarrow$ ⑤ 右上角 `✨ 收敛定稿` 按钮（生成文档与 30 秒回放）。支持真人直接点击镂空区内的真实控件完成交互，或点击气泡上的 `⚡ 帮我演示` 自动完成本步。

---

### FR-01：3 套开局预设局、15 秒冷启动与前序链接继承

#### 1. 3 套默认预设局配置表
创建房间（`POST /api/rooms`）时必须选择 `presetId`（默认 `decision_review`），系统自动初始化该房间的公共角色集与默认交付模板，并同时为发起人签发 `participantToken` 与房间级 `mcpToken`：

| `presetId` | 展示名 | 首页快捷标签 | 默认启用的思维角色 | 默认推荐可选岗位角色 | 默认交付成品模板 (`defaultTemplateId`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `brainstorm_breakthrough` | 💡 破局脑暴局 | 💡 脑暴新点子 | `host`, `spark`, `linker` | `target_user` | `creative_brief`（创意方案大纲） |
| `decision_review` | ⚖️ 方案拍板局 | ⚖️ 方案二选一 | `host`, `linker`, `critic` | `tech_feasibility`, `cost_risk` | `prd_or_decision_memo`（PRD / 决策备忘录） |
| `schedule_align` | 📋 排期对齐局 | 📋 对齐排期 | `host`, `linker`, `critic` | `tech_feasibility` | `task_schedule`（任务排期与依赖表） |

- 房间创建后，任何成员可在顶栏「角色配置浮层」随时勾选开启/关闭任意思维或岗位角色，或添加轻量自定义岗位角色（填写名称、视角描述、关注风险点）。

#### 2. 15 秒冷启动垫脚石（Empty Canvas Onboarding）
- **触发条件**：当房间 `canvas_artifacts` 数量为 `0` 且 `messages` 为 `0` 时，画布中央显示轻盈引导卡片：
  - 主文案：`按住 [Space] 说两句今天想解决什么，或直接 ⌘V 粘贴文档链接 / 竞品截图 / 上一场分享链接`
  - 辅助动作按钮：`🎙 说背景`、`📋 粘贴内容`、`🔌 复制本房 MCP 投递指令`
- **自动破冰**：一旦收到首条语音/文字背景或首个链接/截图，引导卡淡出，Host 在 3 秒内自动拆解生成 2–3 张初始锚点卡（`category: 'context'`）铺开在白板中央，并唤醒对应预设角色进入工作态。

#### 3. 极简跨场继承（粘贴带凭证的前序分享链接）
- **触发条件**：用户在画布任意空白处按 `⌘V` 粘贴符合 `https?://[^/]+/\?share=([a-zA-Z0-9_-]+)&t=([a-zA-Z0-9_-]+)`（或已授权房间内的分享链接）格式的 Omind 定稿分享链接。
- **行为规则**：
  1. 前端识别为内部 Omind 分享链接，提取 `shareId` 与 `shareToken`，调用 `POST /api/rooms/:roomId/artifacts/import-share`；
  2. 后端校验源快照的 `shareToken` 合法后，读取该 `shareId` 的定稿摘要、已锁定结论清单与已排除分支，在桌面生成一张特殊样式卡片：`type = 'prior_room_card'`（带「前序会议参考卡」角标、原房间标题、可展开查看锁定结论列表）；
  3. 该卡内容自动注入 Triage Router 的房间基线上下文；若本场讨论与前序卡片中的已锁定结论冲突，`linker` 必须自动拉出一条橙色冲突虚线（`kind: 'conflict'`）提醒全员。

---

### FR-02：对讲机式半异步对话流与空间锚定语音（Point-and-Talk）

1. **输入模态**：
   - **文字消息**：在右下角悬浮流输入框发送；支持 `@角色名`（如 `@spark`、`@tech_feasibility`、`@host`）或 `@某成员` 定向触发。
   - **普通语音条**：按住或点击麦克风按钮说话，客户端通过 Web Speech API（`zh-CN`，无浏览器支持时降级为模拟流式转写）实时转写，松手后生成带发言人身份、时长与原文文本的语音条消息。
   - **空间锚定语音（Point-and-Talk）**：
     - 当鼠标悬停在白板某张卡片上，或已框选 `1..N` 张卡片时，按下并按住 **`Space` 键**（输入框未聚焦状态下）即触发空间语音录制；
     - 界面在被锚定卡片上方显示轻量声波徽章（`🎙 正在针对「卡片标题」发言…`）；
     - 松开 `Space` 后，调用 `POST /api/rooms/:roomId/messages` 并附带 `anchorArtifactIds: string[]`；
     - 语音条落入对话流，并带可点击的锚定卡片角标；同时在 Triage Router 中将该锚定卡片标记为 **最高优先级上下文**，精准执行合并、修订、质疑或拍板动作。
2. **「流进桌出」漏斗规则**：
   - 对话流中的寒暄、过程确认等低信噪比消息**绝不自动变成白板便签**；
   - 仅两种路径将对话内容送上白板：① 人类悬停任意消息点击 **`📌 贴上桌`**；② Triage Router 判定某发言包含核心事实、关键分歧或待办时，由 `Host` 提炼为精炼卡片上墙并绑定 `sourceMessageId` 溯源锚点。

---

### FR-03：呼吸感白板、3 视图与微动效规范

沿用纯净 **Option A（Warm Editorial Craft）** 暖白编辑室美学：
1. **3 个平级顶栏视图**：
   - **`自由桌面`（默认）**：85% 留白暖白点阵画布（`#FBF9F5`），支持便签、截图拍立得、链接预览卡、前序会议卡、PA 回执卡的自由拖拽、`⌘V` 粘贴与 `星图防叠`（防重叠力导引排版）。画布右侧保留柔和暖金虚线界定的**「边缘灵感区（Spark Zone）」**，承接单人局自动生成的跳脱点子或展开后的挑刺卡，不侵占主讨论区。
   - **`整理归类`（Cluster View）**：一键将散落卡片平滑归拢至四大语义区（`背景与佐证`、`核心方案`、`分歧与边界`、`行动与待签`），每区顶部呈现可一键锁定的共识主卡。
   - **`因果脉络`（Causal Flow View）**：展示所有共识与行动项的有向依赖图，清晰呈现上游修改引发的下游 `stale_upstream` 琥珀色脉冲预警与 Diff 修订提案。
2. **三色语义虚线与线上胶囊动作**：
   - `🟢 support`（资料佐证）；
   - `🟣 derive`（互补推导 — 线上胶囊支持 **`✨ 合成结论`**）；
   - `🟠 conflict`（观点碰撞 — 线上胶囊支持 **`🅰/🅱 投票`**、**`✨ 并行推演利弊`**、**`❓ 转待决`**）。
3. **静默微光标动效（Spatial Micro-Cursor）**：
   - 当 `Host` 或 `Linker` 执行静默白板操作（建卡、连线、归类）时，SSE 推送 `agent.cursor_flash` 事件；
   - 前端渲染对应角色专属色微光标，用 `800ms` 贝塞尔轨迹滑过目标元素完成绘制后柔和淡出（受顶栏 `他人光标` 开关控制，不弹任何 Toast 干扰）。

---

### FR-04：单人/多人自适应调速 & 公共 Agent 举手状态机

#### 1. 房间活跃人类密度调速（Auto-Pacing Rule）
服务端动态计算过去 5 分钟内在房间有过操作（发言/贴卡/拖拽/投票）或保持在线 SSE 的真人人数 `activeHumanCount`：
- **单人起盘模式（`activeHumanCount <= 1`）**：
  - 房间定位为「1 人导演 + 多角色智囊团」；
  - `spark`（跳脱者）、`critic`（挑刺者）与已启用的 `domain` 岗位角色采用 **`auto_drop_spark_zone` 模式**：有高价值洞见时，直接将精简卡片贴入白板右侧「边缘灵感区」，同时更新统计角标，保证 1 个人也能快速撞出多维火花。
- **多人真会议模式（`activeHumanCount >= 2`）**：
  - 房间定位为「真人协作为主 + Agent 静默补位」；
  - `host` 与 `linker` 继续在白板**静默作业**（抽提关键点上墙、拉语义虚线、标出与前序结论的冲突）；
  - `spark`、`critic` 与所有 `domain` 角色强制切换为 **`hand_raise_only` 模式**：绝不擅自贴大卡片或发聊天刷屏，只能通过举手状态机亮灯提示。

#### 2. 举手懒加载状态机（Hand-Raise State Machine）
```text
[idle]
  │  Triage Router 判定有高价值盲点/破局点（且距该角色上次举手 ≥ 60s，单角色全场未展开举手 ≤ 5 次）
  ▼
[raised_teaser]  ← 仅生成 ≤ 20 字钩子文本（不调用高阶模型生成全文，省 80% Token！）
  │                UI：角色头像亮微光 + 浮现极简气泡「💡 跳脱者：如果砍掉账号注册呢？」
  ├── 人类点击气泡 / @该角色 ──► [expanding] ──► 调用高阶模型生成完整卡片贴入边缘灵感区 ──► [expanded]
  ├── 人类点「×」忽略 ─────────► [dismissed]
  └── 30 秒无人点击 ───────────► [folded]（静默收进顶栏角色气泡角标，随时可回看点开，不打扰主视觉）
```

---

### FR-05：PA 纯连接器闭环、认领鉴权与 Host 协同控麦（含 v5.1 升级）

#### 1. 会前投递与进房认领（PA Brief Submission & Claim Flow）
- 用户点击顶栏「🔌 MCP 接入」按钮，可一键复制本房专属配置片段（包含 `roomId`、`roomMcpToken` 及 4 个标准 MCP 工具说明）；
- 外部 PA 先调 `omind_get_room_topic`，在本地生成脱敏简报经用户确认后，携带 `roomToken` 调用 `omind_submit_pa_brief` 写入房间：
  - 若使用房间级 `roomMcpToken` 投递，服务端创建待认领座席（`seatStatus: "pending_claim"`）并返回一次性 **`claimCode`**（24 小时有效，数据库仅存 SHA-256 `claim_code_hash`）；
  - 本人随后用浏览器免注册入座（获取 7 天有效的个人 `participantToken`），在座席抽屉输入或自动携带 `claimCode` 调用 `POST /api/rooms/:roomId/pa-briefs/claim`，服务端校验通过后将该 PA 立场包及名下待签项正式绑定至本人 `participantId`，并立即作废 `claimCode`，杜绝他人同名冒领；
  - 若调用 `omind_submit_pa_brief` 时直接传入本人已持有的 `participantToken`，则直接完成绑定（`seatStatus: "claimed"`）。

#### 2. PA 两种参与模式与约束
投递时用户指定 `mode`（并仅限持有匹配 `participantToken` 的本人在房间顶栏座席胶囊里切换）：

| `mode` | 名称 | 房间内行为规则 |
| :--- | :--- | :--- |
| `context_only` | **仅提供上下文** | PA 绝不主动发言也不举手；仅当 `Host` 梳理分歧/核对事实或他人 `@该成员` 时，Host 从其 `pa_briefs` 中提取已授权事实并在白板引用（带溯源虚线指向该成员座席头像）。 |
| `proxy_tiered` | **分级授权代发言（与 Host 后台通气）** | ① **后台通气控麦**：PA 不自己在公屏抢话刷屏，所有响应经 Triage Router 与 Host 协调，仅在被 `@` 或讨论命中其负责领域时，由 Host 统一转述或点名 PA 输出一条 `≤ 80 字` 精简代答卡（标注 `🤖 XX 的 PA 代言`）；<br>② **分级授权边界**：`allowedAutoTopics`（如公开进度、常规技术倾向、空闲时段）可直接代答生效；<br>③ **红线硬拦截**：一旦触及 `redlineTopics`（默认必含：排期死线变更、预算报价承诺、核心目标拍板、敏感凭据），**禁止代拍板**，系统自动在白板该议题下及该成员座席下挂出一张琥珀色 **`pending_human_signoff`（待本人签字卡）**，仅持有匹配 `participantToken` 的本人可点击「确认生效」或「修改驳回」。 |

#### 3. 顶栏座席胶囊（Seat Capsule UI）
- 房间顶栏展示所有真人与已投递 PA 的成员可爱风 Emoji 头像：
  - 在线真人：绿点 + Emoji 圆章头像；
  - 已投递 PA：头像旁挂微徽章（`📎` 仅上下文 / `🤖` 分级代答；未认领时标注 `待认领` 并提供一键认领入口）；
  - 每次 Host 引用某成员 PA 资料时，SSE 推送 `pa.referenced` 事件，触发该头像 1.2 秒翡翠微光脉冲。

---

### FR-06：人类拍板锁定、Token 权属校验与因果过期传导

1. **三态共识条目（`consensus_items.status`）**：
   - `draft`（虚线框）：AI（Host / 角色 Agent / PA）提炼的草案，尚未拍板；
   - `locked`（实线框 + 锁图标 + `lockedBy` / `lockedAt`）：真人点击「确认拍板」或直接行内编辑保存后锁定；**任何 AI 严禁直接覆写或删除 `locked` 条目**，有新异议只能在下方挂 `revision_proposals` 修订提案；
   - `stale_upstream`（琥珀色高亮）：当上游 `locked` 共识被人类修改或推翻，遍历 `depends_on_ids` 有向图，所有下游关联条目自动置为 `stale_upstream`，并由 Host 自动生成 Diff 修订提案供人类一键采纳或忽略。
2. **Bearer Token 权属强校验（v5.1+）**：
   - 调用 `POST /api/rooms/:roomId/consensus/:id/signoff` 时，服务端必须校验请求头 `Authorization: Bearer <participantToken>` 解析出的 `participantId` 与 `owner_participant_id` 完全一致；未携带凭证返回 `401`，非本人凭证返回 `403`。

---

### FR-07：收敛编译业务成品 + `shareToken` 权限隔离 + 30 秒过程回放

1. **成品模板选择（覆盖 3 套预设局及全场景）**：
   点击右上角 **`✨ 收敛定稿`**，弹窗支持切换 5 套结构化成品模板（默认选中当前预设局的 `defaultTemplateId`）：
   - `creative_brief`（创意方案大纲：核心洞察、入选破局方向、关键灵感池、下一步验证实验）
   - `prd_or_decision_memo`（PRD / 决策备忘录：背景目标、已拍板核心决策与原话锚点、待决分歧与待签项、行动项清单）
   - `task_schedule`（任务排期与依赖表：里程碑、负责人、截止时间、上下游依赖链路、已识别风险）
   - `client_minutes`（客户共创纪要：共识边界、客户反馈原话、双方交付分工）
   - `custom_outline`（自定义段落大纲）
2. **Granola 式「人类骨架优先」编译铁律**：
   - **一级硬骨架（100% 必保留）**：所有 `status = 'locked'` 的共识条目 + 投票胜出卡片 + 人类点赞数 `>= 2` 或手动置顶的白板卡片；
   - **二级血肉（AI 补全衔接）**：引用的 PA 上下文事实、语义佐证卡片（`support` 连线）、原话溯源引用标记 `[#E12]`；
   - **强制附录（供下游 Agent 避坑）**：自动生成 `## 附：已排除方案与核心争论边界` 章节，汇总所有被否决的 `conflict` 分支卡片与 `is_rejected = 1` 卡片。
3. **`shareToken` 只读隔离封存与分享页（`/?share=:shareId&t=:shareToken`）**：
   - 定稿瞬间生成不可变快照与专属 `shareToken`（数据库存 `share_token_hash`），返回带 `?share=:shareId&t=:shareToken` 的分享链接；
   - 外部访客凭 `shareToken` 访问 `GET /api/shares/:shareId` 与 `/replay` 时，**仅可读取编译后的业务成品与裁剪后的回放关键帧摘要**，接口严禁返回原始 `messages`、`pa_briefs` 或 `roomMcpToken`；且凭 `shareToken` 调用 `/mcp` 的 `omind_query_room_raw` 必须被拒绝（`401/403`），严格保障会中原始讨论隐私。

---

## 3. 数据库 Schema 设计（1-Room-1-DO SQLite DDL · v5.2）

每个房间独享一个 Cloudflare SQLite Durable Object（本地 Node 模式复用同一套 DDL）。对于存量已创建的 DO 实例，`initRoomSchema(db)` 必须同时内置幂等的 `ALTER TABLE ... ADD COLUMN` 自动升级逻辑。

```sql
-- 1. 房间元数据（单 DO 仅存 1 条记录）
CREATE TABLE IF NOT EXISTS room_meta (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic_summary TEXT NOT NULL DEFAULT '',
  preset_id TEXT NOT NULL CHECK(preset_id IN ('brainstorm_breakthrough', 'decision_review', 'schedule_align')),
  default_template_id TEXT NOT NULL DEFAULT 'prd_or_decision_memo',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'finalized')),
  pacing_mode TEXT NOT NULL DEFAULT 'solo' CHECK(pacing_mode IN ('solo', 'multiplayer')),
  mcp_access_token_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finalized_at TEXT
);

-- 2. 参会成员（免注册昵称 + 可爱风 Emoji 头像 + Bearer 凭证哈希）
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '协作者',
  is_online INTEGER NOT NULL DEFAULT 1,
  last_active_at TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_expires_at TEXT NOT NULL
);

-- 3. 公共房间角色 Agent 配置（思维角色 + 业务岗位双维拼装）
CREATE TABLE IF NOT EXISTS room_roles (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL CHECK(dimension IN ('cognitive', 'domain')),
  role_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  badge_emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  behavior_mode TEXT NOT NULL CHECK(behavior_mode IN ('silent_board', 'hand_raise_or_spark')),
  system_instruction TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  hand_raise_count INTEGER NOT NULL DEFAULT 0,
  last_acted_at TEXT
);

-- 4. 个人 Agent（PA）会前投递立场上下文包（含一次性 claimCode 认领机制）
CREATE TABLE IF NOT EXISTS pa_briefs (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE,
  source_client TEXT NOT NULL DEFAULT 'mcp_external',
  mode TEXT NOT NULL DEFAULT 'context_only' CHECK(mode IN ('context_only', 'proxy_tiered')),
  summary_markdown TEXT NOT NULL,
  facts_json TEXT NOT NULL DEFAULT '[]',
  stances_json TEXT NOT NULL DEFAULT '[]',
  allowed_auto_topics_json TEXT NOT NULL DEFAULT '[]',
  redline_topics_json TEXT NOT NULL DEFAULT '["排期死线变更","预算报价承诺","核心目标拍板","敏感凭据"]',
  reference_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  claim_code_hash TEXT,
  claim_expires_at TEXT,
  claimed_at TEXT,
  claimed_participant_id TEXT,
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- 5. 对话流（空气层：文字 + 按住说语音条 + 空间锚定语音）
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('human', 'public_role', 'pa_proxy')),
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  input_modality TEXT NOT NULL DEFAULT 'text' CHECK(input_modality IN ('text', 'voice_ptt', 'spatial_voice')),
  content TEXT NOT NULL,
  voice_duration_ms INTEGER,
  anchor_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  mentions_json TEXT NOT NULL DEFAULT '[]',
  promoted_artifact_id TEXT,
  created_at TEXT NOT NULL
);

-- 6. 白板元素（焦点层）
CREATE TABLE IF NOT EXISTS canvas_artifacts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('sticky', 'image', 'link', 'prior_room_card', 'spark_card', 'pa_quote_card', 'signoff_card')),
  zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main', 'spark_zone', 'cluster_context', 'cluster_solution', 'cluster_conflict', 'cluster_action')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK(author_type IN ('human', 'public_role', 'pa_proxy')),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#FEF9C3',
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL DEFAULT 240,
  votes_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_ref_json TEXT NOT NULL DEFAULT 'null',
  is_rejected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. 语义连线（三色虚线）
CREATE TABLE IF NOT EXISTS artifact_links (
  id TEXT PRIMARY KEY,
  from_artifact_id TEXT NOT NULL,
  to_artifact_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('support', 'derive', 'conflict')),
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  vote_a_users_json TEXT NOT NULL DEFAULT '[]',
  vote_b_users_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_artifact_id) REFERENCES canvas_artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (to_artifact_id) REFERENCES canvas_artifacts(id) ON DELETE CASCADE
);

-- 8. 举手懒加载记录表
CREATE TABLE IF NOT EXISTS hand_raises (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL,
  teaser TEXT NOT NULL,
  trigger_context_json TEXT NOT NULL,
  target_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'raised_teaser' CHECK(status IN ('raised_teaser', 'expanding', 'expanded', 'dismissed', 'folded')),
  expanded_artifact_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- 9. 结构化共识与行动项（拍板锁定 + 上下游过期传导 + PA 红线待签）
CREATE TABLE IF NOT EXISTS consensus_items (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL CHECK(section IN ('context', 'decision', 'open_question', 'action_item')),
  content TEXT NOT NULL,
  owner_participant_id TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'locked', 'stale_upstream')),
  signoff_status TEXT NOT NULL DEFAULT 'none' CHECK(signoff_status IN ('none', 'pending_human_signoff', 'signed', 'rejected')),
  locked_by TEXT,
  locked_at TEXT,
  depends_on_ids_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 10. 锁定项修订提案
CREATE TABLE IF NOT EXISTS revision_proposals (
  id TEXT PRIMARY KEY,
  target_item_id TEXT NOT NULL,
  original_content TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (target_item_id) REFERENCES consensus_items(id) ON DELETE CASCADE
);

-- 11. 追加写事件流（支撑 RAW 穿透检索 + 30 秒倍速回放）
CREATE TABLE IF NOT EXISTS room_event_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 12. 定稿交付快照（不可变成品 + shareToken 哈希隔离）
CREATE TABLE IF NOT EXISTS deliverable_snapshots (
  id TEXT PRIMARY KEY,            -- shareId
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  compiled_markdown TEXT NOT NULL,
  structured_json TEXT NOT NULL,
  raw_event_end_seq INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  share_token_hash TEXT NOT NULL
);
```

---

## 4. 全量 API、SSE 与 MCP Server 协议契约

### 4.1 REST API 契约

| 分类 | 方法与路径 | 请求体 / 鉴权字段 | 响应与副作用 |
| :--- | :--- | :--- | :--- |
| **房间生命周期** | `POST /api/rooms` | `{ title, presetId, creatorName, creatorAvatar?, seedStarterCase? }` | 生成 `roomId`、`mcpToken` 与发起人 `participantToken`（7 天有效），初始化对应 DO 并返回全量状态 |
| | `GET /api/rooms/:roomId` | `?participantId=...` | 返回房间当前态（脱敏，不含他人私有 token） |
| | `POST /api/rooms/:roomId/join` | `{ name, roleTitle, avatar?, color? }` | 免注册昵称入座，签发 7 天有效 `participantToken`，返回 `{ participantId, participantToken, participant }` 并重算 `pacing_mode` |
| | `POST /api/rooms/:roomId/reset-starter` | `{ creatorName?, creatorAvatar? }` | 一键重置新手引导沙盒至初始 5 步教学状态 |
| **角色配置** | `PATCH /api/rooms/:roomId/roles/:roleKey` | `{ enabled, systemInstruction? }` | 开启/关闭或微调公共角色，记录事件流并广播 SSE |
| | `POST /api/rooms/:roomId/roles` | `{ displayName, dimension, badgeEmoji, systemInstruction }` | 添加自定义业务岗位角色 |
| **对话与空间语音** | `POST /api/rooms/:roomId/messages` | `{ senderId, content, inputModality, voiceDurationMs?, anchorArtifactIds?, mentions? }` | 写入 `messages` + `room_event_log`，推送 SSE，触发 **3 秒防抖 Triage Router** |
| **白板与连线** | `POST /api/rooms/:roomId/artifacts` | `{ type, title, content, x, y, color?, metadata?, sourceMessageId? }` | 创建白板卡（首条创建自动解除冷启动态并触发破冰拆解） |
| | `POST /api/rooms/:roomId/artifacts/import-share` | `{ shareUrl, shareId?, shareToken?, x, y, authorId }` | 校验前序分享链接 `shareToken` 后解析生成 `prior_room_card`，注入房间上下文 |
| | `PATCH /api/rooms/:roomId/artifacts/:id` | `{ x?, y?, content?, zone?, isRejected?, voteEmoji? }` | 移动/编辑/点赞/标为排除分支，写事件流并广播 |
| | `POST /api/rooms/:roomId/links` | `{ fromId, toId, kind, reason }` | 创建语义虚线，支持 `/vote`、`/synthesize`、`/parallel-eval` |
| **举手懒加载** | `POST /api/rooms/:roomId/hand-raises/:id/expand` | `{ actorId }` | 将状态置 `expanding`，生成完整卡片贴入 `spark_zone`，广播 SSE |
| | `POST /api/rooms/:roomId/hand-raises/:id/dismiss` | `{ actorId }` | 标记为 `dismissed` |
| **PA 座席与认领** | `POST /api/rooms/:roomId/pa-briefs/claim` | `Authorization: Bearer <participantToken>` + `{ claimCode }` | 校验一次性 `claimCode` 未过期后，将待认领 PA 立场包及关联待签项绑定至当前 `participantId` 并作废 `claimCode` |
| | `PATCH /api/rooms/:roomId/pa-briefs/:participantId` | `Authorization: Bearer <participantToken>` + `{ mode, allowedAutoTopics?, redlineTopics? }` | 强校验 Token 匹配 `:participantId` 本人，否则返回 `401/403` |
| | `POST /api/rooms/:roomId/consensus/:id/signoff` | `Authorization: Bearer <participantToken>` + `{ decision: 'signed'|'rejected', editedContent? }` | 强校验 Token 对应 `participantId === owner_participant_id`，否则返回 `403` |
| **拍板与收敛** | `POST /api/rooms/:roomId/consensus/:id/lock` | `{ actorId, content? }` | 锁定条目；若修改已锁条目则递归将下游置 `stale_upstream` 并生成修订提案 |
| | `POST /api/rooms/:roomId/finalize` | `{ templateId, actorId, customOutline? }` | 按「人类骨架优先」编译成品写入 `deliverable_snapshots`，生成 `shareToken`，返回 `?share=:shareId&t=:shareToken` 链接 |
| **分享与回放** | `GET /api/shares/:shareId` | `?t=<shareToken>` 或 `X-Share-Token` / `Bearer` | 校验 `shareToken` 有效后，仅返回定稿快照与元数据（严禁暴露原始聊天、PA 简报或 MCP 房间密钥） |
| | `GET /api/shares/:shareId/replay` | `?t=<shareToken>` 或 `X-Share-Token` / `Bearer` | 校验 `shareToken` 有效后，返回裁剪后的关键帧摘要数组驱动 30 秒倍速回放 |

### 4.2 SSE 实时同步协议（`GET /api/rooms/:roomId/events`）
支持标准 `Last-Event-ID`（对应 `room_event_log.seq`）断线补发，核心事件枚举：
- `room.pacing_changed`、`message.created`、`artifact.upserted`、`artifact.deleted`、`link.upserted`
- `agent.cursor_flash`（驱动前端 800ms 贝塞尔微光标）
- `agent.hand_raised` / `agent.hand_updated`
- `pa.brief_updated` / `pa.referenced`
- `consensus.updated` / `proposal.created` / `room.finalized` / `room.reset`

### 4.3 标准 Streamable HTTP MCP Server 契约（`POST /mcp`）

Worker 暴露符合 [MCP 2025-03-26 Streamable HTTP 规范] 的 JSON-RPC 2.0 端点，支持 `Authorization: Bearer <roomMcpToken | participantToken>` 或参数内携带凭证，暴露 **4 个核心 Tool**：
1. **`omind_get_room_topic`**：入参 `{ roomUrl, roomToken? }`，校验房间/成员凭证后返回 `{ roomId, title, presetId, topicSummary, activeRoles, existingArtifactHeadlines, openQuestions }`。
2. **`omind_submit_pa_brief`**：入参 `{ roomUrl, roomToken, participantName, sourceClient?, mode?, summaryMarkdown, facts?, stances?, allowedAutoTopics?, redlineTopics? }`（必填 `roomUrl`, `participantName`, `summaryMarkdown`, `roomToken`），返回 `{ ok: true, briefId, participantId, claimCode, claimExpiresAt, seatStatus: "pending_claim" | "claimed", appliedMode, redlineGuardActive: true }`。
3. **`omind_pull_deliverable`**：入参 `{ roomOrShareUrl, token, ownerFilter? }`（`token` 必须为 `participantToken` 或 `roomMcpToken`），返回成品 Markdown、锁定结论、个人行动项与避坑附录。
4. **`omind_query_room_raw`**：入参 `{ roomOrShareUrl, token, query, topK? }`（`token` 必须为 `participantToken` 或 `roomMcpToken`；**严禁接受 `shareToken`**，持 `shareToken` 调用必返 `-32001` 鉴权拒绝），返回精准召回的原始语音、便签、连线争议与 PA 片段。

---

## 5. 两级多角色编排引擎规范（`src/orchestrator.mjs`）

1. **事件防抖聚合器（Debounce Aggregator）**：默认 `3000ms` 聚合窗口；显式 `@角色`、空间锚定语音或空房首条破冰缩短至 `400ms` 快通。
2. **Stage 1：极速小模型 Triage Router + 服务端硬护栏（Guardrail Middleware）**：
   - `multiplayer` 模式单次最多放行 `1` 个 `handRaiseCandidate`（`confidence >= 0.72`、单角色 `60s` 冷却、未展开上限 `5` 个）；
   - `solo` 模式自动将高价值火花落入右侧 `spark_zone`；
   - 命中 `redline_topics_json` 关键词时服务端强制覆写为 `create_redline_signoff`（`pending_human_signoff`）；
   - 严禁覆写 `locked` 共识项，违者自动转为 `revision_proposals`。
3. **Stage 2：按需懒展开 & 成品编译**：仅在人类点开举手气泡、点击冲突连线「并行推演利弊」或点击「✨ 收敛定稿」时触发高阶生成。

---

## 6. 前端界面、品牌与视觉规范（v5.2 定版）

1. **品牌标志（Logo `1A`）**：采用「流光穿环圆桌星轨（Classic Spatial Weave）」矢量标志——靛蓝圆角底块上，流光渐变星轨从纯白圆桌环后方绕至前方形成立体穿插，缀以暖金（真人）与薄荷绿（PA 搭档）双星节点。
2. **纯净 Option A 视觉体系（Warm Editorial Craft）**：
   - 画布底色：`#FBF9F5` / `#FAF7F1` 暖白亚麻点阵桌面，保持 85% 呼吸留白；
   - 悬浮胶囊：`rgba(255, 255, 255, 0.88)` 柔光毛玻璃 + 极细暖灰描边 + 柔和弥散阴影，摒弃厚重 3D 机械键帽与金属孔洞装饰；
   - 成员头像：全站采用**柔和马卡龙底色 + 可爱风 Emoji 徽章**（`🦊`、`🐼`、`🦦`、`🐰`、`🐱`、`🐨`、`🦉`、`🦄` 等），支持一键骰子随机切换 30+ 组真实感模拟昵称。
3. **HUD 零重叠与聚光灯引导**：
   - 左上（Logo 返回首页 `/` + 房间切换 + `🎯 引导` + `↺ 重置案例` + 调速状态）、中上（三视图切换 + 星图防叠/他人光标）、右上第一排（成员与 PA 座席胶囊 + `✨ 收敛定稿`）、右上第二排（公共角色徽章 + 举手微气泡 + `🔌 MCP 接入`）；
   - 聚光灯引导层（`#spotlightHole` + `#spotlightPopover`）自适应窗口缩放与画布平移，支持直接点按高光区或一键演示。
4. **前端页面与 URL 路由严格一一对应规范（SPA Router Contract）**：
   - `/`：**纯粹独立的产品首页（Home Launchpad）**，严禁后台偷偷加载默认房间或将地址栏改写为 `?room=...`，刷新 `/` 永远保持在首页；
   - `/starter`（兼容 `/?starter=1`）：**新手引导案例桌面**，进入预置互动案例并自动开启 5 步聚光灯镂空引导；
   - `/new`（兼容 `/?new=1`）：**新建圆桌模板页**（3 套预设场景选择与最近桌面列表）；
   - `/room/:roomId`（向下兼容 `/?room=:roomId`）：**协作白板房间页**，仅在此路由下挂载白板 HUD 与 SSE 实时流；点击左上角 `Omind` 标志通过 `pushState` 回到 `/`；
   - `/share/:shareId?t=:shareToken`（向下兼容 `/?share=:shareId&t=:shareToken`）：**定稿成品与 30 秒回放页**，独立渲染只读文档与关键帧回放，不预载无关房间。

---

## 7. 必过自动化验收矩阵（`npm test` T01 ~ T20 必须 100% 绿灯）

| 用例 ID | 验收场景 | 核心断言 |
| :--- | :--- | :--- |
| `T01` | 1-Room-1-DO 物理隔离 | 并发创建 Room A 与 Room B，互相读写零串数据、事件序号各自从 1 递增 |
| `T02` | 3 套预设局初始化 | 分别用 3 个 `presetId` 建房，验证 `room_roles`、`default_template_id` 与 `creatorParticipantToken` 签发 |
| `T03` | 15 秒冷启动自动破冰 | 空房收到首条语音/链接后，自动生成 ≥2 张初始锚点卡并解除空态 |
| `T04` | 空间锚定语音绑定 | 带 `anchorArtifactIds` 提交语音条，验证消息保存锚点且 Triage Router 针对该卡输出动作 |
| `T05` | 单人局自动落火花区 | `activeHumanCount = 1` 时触发新观点，`spark` 自动在 `spark_zone` 生成卡片 |
| `T06` | 多人局防刷屏举手约束 | `activeHumanCount = 3` 时，`spark`/`critic` 仅生成 `≤20 字` 举手气泡且单次 ≤1 个、冷却 60s 内不重复举手 |
| `T07` | 举手懒展开与 30s 折叠 | 点击举手气泡后状态经 `expanding -> expanded` 落卡；未点击超 30s 自动转为 `folded` |
| `T08` | MCP 会前读议题与投递 PA | 携带 `roomToken` 调 `omind_get_room_topic` 与 `omind_submit_pa_brief`，返回 `claimCode` 且落库 `pending_claim` |
| `T09` | PA 仅上下文模式静默引用 | `mode = 'context_only'` 时 PA 不公屏发言，仅由 Host 触发 `pa.referenced` 引用事实 |
| `T10` | PA 分级代答与红线硬拦截 | `mode = 'proxy_tiered'` 下常规进度由 Host 协同转述；触及排期死线/预算红线时强制生成 `pending_human_signoff` 待签卡 |
| `T11` | 待签卡 Bearer Token 专属权属 | 未带 Token 返回 `401`，非本人 `participantToken` 返回 `403`；仅本人认领绑定后的 `participantToken` 可签字转为 `signed` |
| `T12` | 人类锁定防覆写与过期传导 | 修改已锁定上游决策后，下游行动项自动标 `stale_upstream` 并挂载 `revision_proposals`，AI 严禁直接修改锁定项 |
| `T13` | 成品编译「人类骨架 + 避坑附录」 | 标记一张冲突卡 `is_rejected = 1` 并锁定核心共识后定稿，验证成品含一级锁定骨架、避坑附录并签发 `shareToken` |
| `T14` | MCP 散会拉取成品与 RAW 穿透 | 持 `participantToken` / `roomMcpToken` 调 `omind_pull_deliverable` 与 `omind_query_room_raw` 精准召回原始争议片段 |
| `T15` | 贴带凭证前序链接跨场继承 | 新房调用 `import-share` 导入带 `shareToken` 的上一场链接，生成 `prior_room_card`，讨论冲突时自动拉橙色预警线 |
| `T16` | 30 秒过程回放关键帧完整 | 携带有效 `shareToken` 调 `GET /api/shares/:shareId/replay`，按 `seq` 递增返回完整时间轴 |
| `T17` | 新手引导案例沙盒与重置 | 验证 `seedStarterCase: true`、可爱风 Emoji 头像池、拍立得草图、三色连线与 `POST /reset-starter` 一键重置 |
| `T18` | PA `claimCode` 认领与防冒领 | 验证同名访客无 `claimCode` 入座无法篡改他人 PA（`403`）；真本人持 `claimCode` 调 `/pa-briefs/claim` 成功后绑定并作废 `claimCode` |
| `T19` | `shareToken` 校验与防越权 | 访问 `/api/shares/:shareId` 无 `shareToken` 或错误 token 返 `401/403`；正确 `shareToken` 返回成品且响应体绝不含原始 `messages` / `paBriefs` |
| `T20` | 分享凭证与 RAW 严格隔离 | 持公开 `shareToken` 尝试调用 `/mcp` 的 `omind_query_room_raw` 或 `omind_pull_deliverable`，必须返回 `-32001` 拒绝访问 |
