/**
 * Omind v5.3 — Home 1 (Prompt-First Launchpad + Copy ③ + Core Features + 30-Co Marquee)
 *              & 8-Step Full-Capability Translucent Spotlight Cutout Mask Onboarding (`#spotlightHole` + `#spotlightPopover`)
 */

import { api } from './api.js';
import {
  CUTE_EMOJI_POOL,
  EXEC_QUOTES,
  PARTNER_COMPANIES,
  SIMULATED_PERSONAS,
  escapeHtml,
  getCurrentParticipant,
  getLocalRecentRooms,
  saveRoomParticipantChoice,
  showToast,
  state,
} from './state.js';
import { voiceController } from './voice.js';

export const SPOTLIGHT_STEPS = [
  {
    idx: 0,
    short: '1 自由贴卡',
    badge: '1 / 8 · 丝滑自由桌面',
    title: '双击空白原地建便签，双击文字直接改',
    desc: '不用弹窗填表！双击桌面任意空白处直接长出和纸胶带便签原地打字；支持 5 色圆点换色、拖拽图片上桌，按 ⌘V 粘贴上场分享链接秒变「前序会议参考卡」。',
    tip: '✨ 左上角「Host 实时梳理灵动岛」悬停任意结论可自动高亮桌面关联源卡片。',
    assistLabel: '⚡ 原地新建便签',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () => document.getElementById('creationDock'),
    preferSide: 'top',
  },
  {
    idx: 1,
    short: '2 指着说',
    badge: '2 / 8 · 空间锚定语音',
    title: '鼠标指着卡片，长按 Space 直接说',
    desc: '不用打长字解释说的是哪张图——鼠标悬停聚光灯里的卡片按住空格说话，重点自动生成衍生卡并用弹性虚线连在旁边。',
    tip: '🎙 悬停任意桌面卡片 + 长按 Space 键即可触发空间语音批注。',
    assistLabel: '⚡ 模拟空间语音',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () =>
      document.getElementById('card-art_guide_sketch') ||
      document.querySelector('.desk-card.type-image') ||
      document.querySelector('.desk-card'),
    preferSide: 'right',
  },
  {
    idx: 2,
    short: '3 召唤Agent',
    badge: '3 / 8 · 双路召唤 Agent',
    title: '点卡片「🤖」/ 拖拽角色上卡，或在对讲流 @召唤',
    desc: '两种顺手召唤方式：① 直接点任意卡片右上角「🤖」（或把右上角角色/队友PA胶囊拖到卡片上松手）针对单卡评估；② 在右下对讲流输入 @spark / @tech_feasibility 点名提问并一键 📌 贴上桌！',
    tip: '🤖 右下角对讲流支持点「−」收起成迷你胶囊，不遮挡自由桌面。',
    assistLabel: '⚡ 针对卡片召唤Agent',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () => {
      const panel = document.getElementById('airStreamPanel');
      if (panel && !panel.classList.contains('hidden')) return panel;
      return document.getElementById('airStreamCollapsedBtn');
    },
    preferSide: 'left',
  },
  {
    idx: 3,
    short: '4 Agent列表',
    badge: '4 / 8 · Agent 列表收放与举手防刷屏',
    title: '左端箭头一键收放 Agent 列表，多人局先举手不刷屏',
    desc: '点列表左端箭头可随时收拢或展开在席 Agent 搭档；点「⚙ 角色」自由拼装“思维角色 + 业务岗位视角”。多人讨论时 AI 只挂 ≤20 字举手微气泡，点展开才落桌！',
    tip: '👥 系统自动识别「单人智囊 / 多人静默」双速节拍，绝不在讨论群刷屏抢话。',
    assistLabel: '⚡ 展开举手或收放列表',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () => document.getElementById('hudTopRightRow2'),
    preferSide: 'bottom-left',
  },
  {
    idx: 4,
    short: '5 用户座席',
    badge: '5 / 8 · 用户列表收放、座席红线与 MCP',
    title: '人没空 AI 代同步，碰排期/预算红线必留本人签字',
    desc: '参会成员条同样支持左端箭头折叠（收起仍保留待签字提醒角标）。点「🔌 MCP 接入」可从 Cursor/Claude 投递立场包；一旦触及改死线或预算红线，强制挂起等本人签字！',
    tip: '🛑 非本人点击签字会被服务端 403 严格拦截，确保 AI 绝不越权承诺。',
    assistLabel: '⚡ 打开座席与MCP详情',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () => document.getElementById('hudTopRightRow1'),
    preferSide: 'bottom-left',
  },
  {
    idx: 5,
    short: '6 弹性连线',
    badge: '6 / 8 · 弹簧物理弹性连线与合成',
    title: '三色弹性虚线跟随回弹，线上直接合成结论',
    desc: '拖拽便签或鼠标扫过虚线都能感受到弹簧阻尼回弹；双击线上胶囊可直接改原因，点「✨ 合成结论」或「🅰/🅱 投票」一键把关联观点收拢成正式结论。',
    tip: '🔗 绿线=客观佐证 · 紫线=互补推导 · 橙线=观点分歧碰撞。',
    assistLabel: '⚡ 拨动连线并合成结论',
    nextLabel: '下一步 →',
    requiredView: 'freeform',
    findTarget: () =>
      document.querySelector('.link-capsule.kind-derive') ||
      document.querySelector('.link-capsule') ||
      document.getElementById('card-art_guide_plan'),
    preferSide: 'bottom',
  },
  {
    idx: 6,
    short: '7 画布切换',
    badge: '7 / 8 · 三大画布实时切换 + 星轨星图组织',
    title: '自由桌面 ↔ 整理归类 ↔ 因果脉络（数字键 1/2/3）',
    desc: '现在已为你实时切到「整理归类」视图：散落卡片自动按【背景 / 方案 / 分歧 / 行动】四象限归位！在自由桌面开启「🕸 星图组织」更可将杂乱便签一键收拢为同心星轨 Obsidian 发光星点（0 重叠），悬停看原卡、关闭恢复原位。',
    tip: '⌨️ 按键盘 1 / 2 / 3 可毫秒级无缝切换三大同源视图。',
    assistLabel: '⚡ 切回自由桌面试星图',
    nextLabel: '下一步 →',
    requiredView: 'cluster',
    findTarget: () => document.getElementById('hudTopCenter'),
    preferSide: 'bottom',
  },
  {
    idx: 7,
    short: '8 脉络&定稿',
    badge: '8 / 8 · 因果脉络预警 + 收敛定稿回放',
    title: '锁定拍板防篡改、上游变更标黄预警，散会一键出定稿',
    desc: '在「因果脉络」视图中，🔒 人类拍板结论 AI 不可覆写，上游改动会自动触发下游标黄预警与修订提案；最后点右上角「✨ 收敛定稿」，一键生成 PRD/排期表 + 30 秒过程回放！',
    tip: '🎬 定稿附带“已排除方案”避坑附录与安全只读凭证，也可通过 MCP 拉回 Cursor 写代码。',
    assistLabel: '⚡ 打开收敛定稿',
    nextLabel: '完成引导 ✓',
    requiredView: 'causal',
    findTarget: () => document.getElementById('finalizeBtn'),
    preferSide: 'bottom-left',
  },
];

let personaCursor = Math.floor(Math.random() * SIMULATED_PERSONAS.length);
let customGuestName = SIMULATED_PERSONAS[personaCursor].name;
let customGuestAvatar = SIMULATED_PERSONAS[personaCursor].avatar;
let customGuestBg = SIMULATED_PERSONAS[personaCursor].bg;
let customGuestColor = SIMULATED_PERSONAS[personaCursor].color;
let customGuestRole = SIMULATED_PERSONAS[personaCursor].role;
let selectedHomePreset = 'brainstorm_breakthrough';
let pickerOpen = false;
let homeVoiceRecording = false;

let callbacks = {
  onNavigateHome: null,
  onNavigateNew: null,
  onEnterRoomId: null,
  onOpenBlankLauncher: null,
  onOpenFinalizeModal: null,
  onOpenSeatInspector: null,
  onCreateQuickSticky: null,
  onSummonCardAgent: null,
  onPluckLinks: null,
  onToggleStarLayout: null,
  onRefreshUi: null,
};

export function initOnboardingSystem(hooks = {}) {
  callbacks = { ...callbacks, ...hooks };

  document.getElementById('startTourBtn')?.addEventListener('click', () => {
    startOnboardingQuest(0);
  });

  document.getElementById('openWelcomeBtn')?.addEventListener('click', () => {
    stopOnboardingQuest();
    if (callbacks.onNavigateHome) {
      callbacks.onNavigateHome();
    } else {
      openWelcomeStudioOverlay();
    }
  });

  window.addEventListener('resize', () => {
    if (state.tourActive) {
      positionSpotlightElements();
    }
  });
}

export function launchConfetti() {
  const layer = document.getElementById('confettiLayer');
  if (!layer) return;
  const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];
  for (let i = 0; i < 40; i += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${8 + Math.random() * 84}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
    piece.style.transform = `rotate(${Math.round(Math.random() * 180)}deg)`;
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 2400);
  }
}

/**
 * Home 1: Prompt-First Conversational Launchpad + Copy ③ + Core Capabilities + 30-Co & Exec Marquee
 */
export function openWelcomeStudioOverlay() {
  const overlay = document.getElementById('welcomeStudioOverlay');
  if (!overlay) return;

  const buildMarqueeCompaniesHtml = () =>
    [...PARTNER_COMPANIES, ...PARTNER_COMPANIES]
      .map((name, idx) => {
        const dotColor =
          idx % 3 === 0 ? '#818CF8' : idx % 3 === 1 ? '#34D399' : '#FBBF24';
        return `
          <span class="company-pill">
            <span class="company-dot" style="background:${dotColor};"></span>
            <span>${escapeHtml(name)}</span>
          </span>
        `;
      })
      .join('');

  const buildMarqueeQuotesHtml = () =>
    [...EXEC_QUOTES, ...EXEC_QUOTES]
      .map(
        (q) => `
          <div class="quote-card">
            <p class="quote-text">“${escapeHtml(q.text)}”</p>
            <div class="quote-meta">
              <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#1C1917;">
                <span class="cute-emoji-badge" style="width:22px;height:22px;font-size:12.5px;background:${escapeHtml(q.bg)};">${escapeHtml(q.avatar)}</span>
                ${escapeHtml(q.name)}
              </span>
              <span>${escapeHtml(q.role)}</span>
            </div>
          </div>
        `
      )
      .join('');

  const renderHome = (preservedPrompt = '') => {
    const lastRoom = getLocalRecentRooms().find((r) => r?.roomId && r.roomId !== 'room_starter_v5');
    overlay.innerHTML = `
      <!-- Top Header -->
      <header class="home-nav">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="/logo.svg" alt="Omind" style="width:32px;height:32px;" />
          <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#1C1917;">Omind</span>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${
            lastRoom
              ? `<button id="homeRecentRoomBtn" type="button" class="hud-btn" style="color:#57534E;font-size:12px;" data-recent-rid="${escapeHtml(lastRoom.roomId)}" title="继续上次的桌面：${escapeHtml(lastRoom.title || lastRoom.roomId)}">
                  继续上次桌面 →
                 </button>`
              : ''
          }
          <button id="homeTopStarterBtn" type="button" class="ceramic-pill" style="padding:6px 14px;font-size:12px;font-weight:600;color:#4F46E5;cursor:pointer;">
            🎯 新手实操案例 (8步全功能)
          </button>

          <div class="guest-identity-wrap">
            <div class="ceramic-pill guest-pill">
              <button
                id="homeOpenAvatarPickerBtn"
                type="button"
                style="border:none;background:transparent;padding:0;display:inline-flex;align-items:center;gap:6px;cursor:pointer;"
                title="点击自定义可爱头像与昵称"
              >
                <span class="cute-emoji-badge" style="background:${escapeHtml(customGuestBg)};">${escapeHtml(customGuestAvatar)}</span>
                <span id="homeGuestNameLabel" style="font-size:12.5px;font-weight:600;color:#1C1917;">${escapeHtml(customGuestName)}</span>
              </button>
              <button id="homeDiceBtn" type="button" class="dice-reroll-btn" title="随机换一个可爱头像与昵称">🎲</button>
            </div>

            <div id="homeAvatarPopover" class="emoji-picker-popover ${pickerOpen ? '' : 'hidden'}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:700;color:#1C1917;">选一枚可爱头像与昵称</span>
                <button id="closeEmojiPopoverBtn" type="button" class="icon-circle-btn" style="width:22px;height:22px;font-size:11px;">✕</button>
              </div>
              <input
                id="homeCustomNameInput"
                class="form-input"
                type="text"
                maxlength="24"
                value="${escapeHtml(customGuestName)}"
                placeholder="输入你的昵称…"
              />
              <div class="emoji-grid">
                ${CUTE_EMOJI_POOL.map(
                  (em) => `
                    <button
                      type="button"
                      class="emoji-pick-cell ${em.emoji === customGuestAvatar ? 'selected' : ''}"
                      style="background:${escapeHtml(em.bg)};"
                      data-pick-emoji="${escapeHtml(em.emoji)}"
                      data-pick-bg="${escapeHtml(em.bg)}"
                      data-pick-color="${escapeHtml(em.color)}"
                      title="${escapeHtml(em.label)}"
                    >
                      ${escapeHtml(em.emoji)}
                    </button>
                  `
                ).join('')}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <button id="popRandomPersonaBtn" type="button" class="btn btn-xs btn-subtle">🎲 随机换一组</button>
                <button id="savePersonaBtn" type="button" class="btn btn-xs btn-primary">确定</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Hero (Copywriting ③) + Core Capabilities -->
      <main class="home-main">
        <div class="home-hero-center">
          <h1 class="home-h1">一张白板，把想法聊成方案。</h1>
          <p class="home-subtitle">
            语音、截图、链接随手往桌上贴，AI 自动归拢脉络，重要结论你们拍板。
          </p>

          <!-- Conversational Prompt Shell -->
          <div class="prompt-shell">
            <textarea
              id="homePromptInput"
              rows="2"
              class="prompt-textarea"
              placeholder="按住右侧麦克风说说背景，或者写下今天想讨论的话题…"
            >${escapeHtml(preservedPrompt)}</textarea>

            <div class="prompt-bottom-bar">
              <div class="preset-chip-row">
                <button
                  type="button"
                  class="home-preset-chip ${selectedHomePreset === 'brainstorm_breakthrough' ? 'active' : ''}"
                  data-home-preset="brainstorm_breakthrough"
                >💡 脑暴新点子</button>
                <button
                  type="button"
                  class="home-preset-chip ${selectedHomePreset === 'decision_review' ? 'active' : ''}"
                  data-home-preset="decision_review"
                >⚖️ 方案二选一</button>
                <button
                  type="button"
                  class="home-preset-chip ${selectedHomePreset === 'schedule_align' ? 'active' : ''}"
                  data-home-preset="schedule_align"
                >📋 对齐排期</button>
              </div>

              <div style="display:flex;align-items:center;gap:8px;">
                <button id="homeVoiceBtn" type="button" class="home-mic-btn" title="点击录入背景语音">🎙</button>
                <button id="homeEnterDeskBtn" type="button" class="home-start-btn">进入桌面 →</button>
              </div>
            </div>
          </div>

          <!-- First-Time Guided Starter Case Entry -->
          <div class="home-guided-link-row">
            <span>第一次来？</span>
            <button id="homeGuidedCaseBtn" type="button" class="home-guided-link">
              进入预置好的新手案例桌面，跟着聚光灯 8 步玩转全部核心能力（支持跳步体验） →
            </button>
          </div>
        </div>

        <!-- Core Product Capabilities Showcase -->
        <section class="home-features-section" aria-label="核心产品功能">
          <div class="home-section-label">核心功能 · 点击任一卡片可直接跳入对应聚光灯实操</div>
          <div class="home-features-grid">
            <button type="button" class="home-feature-card" data-feature-step="1">
              <div class="feature-illus" style="background:#FAF6EC;border:1px solid rgba(180,83,9,0.09);justify-content:space-between;">
                <span style="padding:6px 10px;border-radius:8px;background:#fff;border:1px solid #E7E5E4;font-size:11px;font-weight:600;color:#44403C;">🖼 首屏草图</span>
                <span style="padding:4px 10px;border-radius:99px;background:#4F46E5;color:#fff;font-size:10.5px;font-weight:600;">🎙 按空格说</span>
              </div>
              <div class="feature-title">双击建卡 · 指着就能说</div>
              <div class="feature-desc">双击空白原地写便签，鼠标指着卡片按空格说话，重点自动用弹性虚线连在它旁边。</div>
            </button>

            <button type="button" class="home-feature-card" data-feature-step="2">
              <div class="feature-illus" style="background:#FFFBEB;border:1px solid rgba(217,119,6,0.2);">
                <span style="padding:5px 11px;border-radius:99px;background:#fff;border:1px solid #FCD34D;font-size:11px;font-weight:600;color:#92400E;">
                  🤖 拖上卡片 / @spark 召唤 · <strong style="color:#4F46E5;">先举手</strong>
                </span>
              </div>
              <div class="feature-title">双路召唤 Agent · 绝不刷屏</div>
              <div class="feature-desc">支持把角色搭档拖到卡片上评估或对讲流 @点名；多人局 AI 只挂短提示，点开才上桌。</div>
            </button>

            <button type="button" class="home-feature-card" data-feature-step="4">
              <div class="feature-illus" style="background:#F0FDF4;border:1px solid rgba(5,150,105,0.2);flex-direction:column;align-items:flex-start;gap:5px;">
                <span style="font-size:11px;font-weight:600;color:#065F46;">🐨 周予的 AI 同步了联调进度</span>
                <span style="font-size:10px;padding:2px 7px;border-radius:6px;background:#FEF3C7;color:#92400E;font-weight:600;">🛑 改排期已留给本人签字</span>
              </div>
              <div class="feature-title">人没空 AI 顶上 · 红线必签字</div>
              <div class="feature-desc">从 Cursor 或 Claude 把背景带进房间代答，碰到死线或预算红线必须本人签字才生效。</div>
            </button>

            <button type="button" class="home-feature-card" data-feature-step="6">
              <div class="feature-illus" style="background:#EEF2FF;border:1px solid rgba(79,70,229,0.18);flex-direction:column;justify-content:space-between;align-items:stretch;">
                <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:700;color:#4338CA;">
                  <span>🗂 自由 / 归类 / 因果秒切</span>
                  <span>▶ 30s 回放</span>
                </div>
                <div style="height:5px;border-radius:99px;background:#C7D2FE;overflow:hidden;">
                  <div style="width:82%;height:100%;background:#4F46E5;"></div>
                </div>
                <div style="font-size:10px;color:#57534E;">上游变更标黄预警 · 一键出定稿 PRD</div>
              </div>
              <div class="feature-title">三大画布切换 · 散会拿走定稿</div>
              <div class="feature-desc">自由发散、四象限归类、因果脉络一键秒切，散会直接生成带避坑记录与回放的成品文档。</div>
            </button>
          </div>
        </section>
      </main>

      <!-- Bottom Dual-Track Infinite Marquee: 30 Partner Companies + PM/CTO/CCO Praise -->
      <footer class="home-marquee-footer">
        <div style="text-align:center;font-size:11.5px;font-weight:600;color:#A8A29E;letter-spacing:0.04em;">
          已有 30+ 创新产品、设计与研发团队在 Omind 上拍板日常决策
        </div>

        <div class="marquee-mask">
          <div class="marquee-track-companies">${buildMarqueeCompaniesHtml()}</div>
        </div>

        <div class="marquee-mask">
          <div class="marquee-track-quotes">${buildMarqueeQuotesHtml()}</div>
        </div>
      </footer>
    `;

    overlay.querySelector('#homeRecentRoomBtn')?.addEventListener('click', (ev) => {
      const rid = ev.currentTarget.getAttribute('data-recent-rid');
      if (rid) {
        overlay.classList.add('hidden');
        callbacks.onEnterRoomId?.(rid, { pushHistory: true });
      }
    });

    const rollNextPersona = () => {
      personaCursor = (personaCursor + 1) % SIMULATED_PERSONAS.length;
      const p = SIMULATED_PERSONAS[personaCursor];
      customGuestName = p.name;
      customGuestAvatar = p.avatar;
      customGuestBg = p.bg;
      customGuestColor = p.color;
      customGuestRole = p.role;
      const curPrompt = overlay.querySelector('#homePromptInput')?.value || '';
      renderHome(curPrompt);
    };

    overlay.querySelector('#homeDiceBtn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      rollNextPersona();
    });

    overlay.querySelector('#homeOpenAvatarPickerBtn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      pickerOpen = !pickerOpen;
      overlay.querySelector('#homeAvatarPopover')?.classList.toggle('hidden', !pickerOpen);
    });

    overlay.querySelector('#closeEmojiPopoverBtn')?.addEventListener('click', () => {
      pickerOpen = false;
      overlay.querySelector('#homeAvatarPopover')?.classList.add('hidden');
    });

    overlay.querySelector('#popRandomPersonaBtn')?.addEventListener('click', rollNextPersona);

    overlay.querySelectorAll('[data-pick-emoji]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const typedName = overlay.querySelector('#homeCustomNameInput')?.value?.trim();
        if (typedName) customGuestName = typedName;
        customGuestAvatar = cell.getAttribute('data-pick-emoji') || '🦊';
        customGuestBg = cell.getAttribute('data-pick-bg') || '#FFEDD5';
        customGuestColor = cell.getAttribute('data-pick-color') || '#EA580C';
        const curPrompt = overlay.querySelector('#homePromptInput')?.value || '';
        renderHome(curPrompt);
      });
    });

    overlay.querySelector('#savePersonaBtn')?.addEventListener('click', () => {
      const typedName = overlay.querySelector('#homeCustomNameInput')?.value?.trim();
      if (typedName) customGuestName = typedName;
      pickerOpen = false;
      const curPrompt = overlay.querySelector('#homePromptInput')?.value || '';
      renderHome(curPrompt);
    });

    overlay.querySelectorAll('[data-home-preset]').forEach((chip) => {
      chip.addEventListener('click', () => {
        selectedHomePreset = chip.getAttribute('data-home-preset') || 'brainstorm_breakthrough';
        overlay.querySelectorAll('[data-home-preset]').forEach((b) => {
          b.classList.toggle('active', b === chip);
        });
      });
    });

    overlay.querySelector('#homeVoiceBtn')?.addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      const ta = overlay.querySelector('#homePromptInput');
      if (!ta) return;

      if (homeVoiceRecording) {
        homeVoiceRecording = false;
        btn.classList.remove('recording');
        const { text } = voiceController.finish();
        if (text) ta.value = text;
        return;
      }

      homeVoiceRecording = true;
      btn.classList.add('recording');
      showToast('🎙 正在聆听（再点一次结束，无麦克风环境自动填入示例话题）');
      voiceController.start({
        onInterim: (txt) => {
          if (txt) ta.value = txt;
        },
      });
      setTimeout(() => {
        if (homeVoiceRecording && !ta.value.trim()) {
          const sampleByPreset = {
            brainstorm_breakthrough:
              '今天想脑暴新用户首屏怎么改版：目前强制手机号注册流失了 42% 的人，能不能先开放免注册互动桌面？',
            decision_review:
              '今天拍板实时同步方案二选一：继续用轻量 SSE + Last-Event-ID 还是自建 WebSocket 集群？',
            schedule_align:
              '下周三要上线新版本，我们把前端白板、MCP 接口和自动化测试的排期与阻塞项对齐一下。',
          };
          ta.value = sampleByPreset[selectedHomePreset] || sampleByPreset.brainstorm_breakthrough;
          homeVoiceRecording = false;
          btn.classList.remove('recording');
          voiceController.stop();
        }
      }, 1400);
    });

    const launchGuidedStarterDesk = async (initialStep = 0) => {
      pickerOpen = false;
      try {
        const created = await api.createRoom({
          title: '🌟 新手上手案例：首屏免注册体验改版共创',
          presetId: 'brainstorm_breakthrough',
          creatorName: customGuestName,
          creatorAvatar: customGuestAvatar,
          creatorColor: customGuestColor,
          creatorRoleTitle: customGuestRole,
          allowTableSpeak: true,
          seedStarterCase: true,
        });
        if (created.creator?.id) {
          saveRoomParticipantChoice(
            created.roomMeta.id,
            created.creator.id,
            created.participantToken
          );
        }
        overlay.classList.add('hidden');
        await callbacks.onEnterRoomId?.(created.roomMeta.id, { pushHistory: true });
        setTimeout(() => startOnboardingQuest(initialStep), 140);
      } catch (err) {
        showToast(err.message);
      }
    };

    overlay.querySelector('#homeTopStarterBtn')?.addEventListener('click', () => {
      launchGuidedStarterDesk(0);
    });
    overlay.querySelector('#homeGuidedCaseBtn')?.addEventListener('click', () => {
      launchGuidedStarterDesk(0);
    });
    overlay.querySelectorAll('[data-feature-step]').forEach((card) => {
      card.addEventListener('click', () => {
        const stepNum = Number(card.getAttribute('data-feature-step') || 0);
        launchGuidedStarterDesk(stepNum);
      });
    });

    const submitHomeTopicAndEnter = async () => {
      pickerOpen = false;
      const btn = overlay.querySelector('#homeEnterDeskBtn');
      const promptVal = overlay.querySelector('#homePromptInput')?.value?.trim() || '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = '正在准备桌面…';
      }

      try {
        const presetLabelMap = {
          brainstorm_breakthrough: '新点子脑暴讨论',
          decision_review: '方案二选一拍板会',
          schedule_align: '里程碑排期对齐会',
        };
        const derivedTitle = promptVal
          ? promptVal.replace(/[。！？!?\n].*$/, '').slice(0, 28)
          : presetLabelMap[selectedHomePreset] || '新圆桌共创桌面';

        const created = await api.createRoom({
          title: derivedTitle,
          topicSummary: promptVal,
          presetId: selectedHomePreset,
          creatorName: customGuestName,
          creatorAvatar: customGuestAvatar,
          creatorColor: customGuestColor,
          creatorRoleTitle: customGuestRole,
          enableRecommendedDomain: true,
        });

        if (created.creator?.id) {
          saveRoomParticipantChoice(
            created.roomMeta.id,
            created.creator.id,
            created.participantToken
          );
        }

        overlay.classList.add('hidden');
        await callbacks.onEnterRoomId?.(created.roomMeta.id, { pushHistory: true });

        if (promptVal) {
          await api.postMessage(created.roomMeta.id, {
            senderId: created.creator.id,
            inputModality: 'text',
            content: promptVal,
          });
          showToast('✨ 已根据你的话题自动拆出初始卡片铺开桌面！');
        } else {
          showToast(`👋 欢迎入座，${customGuestAvatar} ${customGuestName}！`);
        }
      } catch (err) {
        showToast(err.message);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '进入桌面 →';
        }
      }
    };

    overlay.querySelector('#homeEnterDeskBtn')?.addEventListener('click', submitHomeTopicAndEnter);
    overlay.querySelector('#homePromptInput')?.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        submitHomeTopicAndEnter();
      }
    });
  };

  renderHome();
  overlay.classList.remove('hidden');
}

/**
 * 8-Step Full-Capability Spotlight Cutout Mask Tour (`#spotlightHole` + `#spotlightPopover`)
 */
export function startOnboardingQuest(startIndex = 0) {
  state.tourActive = true;
  state.tourStep = Math.max(0, Math.min(SPOTLIGHT_STEPS.length - 1, Number(startIndex || 0)));
  state.completedSteps = new Set();
  for (let i = 0; i < state.tourStep; i += 1) {
    state.completedSteps.add(i);
  }
  syncStepViewAndRender();
}

export function stopOnboardingQuest() {
  state.tourActive = false;
  document.getElementById('spotlightHole')?.classList.add('hidden');
  document.getElementById('spotlightPopover')?.classList.add('hidden');
  document.getElementById('hostProactiveCard')?.classList.add('hidden');
}

function syncStepViewAndRender() {
  if (!state.tourActive) return;
  const stepObj = SPOTLIGHT_STEPS[state.tourStep] || SPOTLIGHT_STEPS[0];
  if (state.tourStep < 6 && state.starLayoutOn) {
    state.viewMode = stepObj.requiredView || 'freeform';
    callbacks.onToggleStarLayout?.(false);
    return;
  }
  if (stepObj.requiredView && state.viewMode !== stepObj.requiredView) {
    state.viewMode = stepObj.requiredView;
    callbacks.onRefreshUi?.();
    return;
  }
  renderOnboardingQuest();
}

export function notifyQuestProgress(actionKey) {
  if (!state.tourActive) return;

  if (actionKey === 'spatial_voice_sent' && state.tourStep === 1) {
    advanceSpotlightStep();
  } else if (actionKey === 'agent_summoned' && state.tourStep === 2) {
    advanceSpotlightStep();
  } else if (actionKey === 'hand_expanded' && state.tourStep === 3) {
    advanceSpotlightStep();
  } else if (actionKey === 'seat_inspected' && state.tourStep === 4) {
    advanceSpotlightStep();
  } else if (actionKey === 'synthesized_or_locked' && state.tourStep === 5) {
    advanceSpotlightStep();
  } else if (actionKey === 'finalized') {
    finishSpotlightTour();
  }
}

function advanceSpotlightStep() {
  state.completedSteps.add(state.tourStep);
  if (state.tourStep < SPOTLIGHT_STEPS.length - 1) {
    state.tourStep += 1;
    syncStepViewAndRender();
  } else {
    finishSpotlightTour();
  }
}

function finishSpotlightTour() {
  stopOnboardingQuest();
  if (state.viewMode !== 'freeform') {
    state.viewMode = 'freeform';
    callbacks.onRefreshUi?.();
  }
  launchConfetti();
  showToast('🎉 8 步全功能引导完成！点左上角「🎯 引导」可随时重看或跳步复习');
}

export function positionSpotlightElements() {
  const hole = document.getElementById('spotlightHole');
  const pop = document.getElementById('spotlightPopover');
  if (!hole || !pop || !state.tourActive) return;

  const stepObj = SPOTLIGHT_STEPS[state.tourStep] || SPOTLIGHT_STEPS[0];
  const target = stepObj.findTarget?.();
  if (!target) {
    hole.classList.add('hidden');
    pop.style.left = '24px';
    pop.style.top = '86px';
    pop.classList.remove('hidden');
    return;
  }

  const rect = target.getBoundingClientRect();
  const pad = 9;
  const hLeft = Math.round(rect.left - pad);
  const hTop = Math.round(rect.top - pad);
  const hWidth = Math.max(46, Math.round(rect.width + pad * 2));
  const hHeight = Math.max(36, Math.round(rect.height + pad * 2));

  hole.classList.remove('hidden');
  hole.style.left = `${hLeft}px`;
  hole.style.top = `${hTop}px`;
  hole.style.width = `${hWidth}px`;
  hole.style.height = `${hHeight}px`;

  pop.classList.remove('hidden');
  const popW = 384;
  const popH = pop.offsetHeight || 265;

  let pLeft = hLeft;
  let pTop = hTop + hHeight + 16;

  if (stepObj.preferSide === 'right') {
    pLeft = hLeft + hWidth + 18;
    pTop = hTop + 4;
    if (pLeft + popW > window.innerWidth - 16) {
      pLeft = Math.max(16, hLeft - popW - 18);
    }
  } else if (stepObj.preferSide === 'left') {
    pLeft = hLeft - popW - 18;
    pTop = Math.max(68, hTop - 16);
    if (pLeft < 16) {
      pLeft = Math.min(window.innerWidth - popW - 16, hLeft + hWidth + 18);
    }
  } else if (stepObj.preferSide === 'top') {
    pLeft = hLeft + Math.round((hWidth - popW) / 2);
    pTop = hTop - popH - 16;
  } else if (stepObj.preferSide === 'bottom-left') {
    pLeft = hLeft + hWidth - popW;
    pTop = hTop + hHeight + 14;
  } else {
    pLeft = hLeft + Math.round((hWidth - popW) / 2);
    pTop = hTop + hHeight + 16;
  }

  pLeft = Math.max(16, Math.min(window.innerWidth - popW - 16, pLeft));
  if (pTop + popH > window.innerHeight - 16) {
    pTop = Math.max(64, hTop - popH - 16);
  }
  pTop = Math.max(64, pTop);

  pop.style.left = `${pLeft}px`;
  pop.style.top = `${pTop}px`;
}

export function renderOnboardingQuest() {
  const hole = document.getElementById('spotlightHole');
  const pop = document.getElementById('spotlightPopover');
  if (!hole || !pop) return;

  if (!state.tourActive) {
    hole.classList.add('hidden');
    pop.classList.add('hidden');
    return;
  }

  const stepObj = SPOTLIGHT_STEPS[state.tourStep] || SPOTLIGHT_STEPS[0];

  pop.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:11px;font-weight:700;color:#4F46E5;background:#EEF2FF;padding:3px 10px;border-radius:99px;">
        ${escapeHtml(stepObj.badge)}
      </span>
      <button id="spotSkipBtn" type="button" style="border:none;background:transparent;font-size:12px;color:#A8A29E;cursor:pointer;">
        跳过 ✕
      </button>
    </div>

    <div class="spot-jump-row">
      ${SPOTLIGHT_STEPS.map(
        (s) =>
          `<button type="button" class="spot-jump-chip ${s.idx === state.tourStep ? 'active' : state.completedSteps.has(s.idx) ? 'done' : ''}" data-spot-jump="${s.idx}">${escapeHtml(s.short)}</button>`
      ).join('')}
    </div>

    <div style="font-size:14.5px;font-weight:700;color:#1C1917;margin-bottom:5px;">
      ${escapeHtml(stepObj.title)}
    </div>
    <div style="font-size:12.3px;color:#57534E;line-height:1.54;margin-bottom:9px;">
      ${escapeHtml(stepObj.desc)}
    </div>
    ${
      stepObj.tip
        ? `<div class="spot-tip-box">${escapeHtml(stepObj.tip)}</div>`
        : ''
    }

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <button id="spotPrevBtn" type="button" class="btn btn-xs btn-subtle" ${state.tourStep === 0 ? 'disabled style="opacity:0.45;"' : ''}>
        ← 上一步
      </button>

      <div style="display:flex;align-items:center;gap:6px;">
        <button id="spotAssistBtn" type="button" class="btn btn-xs btn-subtle" title="自动演示当前这一步">
          ${escapeHtml(stepObj.assistLabel)}
        </button>
        <button id="spotNextBtn" type="button" class="btn btn-xs btn-primary">
          ${escapeHtml(stepObj.nextLabel)}
        </button>
      </div>
    </div>
  `;

  pop.querySelector('#spotSkipBtn')?.addEventListener('click', stopOnboardingQuest);

  pop.querySelector('#spotPrevBtn')?.addEventListener('click', () => {
    if (state.tourStep > 0) {
      state.tourStep -= 1;
      syncStepViewAndRender();
    }
  });

  pop.querySelector('#spotNextBtn')?.addEventListener('click', () => {
    advanceSpotlightStep();
  });

  pop.querySelectorAll('[data-spot-jump]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.completedSteps.add(state.tourStep);
      state.tourStep = Number(chip.getAttribute('data-spot-jump') || 0);
      syncStepViewAndRender();
    });
  });

  pop.querySelector('#spotAssistBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const me = getCurrentParticipant();

    try {
      if (state.tourStep === 0) {
        await callbacks.onCreateQuickSticky?.({
          x: 155,
          y: 380,
          title: '🗒 原地新建便签',
          content: '双击空白处直接写下新想法，失焦即自动保存并串联脉络！',
          autoFocus: false,
        });
        showToast('🗒 已在自由桌面新建和纸胶带便签（双击可原地改字）！');
      } else if (state.tourStep === 1) {
        const target =
          state.artifacts.find((a) => a.type === 'image') || state.artifacts[0];
        await api.postMessage(state.roomId, {
          senderId: me.id,
          inputModality: 'spatial_voice',
          voiceDurationMs: 3600,
          anchorArtifactIds: target ? [target.id] : [],
          content:
            '针对首屏草图补充一句：访客在桌面体验完点击收敛定稿时，自动生成带分享凭证的链接即可，零注册打扰！',
        });
        showToast('🎙 已针对高光草图卡发起空间语音，AI 正在提炼衍生卡！');
      } else if (state.tourStep === 2) {
        const target =
          state.artifacts.find((a) => a.type === 'sticky') || state.artifacts[0];
        if (target && callbacks.onSummonCardAgent) {
          await callbacks.onSummonCardAgent(target.id, {
            targetType: 'role',
            roleKey: 'tech_feasibility',
          });
        } else {
          await api.postMessage(state.roomId, {
            senderId: me.id,
            inputModality: 'text',
            content: '@spark @tech_feasibility 请评估首屏免登方案的破局点与落地工期',
          });
        }
      } else if (state.tourStep === 3) {
        const openHr = state.handRaises.find((h) => h.status === 'raised_teaser');
        if (openHr) {
          await api.expandHandRaise(state.roomId, openHr.id, me.id);
          showToast('✨ 已将右上角 AI 举手微气泡展开落上自由桌面！');
        } else {
          state.agentsListCollapsed = !state.agentsListCollapsed;
          callbacks.onRefreshUi?.();
          showToast(state.agentsListCollapsed ? '已收起 Agent 列表释放视野' : '已展开 Agent 列表');
        }
      } else if (state.tourStep === 4) {
        const paBrief = state.paBriefs[0];
        const targetPid = paBrief?.participantId || state.participants[0]?.id;
        if (targetPid && callbacks.onOpenSeatInspector) {
          callbacks.onOpenSeatInspector(targetPid);
        }
      } else if (state.tourStep === 5) {
        callbacks.onPluckLinks?.();
        const deriveLink =
          state.links.find((l) => l.kind === 'derive') || state.links[0];
        if (deriveLink) {
          await api.synthesizeLink(state.roomId, deriveLink.id, me.id);
          showToast('🎸 已拨动弹性连线并一键合成正式结论卡！');
        }
      } else if (state.tourStep === 6) {
        state.viewMode = 'freeform';
        callbacks.onToggleStarLayout?.(true);
        showToast('🕸 已切回自由桌面并开启「星图组织」防重叠排布！');
      } else if (state.tourStep === 7) {
        stopOnboardingQuest();
        callbacks.onOpenFinalizeModal?.();
        return;
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      requestAnimationFrame(() => positionSpotlightElements());
    }
  });

  requestAnimationFrame(() => positionSpotlightElements());
}
