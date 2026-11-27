/**
 * Omind v5.3 — Main Frontend Orchestrator
 * Combines V4 Tactile Freeform Studio + Option A Editorial Craft + 60fps Elastic Spring Links
 * + Left-End Prominent Uncircled Collapsible Arrows + 8-Step Full-Capability Spotlight Tour
 */

import { api, connectRoomSse } from './api.js';
import {
  activateInlineCardEdit,
  applyConstellationEgoFocus,
  applyViewportTransform,
  fitViewportToContent,
  highlightSourceCards,
  playAgentMicroCursor,
  pluckAllVisibleLinks,
  pluckLink,
  renderAmbientPresenceCursors,
  renderCanvas,
  renderHostDigestIsland,
  resetConstellationPhysicsFromCards,
  spawnEmojiFountain,
} from './canvas.js';
import {
  initOnboardingSystem,
  launchConfetti,
  notifyQuestProgress,
  openWelcomeStudioOverlay,
  positionSpotlightElements,
  renderOnboardingQuest,
  startOnboardingQuest,
  stopOnboardingQuest,
} from './onboarding.js';
import {
  closeCenterModal,
  closeSideDrawer,
  openCenterModal,
  openFinalizeModal,
  openMcpConnectorDrawer,
  openRoleConfiguratorDrawer,
  openRoomLauncherOverlay,
  openSeatInspectorDrawer,
  openSharePageOverlay,
} from './overlays.js';
import {
  CUTE_EMOJI_POOL,
  SIMULATED_PERSONAS,
  copyText,
  escapeHtml,
  getCurrentParticipant,
  getLocalRecentRooms,
  loadRoomParticipantChoice,
  loadRoomParticipantToken,
  rememberRecentRoom,
  saveRoomParticipantChoice,
  saveShareToken,
  showToast,
  state,
} from './state.js';
import { voiceController } from './voice.js';

let activeSpatialAnchorIds = [];
let randomSparkCursor = 0;

const RANDOM_DESK_SPARKS = [
  {
    title: '💡 破局巧思',
    content: '如果把首次引导做成透明镂空聚光灯，新用户不用看说明书，顺着亮光点几下就能上手全部功能！',
    color: '#FEF3C7',
  },
  {
    title: '⚡ 边界追问',
    content: '对外分享定稿链接时，必须用只读 ShareToken 与内部原始讨论流物理隔离，防止群外抓包。',
    color: '#FFE4E6',
  },
  {
    title: '🧭 跨场串联',
    content: '支持直接 ⌘V 粘贴上一场会议的分享链接生成参考卡，新结论一旦推翻旧共识自动拉橙色虚线提醒。',
    color: '#EDE9FE',
  },
  {
    title: '🚀 推进待办',
    content: '本周五前完成 1-Room-1-DO 边缘压测与 MCP 四大工具联调，各自在因果脉络里签字认领排期。',
    color: '#DCFCE7',
  },
];

function isEditableFocus() {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.getAttribute('contenteditable') === 'true'
  );
}

async function handleSummonAgentOnCard(artifactId, { targetType = 'role', roleKey = 'spark', participantId = null } = {}) {
  if (!state.roomId || !artifactId) return;
  const me = getCurrentParticipant();
  try {
    const res = await api.summonAgentOnArtifact(state.roomId, artifactId, {
      targetType,
      roleKey,
      participantId,
      actorId: me.id,
    });
    if (res.mode === 'context_only') {
      showToast(`📎 ${res.note}`);
      return;
    }
    if (res.artifact) upsertById(state.artifacts, res.artifact);
    if (res.link) {
      upsertById(state.links, res.link);
      setTimeout(() => pluckLink(res.link.id, 12, 28), 60);
    }
    notifyQuestProgress('agent_summoned');
    refreshAllUi();
    showToast(
      res.redlineTriggered
        ? '🛑 触及该成员授权红线，已在卡片旁挂起待本人签字卡！'
        : `🤖 已针对该卡片召唤回应并建立弹性连线！`
    );
  } catch (err) {
    showToast(err.message);
  }
}

async function createQuickStickyOnDesk({
  x = null,
  y = null,
  title = '🗒 灵感便签',
  content = '写下你的想法，失焦后自动保存…',
  color = '#FEF3C7',
  autoFocus = true,
} = {}) {
  if (!state.roomId) return null;
  const me = getCurrentParticipant();
  const vp = document.getElementById('studioViewport')?.getBoundingClientRect();
  const idx = state.artifacts.length;
  const posX =
    x !== null
      ? x
      : vp
        ? Math.round(((vp.width - 320) * 0.44 - state.panX) / state.scale + (idx % 3) * 26)
        : 220 + (idx % 3) * 265;
  const posY =
    y !== null
      ? y
      : vp
        ? Math.round((vp.height * 0.42 - state.panY) / state.scale + (idx % 3) * 22)
        : 185 + Math.floor(idx / 3) * 185;

  const res = await api.createArtifact(state.roomId, {
    type: 'sticky',
    title,
    content,
    color,
    x: posX,
    y: posY,
    authorId: me.id,
  });

  if (res.artifact) {
    upsertById(state.artifacts, res.artifact);
    refreshAllUi();
    if (autoFocus && state.viewMode === 'freeform') {
      requestAnimationFrame(() => activateInlineCardEdit(res.artifact.id, true));
    }
  }
  return res.artifact;
}

function refreshAllUi() {
  renderTopHud();
  renderRoleStripAndHandBubble();
  renderColdStartStarters();
  renderAirStream();
  renderCanvas({
    onOpenLinkKindPicker: openLinkKindModal,
    onOpenEditModal: openEditArtifactModal,
    onSummonAgentOnCard: handleSummonAgentOnCard,
    onJumpToFreeformCard: (cardId) => toggleObsidianStarLayout(false, cardId),
  });
  renderOnboardingQuest();
  if (state.tourActive) {
    requestAnimationFrame(() => positionSpotlightElements());
  }
}

function renderTopHud() {
  const meta = state.roomMeta;
  if (!meta) return;

  const emojiEl = document.getElementById('presetBadgeEmoji');
  const titleEl = document.getElementById('roomTitleLabel');
  if (emojiEl) emojiEl.textContent = meta.presetEmoji || '⚖️';
  if (titleEl) titleEl.textContent = meta.title;

  const isStarterRoom =
    state.roomId === 'room_starter_v5' ||
    state.artifacts.some((a) => a.metadata?.stepBadge) ||
    String(meta.title || '').includes('新手上手案例');
  document.getElementById('resetStarterBtn')?.classList.toggle('hidden', !isStarterRoom);

  const pacingEl = document.getElementById('pacingBadge');
  if (pacingEl) {
    const isMulti = meta.pacingMode === 'multiplayer';
    pacingEl.className = `pacing-pill ${isMulti ? 'multiplayer' : 'solo'}`;
    pacingEl.textContent = isMulti ? '静默' : '智囊';
    pacingEl.title = isMulti
      ? `👥 多人静默防刷屏模式 (${meta.activeHumanCount || 2}人在线：AI 先挂短提示不刷屏)`
      : '👤 单人智囊模式 (自动向桌面边缘落火花卡)';
  }

  document.querySelectorAll('.view-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === state.viewMode);
  });
  document
    .getElementById('freeformSubControls')
    ?.classList.toggle('hidden', state.viewMode !== 'freeform');

  const starBtn = document.getElementById('starLayoutBtn');
  const starBtnLbl = document.getElementById('starLayoutBtnLabel');
  const starSubWrap = document.getElementById('starSubControls');
  const orbitBtn = document.getElementById('starOrbitModeBtn');
  const freeCloudBtn = document.getElementById('starFreeCloudModeBtn');

  if (starBtn) {
    starBtn.classList.toggle('active', state.starLayoutOn);
    starBtn.setAttribute('aria-pressed', String(state.starLayoutOn));
  }
  if (starBtnLbl) {
    starBtnLbl.textContent = state.starLayoutOn ? '🕸 星图组织 · 已开启' : '🕸 星图组织';
  }
  starSubWrap?.classList.toggle('hidden', !state.starLayoutOn);
  orbitBtn?.classList.toggle('active', state.starSubStyle === 'orbit');
  freeCloudBtn?.classList.toggle('active', state.starSubStyle === 'freecloud');

  const causalBadge = document.getElementById('causalCountBadge');
  if (causalBadge) causalBadge.textContent = String(state.consensusItems.length);

  const staleCount = state.consensusItems.filter((c) => c.status === 'stale_upstream').length;
  const staleBtn = document.getElementById('staleBannerBtn');
  if (staleBtn) {
    staleBtn.classList.toggle('hidden', staleCount === 0);
    if (staleCount > 0) {
      staleBtn.textContent = `⚠️ ${staleCount} 条下游结论因上游拍板变更需复核（点击查看修订提案）`;
    }
  }

  // Collapsible User Roster (Fixed Left-End Uncircled Chevron!)
  const toggleUsersBtn = document.getElementById('toggleUsersListBtn');
  const usersExpanded = document.getElementById('usersExpandedWrap');
  const usersCollapsed = document.getElementById('usersCollapsedSummary');
  const seatStrip = document.getElementById('seatCapsuleStrip');

  if (toggleUsersBtn) {
    toggleUsersBtn.classList.toggle('is-collapsed', state.usersListCollapsed);
    toggleUsersBtn.setAttribute('aria-expanded', String(!state.usersListCollapsed));
  }
  usersExpanded?.classList.toggle('hidden', state.usersListCollapsed);
  usersCollapsed?.classList.toggle('hidden', !state.usersListCollapsed);

  const totalPendingSignoffs = state.consensusItems.filter(
    (c) => c.signoffStatus === 'pending_human_signoff'
  ).length;

  if (usersCollapsed && state.usersListCollapsed) {
    const stackHtml = state.participants
      .slice(0, 4)
      .map((p) => {
        const matchedPersona = SIMULATED_PERSONAS.find((sp) => sp.avatar === p.avatar);
        const bg = matchedPersona?.bg || '#F3F4F6';
        return `<span style="background:${escapeHtml(bg)};">${escapeHtml(p.avatar)}</span>`;
      })
      .join('');

    usersCollapsed.innerHTML = `
      <span class="mini-avatar-stack">${stackHtml}</span>
      <span>${state.participants.length}人</span>
      ${totalPendingSignoffs > 0 ? `<span class="seat-signoff-dot">${totalPendingSignoffs}待签</span>` : ''}
    `;
  }

  if (seatStrip) {
    const briefMap = new Map(state.paBriefs.map((b) => [b.participantId, b]));
    seatStrip.innerHTML = state.participants
      .map((p) => {
        const b = briefMap.get(p.id);
        const hasDraggablePa = Boolean(b && !b.pendingClaim);
        const paIcon = b
          ? b.pendingClaim
            ? '🔑'
            : b.mode === 'proxy_tiered'
              ? '🤖'
              : '📎'
          : '';
        const pendingCnt = state.consensusItems.filter(
          (c) => c.ownerParticipantId === p.id && c.signoffStatus === 'pending_human_signoff'
        ).length;
        const isMe = p.id === state.currentParticipantId;
        const matchedPersona = SIMULATED_PERSONAS.find((sp) => sp.avatar === p.avatar);
        const avatarBg = matchedPersona?.bg || '#F3F4F6';

        return `
          <button
            type="button"
            id="seat-${escapeHtml(p.id)}"
            class="seat-capsule ${isMe ? 'is-me' : ''}"
            data-seat-id="${escapeHtml(p.id)}"
            ${hasDraggablePa ? `draggable="true" data-drag-pa="${escapeHtml(p.id)}"` : ''}
            title="${escapeHtml(p.name)}（${escapeHtml(p.roleTitle)}）${b ? ` · PA 已接入 (${b.pendingClaim ? '待本人认领' : '可拖到卡片上召唤'})` : ''}"
          >
            <span class="seat-avatar" style="background:${escapeHtml(avatarBg)};">
              ${p.isOnline ? '<span class="seat-online-dot"></span>' : ''}
              ${escapeHtml(p.avatar)}
            </span>
            <span>${escapeHtml(p.name)}${isMe ? ' (我)' : ''}</span>
            ${paIcon ? `<span class="seat-pa-badge">${paIcon}</span>` : ''}
            ${pendingCnt > 0 ? `<span class="seat-signoff-dot" title="待签字红线项">${pendingCnt}</span>` : ''}
          </button>
        `;
      })
      .join('');

    seatStrip.querySelectorAll('[data-seat-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-seat-id');
        notifyQuestProgress('seat_inspected');
        openSeatInspectorDrawer(pid, { onIdentityChanged: () => refreshAllUi() });
      });
    });

    seatStrip.querySelectorAll('[data-drag-pa]').forEach((btn) => {
      btn.addEventListener('dragstart', (ev) => {
        const pid = btn.getAttribute('data-drag-pa');
        ev.dataTransfer?.setData('text/omind-pa-seat', pid);
      });
    });
  }
}

function renderRoleStripAndHandBubble() {
  const toggleAgentsBtn = document.getElementById('toggleAgentsListBtn');
  const agentsExpanded = document.getElementById('agentsExpandedWrap');
  const agentsCollapsed = document.getElementById('agentsCollapsedSummary');
  const strip = document.getElementById('publicRoleStrip');
  const bubbleSlot = document.getElementById('handRaiseBubbleSlot');
  if (!strip || !bubbleSlot) return;

  const enabledRoles = state.roles.filter((r) => r.enabled);
  const activeTeasers = state.handRaises.filter((h) => h.status === 'raised_teaser');
  const foldedByRole = new Map();
  for (const h of state.handRaises) {
    if (h.status === 'folded' || h.status === 'raised_teaser') {
      foldedByRole.set(h.roleKey, (foldedByRole.get(h.roleKey) || 0) + 1);
    }
  }

  if (toggleAgentsBtn) {
    toggleAgentsBtn.classList.toggle('is-collapsed', state.agentsListCollapsed);
    toggleAgentsBtn.setAttribute('aria-expanded', String(!state.agentsListCollapsed));
  }
  agentsExpanded?.classList.toggle('hidden', state.agentsListCollapsed);
  agentsCollapsed?.classList.toggle('hidden', !state.agentsListCollapsed);

  if (agentsCollapsed && state.agentsListCollapsed) {
    const roleStackHtml = enabledRoles
      .slice(0, 4)
      .map((r) => `<span style="background:#EEF2FF;">${escapeHtml(r.badgeEmoji)}</span>`)
      .join('');
    agentsCollapsed.innerHTML = `
      <span class="mini-avatar-stack">${roleStackHtml}</span>
      <span>${enabledRoles.length}个Agent</span>
      ${activeTeasers.length > 0 ? `<span class="tiny-badge" style="background:#FEF3C7;color:#B45309;">✋${activeTeasers.length}</span>` : ''}
    `;
  }

  strip.innerHTML = enabledRoles
    .map((r) => {
      const hasLive = activeTeasers.some((h) => h.roleKey === r.roleKey);
      const foldedCnt = foldedByRole.get(r.roleKey) || 0;
      return `
        <button
          type="button"
          draggable="true"
          class="role-chip ${hasLive ? 'has-raised' : ''}"
          data-role-chip="${escapeHtml(r.roleKey)}"
          title="拖拽到桌面任意卡片上召唤「${escapeHtml(r.displayName)}」，或点击管理角色配置"
        >
          <span>${escapeHtml(r.badgeEmoji)}</span>
          <span>${escapeHtml(r.displayName.replace(/\s.*$/, ''))}</span>
          ${foldedCnt > 0 ? `<span class="tiny-badge" style="background:#FEF3C7;color:#B45309;">${foldedCnt}</span>` : ''}
        </button>
      `;
    })
    .join('');

  strip.querySelectorAll('[data-role-chip]').forEach((btn) => {
    btn.addEventListener('click', openRoleConfiguratorDrawer);
    btn.addEventListener('dragstart', (ev) => {
      const rKey = btn.getAttribute('data-role-chip');
      ev.dataTransfer?.setData('text/omind-role-key', rKey);
    });
  });

  const topTeaser = activeTeasers[0];
  if (!topTeaser) {
    bubbleSlot.innerHTML = '';
    return;
  }

  const roleObj = state.roles.find((r) => r.roleKey === topTeaser.roleKey);
  const me = getCurrentParticipant();

  bubbleSlot.innerHTML = `
    <div class="hand-raise-bubble">
      <span><strong>${escapeHtml(roleObj?.badgeEmoji || '💡')} ${escapeHtml(roleObj?.displayName || topTeaser.roleKey)}</strong>：${escapeHtml(topTeaser.teaser)}</span>
      <button id="expandTeaserBtn" type="button" class="btn btn-xs btn-primary">展开</button>
      <button id="dismissTeaserBtn" type="button" class="icon-circle-btn" style="width:22px;height:22px;font-size:11px;" title="忽略">×</button>
    </div>
  `;

  bubbleSlot.querySelector('#expandTeaserBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = '展开中…';
    try {
      await api.expandHandRaise(state.roomId, topTeaser.id, me.id);
      notifyQuestProgress('hand_expanded');
      showToast('✨ 已展开完整灵感卡落上自由桌面');
    } catch (err) {
      showToast(err.message);
    }
  });

  bubbleSlot.querySelector('#dismissTeaserBtn')?.addEventListener('click', async () => {
    await api.dismissHandRaise(state.roomId, topTeaser.id, me.id);
  });
}

function renderColdStartStarters() {
  const box = document.getElementById('coldStartQuickTopics');
  if (!box || !state.roomMeta) return;
  const presetObj = state.presets.find((p) => p.id === state.roomMeta.presetId);
  const prompts = presetObj?.starterPrompts || [
    '今天想讨论新版本首屏留存改版，目前注册转化率只有 18%，希望下周上线验证。',
  ];

  box.innerHTML = prompts
    .map(
      (txt) =>
        `<button type="button" class="starter-pill-btn" data-starter-text="${escapeHtml(txt)}">⚡ 点此填入示例话题：「${escapeHtml(txt)}」</button>`
    )
    .join('');

  box.querySelectorAll('[data-starter-text]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const content = btn.getAttribute('data-starter-text');
      const me = getCurrentParticipant();
      await api.postMessage(state.roomId, {
        senderId: me.id,
        inputModality: 'voice_ptt',
        voiceDurationMs: 4200,
        content,
      });
    });
  });
}

function renderAirStream() {
  const list = document.getElementById('airMessagesList');
  const mentionRow = document.getElementById('mentionChipsRow');
  if (!list) return;

  const artMap = new Map(state.artifacts.map((a) => [a.id, a]));
  const pMap = new Map(state.participants.map((p) => [p.id, p]));
  const me = getCurrentParticipant();

  if (state.messages.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;color:#78716C;font-size:12px;padding:24px 10px;">
        对讲流尚无发言。<br/>点下方 <strong>@spark / @tech</strong> 可召唤指定 Agent；重要观点点 <strong>📌 贴上桌</strong> 上墙。
      </div>
    `;
  } else {
    list.innerHTML = state.messages
      .map((m) => {
        const senderP = pMap.get(m.senderId);
        const senderEmoji = senderP?.avatar ? `${senderP.avatar} ` : '';
        const modalityIcon =
          m.inputModality === 'spatial_voice'
            ? `🎙 空间语音 ${m.voiceDurationMs ? `${(m.voiceDurationMs / 1000).toFixed(1)}s` : ''}`
            : m.inputModality === 'voice_ptt'
              ? `🎙 语音条 ${m.voiceDurationMs ? `${(m.voiceDurationMs / 1000).toFixed(1)}s` : ''}`
              : '';

        const anchorBadges = (m.anchorArtifactIds || [])
          .map((aid) => {
            const target = artMap.get(aid);
            const label = target ? target.title || target.content.slice(0, 12) : aid;
            return `<span class="anchor-chip" data-focus-art="${escapeHtml(aid)}">🎯 锚定：${escapeHtml(label)}</span>`;
          })
          .join(' ');

        return `
          <div class="air-msg-item">
            <div class="air-msg-head">
              <span class="air-msg-sender">${escapeHtml(senderEmoji)}${escapeHtml(m.senderName)} ${modalityIcon ? `<small style="color:#4F46E5;font-weight:600;">· ${escapeHtml(modalityIcon)}</small>` : ''}</span>
              ${
                m.promotedArtifactId
                  ? `<span style="color:#059669;font-weight:600;">✓ 已上桌</span>`
                  : `<button type="button" class="promote-msg-btn" data-promote-msg="${escapeHtml(m.id)}">📌 贴上桌</button>`
              }
            </div>
            ${anchorBadges ? `<div>${anchorBadges}</div>` : ''}
            <div style="font-size:12.5px;color:#1C1917;white-space:pre-wrap;">${escapeHtml(m.content)}</div>
          </div>
        `;
      })
      .join('');

    list.scrollTop = list.scrollHeight;
  }

  list.querySelectorAll('[data-promote-msg]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mid = btn.getAttribute('data-promote-msg');
      await api.promoteMessage(state.roomId, mid, { actorId: me.id });
      showToast('📌 已将该条发言贴上白板桌面');
    });
  });

  list.querySelectorAll('[data-focus-art]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const aid = chip.getAttribute('data-focus-art');
      state.selectedArtifactIds.clear();
      state.selectedArtifactIds.add(aid);
      state.viewMode = 'freeform';
      refreshAllUi();
    });
  });

  if (mentionRow) {
    const targets = [
      ...state.roles
        .filter((r) => r.enabled)
        .map((r) => ({ tag: `@${r.roleKey}`, label: `${r.badgeEmoji} @${r.roleKey}` })),
      ...state.participants.map((p) => ({ tag: `@${p.name}`, label: `${p.avatar} @${p.name}` })),
    ].slice(0, 7);

    mentionRow.innerHTML = targets
      .map(
        (t) =>
          `<button type="button" class="micro-chip-btn" style="padding:1px 7px;font-size:11px;white-space:nowrap;" data-insert-mention="${escapeHtml(t.tag)}">${escapeHtml(t.label)}</button>`
      )
      .join('');

    mentionRow.querySelectorAll('[data-insert-mention]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-insert-mention');
        const input = document.getElementById('airInput');
        if (input) {
          input.value = `${input.value}${input.value && !input.value.endsWith(' ') ? ' ' : ''}${tag} `;
          input.focus();
        }
      });
    });
  }
}

function openLinkKindModal(fromId, toId) {
  const me = getCurrentParticipant();
  openCenterModal(
    `
    <h3 style="margin:0 0 10px;">🔗 选择三色弹性语义连线类型</h3>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
      <button type="button" class="preset-card" style="padding:10px 14px;" data-pick-kind="support">
        <strong style="color:#059669;">🟢 support · 资料佐证</strong>
        <div style="font-size:12px;color:#57534E;">客观实验、压测数据或外部资料支撑目标卡片</div>
      </button>
      <button type="button" class="preset-card" style="padding:10px 14px;" data-pick-kind="derive">
        <strong style="color:#7C3AED;">🟣 derive · 互补推导</strong>
        <div style="font-size:12px;color:#57534E;">支持在线上胶囊一键「✨ 合成结论」</div>
      </button>
      <button type="button" class="preset-card" style="padding:10px 14px;" data-pick-kind="conflict">
        <strong style="color:#D97706;">🟠 conflict · 观点碰撞</strong>
        <div style="font-size:12px;color:#57534E;">支持 A/B 投票、并行推演利弊、转待决</div>
      </button>
    </div>
    <input id="linkReasonInput" class="form-input" placeholder="可选：补充一句话连线说明（创建后也可双击胶囊直接改）…" style="margin-bottom:10px;" />
    <div style="text-align:right;">
      <button id="cancelLinkModalBtn" type="button" class="btn btn-subtle">取消</button>
    </div>
    `,
    (modal) => {
      modal.querySelector('#cancelLinkModalBtn')?.addEventListener('click', closeCenterModal);
      modal.querySelectorAll('[data-pick-kind]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const kind = btn.getAttribute('data-pick-kind');
          const reason = modal.querySelector('#linkReasonInput')?.value?.trim() || '';
          const created = await api.createLink(state.roomId, {
            fromId,
            toId,
            kind,
            reason,
            createdBy: me.id,
          });
          if (created.link) {
            upsertById(state.links, created.link);
            setTimeout(() => pluckLink(created.link.id, 0, 28), 50);
          }
          closeCenterModal();
          refreshAllUi();
          showToast('🔗 弹性连线已建立（双击线上胶囊可直接改原因）');
        });
      });
    }
  );
}

function openEditArtifactModal(card) {
  const me = getCurrentParticipant();
  openCenterModal(
    `
    <h3 style="margin:0 0 12px;">✎ 编辑桌面卡片</h3>
    <div class="form-field">
      <label>标题</label>
      <input id="editCardTitle" class="form-input" value="${escapeHtml(card.title)}" />
    </div>
    <div class="form-field">
      <label>内容（提示：平时直接双击卡片正文即可免弹窗改字）</label>
      <textarea id="editCardContent" class="form-input" rows="4">${escapeHtml(card.content)}</textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="cancelEditCardBtn" type="button" class="btn btn-subtle">取消</button>
      <button id="saveEditCardBtn" type="button" class="btn btn-primary">保存修改</button>
    </div>
    `,
    (modal) => {
      modal.querySelector('#cancelEditCardBtn')?.addEventListener('click', closeCenterModal);
      modal.querySelector('#saveEditCardBtn')?.addEventListener('click', async () => {
        const title = modal.querySelector('#editCardTitle')?.value || '';
        const content = modal.querySelector('#editCardContent')?.value || '';
        await api.patchArtifact(state.roomId, card.id, {
          title,
          content,
          actorId: me.id,
        });
        closeCenterModal();
      });
    }
  );
}

function openVoiceStickyModal() {
  openCenterModal(
    `
    <h3 style="margin:0 0 8px;">🎙 语音转桌面便签</h3>
    <div class="ptt-recording-bar" style="border-radius:12px;margin-bottom:10px;">
      <div class="waveform-bars"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      <span id="voiceStickyModalStatus" class="ptt-status-text">正在聆听你的想法…</span>
      <button id="voiceStickySimBtn" type="button" class="btn btn-xs btn-subtle">填入示例语音</button>
    </div>
    <textarea id="voiceStickyTextarea" class="form-input" rows="3" placeholder="说出的内容会实时转写在这里，贴上桌面后自动关联脉络…"></textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
      <button id="cancelVoiceStickyBtn" type="button" class="btn btn-subtle">取消</button>
      <button id="confirmVoiceStickyBtn" type="button" class="btn btn-primary">贴成语音便签</button>
    </div>
    `,
    (modal) => {
      const ta = modal.querySelector('#voiceStickyTextarea');
      voiceController.start({
        onInterim: (txt) => {
          if (ta && txt) ta.value = txt;
        },
      });
      modal.querySelector('#voiceStickySimBtn')?.addEventListener('click', () => {
        if (ta) {
          ta.value =
            '建议在用户点击收敛定稿时自动生成免密只读凭证和书签链接，全程零登录打断！';
        }
      });
      modal.querySelector('#cancelVoiceStickyBtn')?.addEventListener('click', () => {
        voiceController.stop();
        closeCenterModal();
      });
      modal.querySelector('#confirmVoiceStickyBtn')?.addEventListener('click', async () => {
        voiceController.stop();
        const text = ta?.value?.trim();
        if (!text) {
          showToast('请先说两句或点「填入示例语音」');
          return;
        }
        closeCenterModal();
        await createQuickStickyOnDesk({
          title: `🎙 语音便签 · ${Math.max(3, Math.round(text.length / 5))}s`,
          content: `“${text}”`,
          color: '#EDE9FE',
          autoFocus: false,
        });
        showToast('🎙 语音便签已贴上自由桌面！');
      });
    }
  );
}

function openConsensusModal(existingItem = null) {
  const me = getCurrentParticipant();
  const isEditingLocked = existingItem?.status === 'locked';
  const otherItems = state.consensusItems.filter((c) => c.id !== existingItem?.id);

  openCenterModal(
    `
    <h3 style="margin:0 0 10px;">
      ${existingItem ? (isEditingLocked ? '⚠️ 修改已锁定结论（将自动触发下游过期预警）' : '✎ 编辑共识条目') : '⚖️ 记一条共识 / 行动待办'}
    </h3>
    ${
      !existingItem
        ? `<div class="form-field">
            <label>类型</label>
            <select id="consSectionInput" class="form-input">
              <option value="decision">⚖️ 核心决策 (decision)</option>
              <option value="action_item">🏃 行动待办 (action_item)</option>
              <option value="context">🎯 背景前提 (context)</option>
              <option value="open_question">❓ 待决问题 (open_question)</option>
            </select>
           </div>`
        : ''
    }
    <div class="form-field">
      <label>结论或待办正文</label>
      <textarea id="consContentInput" class="form-input" rows="3">${escapeHtml(existingItem?.content || '')}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-field">
        <label>负责人（可选）</label>
        <select id="consOwnerInput" class="form-input">
          <option value="">— 未指定 —</option>
          ${state.participants
            .map(
              (p) =>
                `<option value="${escapeHtml(p.id)}" ${existingItem?.ownerParticipantId === p.id ? 'selected' : ''}>${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="form-field">
        <label>截止时间（可选）</label>
        <input id="consDueInput" class="form-input" placeholder="如：本周五 18:00" value="${escapeHtml(existingItem?.dueDate || '')}" />
      </div>
    </div>
    ${
      otherItems.length > 0
        ? `<div class="form-field">
            <label>上游依赖结论（当上游修改时本条自动标黄预警）</label>
            <select id="consDepInput" class="form-input">
              <option value="">— 无上游依赖 —</option>
              ${otherItems
                .map(
                  (c) =>
                    `<option value="${escapeHtml(c.id)}" ${(existingItem?.dependsOnIds || []).includes(c.id) ? 'selected' : ''}>[${escapeHtml(c.section)}] ${escapeHtml(c.content.slice(0, 32))}</option>`
                )
                .join('')}
            </select>
           </div>`
        : ''
    }
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="cancelConsBtn" type="button" class="btn btn-subtle">取消</button>
      <button id="saveConsBtn" type="button" class="btn btn-emerald">
        ${existingItem ? '保存并拍板锁定' : '创建并拍板锁定'}
      </button>
    </div>
    `,
    (modal) => {
      modal.querySelector('#cancelConsBtn')?.addEventListener('click', closeCenterModal);
      modal.querySelector('#saveConsBtn')?.addEventListener('click', async () => {
        const content = modal.querySelector('#consContentInput')?.value?.trim();
        if (!content) {
          showToast('请填写内容');
          return;
        }
        const ownerParticipantId = modal.querySelector('#consOwnerInput')?.value || null;
        const dueDate = modal.querySelector('#consDueInput')?.value?.trim() || null;
        const depVal = modal.querySelector('#consDepInput')?.value || '';
        const dependsOnIds = depVal ? [depVal] : existingItem?.dependsOnIds || [];

        try {
          if (existingItem) {
            const res = await api.lockConsensus(state.roomId, existingItem.id, {
              actorId: me.id,
              content,
              ownerParticipantId,
              dueDate,
              dependsOnIds,
            });
            if (res.staleItems?.length > 0) {
              showToast(`⚠️ 已更新上游结论，${res.staleItems.length} 条下游关联项已标黄并生成修订提案！`);
            } else {
              showToast('🔒 已更新并拍板锁定');
            }
          } else {
            const section = modal.querySelector('#consSectionInput')?.value || 'decision';
            await api.addConsensus(state.roomId, {
              section,
              content,
              ownerParticipantId,
              dueDate,
              dependsOnIds,
              status: 'locked',
              actorId: me.id,
            });
            showToast('🔒 已添加并锁定共识条目');
          }
          closeCenterModal();
        } catch (err) {
          showToast(`⛔ ${err.message}`);
        }
      });
    }
  );
}

function leaveActiveRoom() {
  if (state.sseSource) {
    state.sseSource.close();
    state.sseSource = null;
  }
  stopOnboardingQuest();
  closeCenterModal();
  closeSideDrawer();
  state.roomId = null;
  state.roomMeta = null;
  document.getElementById('app')?.classList.add('hidden');
}

export function navigateToHome({ replace = false } = {}) {
  leaveActiveRoom();
  document.getElementById('launcherOverlay')?.classList.add('hidden');
  document.getElementById('shareOverlay')?.classList.add('hidden');
  if (replace) {
    history.replaceState({}, '', '/');
  } else if (location.pathname !== '/' || location.search !== '') {
    history.pushState({}, '', '/');
  }
  openWelcomeStudioOverlay();
}

export function navigateToNewLauncher({ replace = false } = {}) {
  stopOnboardingQuest();
  closeCenterModal();
  closeSideDrawer();
  document.getElementById('welcomeStudioOverlay')?.classList.add('hidden');
  document.getElementById('shareOverlay')?.classList.add('hidden');
  if (replace) {
    history.replaceState({}, '', '/new');
  } else if (location.pathname !== '/new') {
    history.pushState({}, '', '/new');
  }
  openRoomLauncherOverlay({
    onSelectRoom: (rid) => loadAndEnterRoom(rid, { pushHistory: true }),
    onCreatedRoom: (created) => loadAndEnterRoom(created.roomMeta.id, { pushHistory: true }),
    onCancel: () => {
      if (state.roomId) {
        history.pushState({}, '', `/room/${encodeURIComponent(state.roomId)}`);
      } else {
        navigateToHome();
      }
    },
  });
}

export async function loadAndEnterRoom(
  roomId,
  { pushHistory = false, customPath = null } = {}
) {
  if (state.sseSource) {
    state.sseSource.close();
    state.sseSource = null;
  }

  const savedSeat = loadRoomParticipantChoice(roomId);
  const full = await api.getRoom(roomId, savedSeat || '');

  state.roomId = full.roomMeta.id;
  state.roomMeta = full.roomMeta;
  state.participants = full.participants || [];
  state.roles = full.roles || [];
  state.paBriefs = full.paBriefs || [];
  state.artifacts = full.artifacts || [];
  state.links = full.links || [];
  state.messages = full.messages || [];
  state.handRaises = full.handRaises || [];
  state.consensusItems = full.consensusItems || [];
  state.proposals = full.proposals || [];
  state.latestSnapshot = full.latestSnapshot || null;
  state.latestShareToken = full.latestShareToken || null;
  state.demoSeatTokens = full.demoSeatTokens || null;
  state.presets = full.presets || [];
  state.templates = full.templates || [];
  state.mcpConnectInfo = full.mcpConnectInfo || null;
  state.lastEventSeq = full.roomMeta.lastEventSeq || 0;
  state.starLayoutOn = false;
  state.starSubStyle = 'orbit';
  state.starHoveredId = null;
  state.starPinnedId = null;
  state.starDraggingId = null;
  state.savedFreeformCoords = {};

  // Smart responsive auto-fold on compact laptop viewports (<1420px) so top rail never crowds!
  if (window.innerWidth < 1420) {
    state.usersListCollapsed = true;
    state.agentsListCollapsed = true;
  }

  if (state.latestSnapshot?.id && state.latestShareToken) {
    saveShareToken(state.latestSnapshot.id, state.latestShareToken);
  }

  if (savedSeat && state.participants.some((p) => p.id === savedSeat)) {
    state.currentParticipantId = savedSeat;
  } else {
    const firstHuman =
      state.participants.find((p) => !p.pendingClaim) || state.participants[0];
    state.currentParticipantId = firstHuman?.id || null;
  }

  state.currentParticipantToken =
    loadRoomParticipantToken(state.roomId, state.currentParticipantId) ||
    state.demoSeatTokens?.[state.currentParticipantId] ||
    null;

  rememberRecentRoom({
    roomId: state.roomId,
    title: state.roomMeta.title,
    presetId: state.roomMeta.presetId,
    status: state.roomMeta.status,
    createdAt: state.roomMeta.createdAt,
  });

  document.getElementById('welcomeStudioOverlay')?.classList.add('hidden');
  document.getElementById('launcherOverlay')?.classList.add('hidden');
  document.getElementById('shareOverlay')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');

  const targetUrl = customPath || `/room/${encodeURIComponent(state.roomId)}`;
  if (pushHistory) {
    history.pushState({}, '', targetUrl);
  } else {
    history.replaceState({}, '', targetUrl);
  }

  fitViewportToContent();
  refreshAllUi();
  setTimeout(() => pluckAllVisibleLinks(), 180);

  state.sseSource = connectRoomSse(
    state.roomId,
    state.currentParticipantId,
    state.lastEventSeq,
    {
      onSeq: (seq) => {
        if (seq > state.lastEventSeq) state.lastEventSeq = seq;
      },
      onEvent: (eventName, payload) => handleLiveSseEvent(eventName, payload),
    }
  );
}

function upsertById(arr, item) {
  if (!item?.id) return;
  const idx = arr.findIndex((x) => x.id === item.id);
  if (idx >= 0) arr[idx] = item;
  else arr.push(item);
}

function handleLiveSseEvent(eventName, payload) {
  if (eventName === 'room.pacing_changed') {
    if (state.roomMeta) {
      state.roomMeta.pacingMode = payload.pacingMode;
      state.roomMeta.activeHumanCount = payload.activeHumanCount;
      renderTopHud();
    }
    return;
  }

  if (eventName === 'participant.updated') {
    if (payload.participant) upsertById(state.participants, payload.participant);
    if (state.roomMeta && payload.pacingMode) {
      state.roomMeta.pacingMode = payload.pacingMode;
      state.roomMeta.activeHumanCount = payload.activeHumanCount;
    }
    renderTopHud();
    return;
  }

  if (eventName === 'role.updated' && payload.role) {
    const idx = state.roles.findIndex((r) => r.roleKey === payload.role.roleKey);
    if (idx >= 0) state.roles[idx] = payload.role;
    else state.roles.push(payload.role);
    renderRoleStripAndHandBubble();
    return;
  }

  if (eventName === 'message.created' && payload.message) {
    upsertById(state.messages, payload.message);
    renderAirStream();
    document.getElementById('coldStartCard')?.classList.add('hidden');
    return;
  }

  if (eventName === 'artifact.upserted' && payload.artifact) {
    upsertById(state.artifacts, payload.artifact);
    if (payload.artifact.sourceRef?.type === 'message') {
      const m = state.messages.find((x) => x.id === payload.artifact.sourceRef.id);
      if (m) m.promotedArtifactId = payload.artifact.id;
    }
    refreshAllUi();
    return;
  }

  if (eventName === 'artifact.deleted' && payload.artifactId) {
    state.artifacts = state.artifacts.filter((a) => a.id !== payload.artifactId);
    state.links = state.links.filter(
      (l) => l.fromArtifactId !== payload.artifactId && l.toArtifactId !== payload.artifactId
    );
    refreshAllUi();
    return;
  }

  if (eventName === 'link.upserted' && payload.link) {
    upsertById(state.links, payload.link);
    refreshAllUi();
    setTimeout(() => pluckLink(payload.link.id, 0, 24), 40);
    return;
  }

  if (eventName === 'link.deleted' && payload.linkId) {
    state.links = state.links.filter((l) => l.id !== payload.linkId);
    refreshAllUi();
    return;
  }

  if (eventName === 'agent.cursor_flash') {
    playAgentMicroCursor(payload);
    return;
  }

  if (eventName === 'agent.hand_raised' || eventName === 'agent.hand_updated') {
    const hr = payload.handRaise;
    if (hr) {
      const idx = state.handRaises.findIndex((x) => x.id === hr.id);
      if (idx >= 0) state.handRaises[idx] = hr;
      else state.handRaises.unshift(hr);
      renderRoleStripAndHandBubble();
      if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
    }
    return;
  }

  if (eventName === 'pa.brief_updated') {
    if (payload.removedParticipantId) {
      state.participants = state.participants.filter(
        (p) => p.id !== payload.removedParticipantId
      );
      state.paBriefs = state.paBriefs.filter(
        (b) => b.participantId !== payload.removedParticipantId
      );
    }
    if (payload.participant) upsertById(state.participants, payload.participant);
    if (payload.brief) {
      const idx = state.paBriefs.findIndex((b) => b.id === payload.brief.id);
      if (idx >= 0) state.paBriefs[idx] = payload.brief;
      else {
        const byPid = state.paBriefs.findIndex(
          (b) => b.participantId === payload.brief.participantId
        );
        if (byPid >= 0) state.paBriefs[byPid] = payload.brief;
        else state.paBriefs.push(payload.brief);
      }
    }
    refreshAllUi();
    return;
  }

  if (eventName === 'pa.referenced') {
    if (payload.brief) {
      const idx = state.paBriefs.findIndex((b) => b.participantId === payload.brief.participantId);
      if (idx >= 0) state.paBriefs[idx] = payload.brief;
    }
    renderTopHud();
    const seatEl = document.getElementById(`seat-${payload.participantId}`);
    if (seatEl) {
      seatEl.classList.remove('pa-glow');
      void seatEl.offsetWidth;
      seatEl.classList.add('pa-glow');
    }
    return;
  }

  if (eventName === 'consensus.updated' && payload.item) {
    upsertById(state.consensusItems, payload.item);
    refreshAllUi();
    return;
  }

  if ((eventName === 'proposal.created' || eventName === 'proposal.updated') && payload.proposal) {
    if (payload.proposal.status === 'pending') {
      upsertById(state.proposals, payload.proposal);
    } else {
      state.proposals = state.proposals.filter((p) => p.id !== payload.proposal.id);
    }
    refreshAllUi();
    return;
  }

  if (eventName === 'room.finalized' && payload.snapshot) {
    state.latestSnapshot = payload.snapshot;
    if (payload.shareToken) {
      state.latestShareToken = payload.shareToken;
      saveShareToken(payload.snapshot.id, payload.shareToken);
    }
    if (state.roomMeta) state.roomMeta.status = 'finalized';
    notifyQuestProgress('finalized');
    renderTopHud();
    return;
  }

  if (eventName === 'room.reset' && payload.roomMeta) {
    loadAndEnterRoom(state.roomId);
  }
}

async function handleSmartPasteTextOrUrl(rawText) {
  const text = String(rawText || '').trim();
  if (!text || !state.roomId) return;

  const me = getCurrentParticipant();
  const offset = (state.artifacts.length % 5) * 28;
  const x = 160 + offset;
  const y = 150 + offset;

  const shareMatch =
    text.match(/\/(?:share|s)\/([A-Za-z0-9_-]+)/) ||
    text.match(/[?&]share=([A-Za-z0-9_-]+)/) ||
    text.match(/\/api\/shares\/([A-Za-z0-9_-]+)/) ||
    (text.startsWith('shr_') ? [text, text] : null);

  if (shareMatch?.[1]) {
    const tokMatch =
      text.match(/[?&]t=([A-Za-z0-9_-]+)/) ||
      text.match(/[?&]shareToken=([A-Za-z0-9_-]+)/);
    try {
      await api.importShareCard(state.roomId, {
        shareId: shareMatch[1],
        shareToken: tokMatch?.[1] || '',
        shareUrl: text,
        x,
        y,
        authorId: me.id,
      });
      showToast('🔗 已将前序会议分享链接转化为「前序会议参考卡」并注入桌面上下文！');
      return;
    } catch (err) {
      showToast(`导入前序分享卡失败：${err.message}`);
      return;
    }
  }

  if (/^https?:\/\/\S+$/i.test(text)) {
    let hostLabel = text;
    try {
      hostLabel = new URL(text).hostname;
    } catch {
      // ignore
    }
    await api.createArtifact(state.roomId, {
      type: 'link',
      title: `🔗 参考链接 · ${hostLabel}`,
      content: text,
      color: '#E0F2FE',
      x,
      y,
      metadata: { url: text },
      authorId: me.id,
    });
    showToast('🔗 已粘贴生成桌面链接卡片');
    return;
  }

  await api.createArtifact(state.roomId, {
    type: 'sticky',
    title: '📋 粘贴便签',
    content: text,
    color: '#FEF3C7',
    x,
    y,
    authorId: me.id,
  });
  showToast('🗒 已粘贴生成桌面便签');
}

async function handleDroppedFilesOntoDesk(files, dropX = null, dropY = null) {
  if (!state.roomId || !files?.length) return;
  const me = getCurrentParticipant();
  let offset = 0;

  for (const file of Array.from(files).slice(0, 4)) {
    if (file.size > 2 * 1024 * 1024) {
      showToast(`文件 ${file.name} 超过 2MB 限制`);
      continue;
    }
    const x = (dropX ?? 240) + offset;
    const y = (dropY ?? 185) + offset;
    offset += 36;

    if (file.type.startsWith('image/')) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      await api.createArtifact(state.roomId, {
        type: 'image',
        title: `🖼 ${file.name.slice(0, 26)}`,
        content: '拖拽上传拍立得参考图',
        color: '#FFFFFF',
        x,
        y,
        metadata: { dataUrl },
        authorId: me.id,
      });
      showToast(`🖼 已贴上拍立得：${file.name}`);
    } else {
      const textSnippet = await file.text().catch(() => '');
      await api.createArtifact(state.roomId, {
        type: 'sticky',
        title: `📎 ${file.name.slice(0, 26)}`,
        content: textSnippet.trim().slice(0, 220) || `参考资料文件：${file.name}`,
        color: '#E0F2FE',
        x,
        y,
        authorId: me.id,
      });
      showToast(`📎 已贴上资料卡：${file.name}`);
    }
  }
}

function startSpatialVoiceCapture(anchorIds) {
  activeSpatialAnchorIds = anchorIds;
  const hud = document.getElementById('spatialVoiceHud');
  const label = document.getElementById('spatialVoiceLabel');
  const firstCard = state.artifacts.find((a) => a.id === anchorIds[0]);
  const targetTitle = firstCard
    ? (firstCard.title || firstCard.content).slice(0, 14)
    : '当前讨论背景';

  anchorIds.forEach((id) => {
    document.getElementById(`card-${id}`)?.classList.add('is-voice-target');
  });

  if (label) {
    label.textContent = anchorIds.length
      ? `🎙 正在指着「${targetTitle}」说话…（松开 Space 发送）`
      : '🎙 正在录制破冰背景语音…（松开 Space 发送）';
  }
  hud?.classList.remove('hidden');

  voiceController.start({
    onInterim: (txt) => {
      if (label && txt) {
        label.textContent = `🎙 「${txt.slice(0, 34)}」`;
      }
    },
  });
}

async function finishSpatialVoiceCapture(cancelled = false) {
  const hud = document.getElementById('spatialVoiceHud');
  hud?.classList.add('hidden');
  document
    .querySelectorAll('.desk-card.is-voice-target')
    .forEach((el) => el.classList.remove('is-voice-target'));

  if (cancelled) {
    voiceController.stop();
    activeSpatialAnchorIds = [];
    return;
  }

  const { text, durationMs } = voiceController.finish();
  const anchors = [...activeSpatialAnchorIds];
  activeSpatialAnchorIds = [];

  let finalContent = text;
  if (!finalContent) {
    const targetCard = state.artifacts.find((a) => a.id === anchors[0]);
    finalContent = targetCard
      ? `针对「${(targetCard.title || targetCard.content).slice(0, 16)}」补充一点：建议明确异常边界降级策略，并本周五前完成联调验证。`
      : '今天我们聚焦把核心方案拍板定下来，理清技术选型、排期边界和各自负责的行动项。';
  }

  const me = getCurrentParticipant();
  await api.postMessage(state.roomId, {
    senderId: me.id,
    inputModality: anchors.length > 0 ? 'spatial_voice' : 'voice_ptt',
    voiceDurationMs: durationMs,
    anchorArtifactIds: anchors,
    content: finalContent,
  });
  if (anchors.length > 0) {
    notifyQuestProgress('spatial_voice_sent');
  }
  showToast(anchors.length > 0 ? '🎙 空间语音已绑定目标卡片并上墙' : '🎙 语音条已发送');
}

function toggleObsidianStarLayout(forceVal = null, spotlightCardId = null) {
  const next = forceVal !== null ? Boolean(forceVal) : !state.starLayoutOn;
  if (next === state.starLayoutOn && !spotlightCardId) {
    refreshAllUi();
    return;
  }
  state.starLayoutOn = next;
  state.starHoveredId = null;
  state.starPinnedId = null;
  state.starDraggingId = null;

  if (state.starLayoutOn) {
    state.savedFreeformCoords = {};
    state.artifacts.forEach((c) => {
      state.savedFreeformCoords[c.id] = { x: c.x, y: c.y };
    });
    resetConstellationPhysicsFromCards(true);
    showToast('🕸 已开启「星图组织」：三层向心引力星轨 × Obsidian 星点（0 重叠）');
  } else {
    state.artifacts.forEach((c) => {
      const saved = state.savedFreeformCoords[c.id];
      if (saved) {
        c.x = saved.x;
        c.y = saved.y;
      }
    });
    if (!spotlightCardId) {
      showToast('🖐 已还原之前的自由桌面摆放坐标');
    }
  }

  refreshAllUi();
  setTimeout(() => pluckAllVisibleLinks(), 50);

  if (!state.starLayoutOn && spotlightCardId) {
    highlightSourceCards([spotlightCardId]);
    requestAnimationFrame(() => {
      activateInlineCardEdit(spotlightCardId, false);
    });
    showToast('✨ 已回到自由桌面并定位到该便签，可直接修改文字');
    setTimeout(() => highlightSourceCards([]), 2400);
  }
}

function wireInteractiveEvents() {
  const vp = document.getElementById('studioViewport');
  const dropOverlay = document.getElementById('canvasDropOverlay');

  // Track pointer position on canvas for live elastic rubber-band wire preview
  vp?.addEventListener('pointermove', (ev) => {
    if (!state.linkingFromId) return;
    const rect = vp.getBoundingClientRect();
    state.pointerCanvasX = (ev.clientX - rect.left - state.panX) / state.scale;
    state.pointerCanvasY = (ev.clientY - rect.top - state.panY) / state.scale;
  });

  // Double-click empty Freeform Canvas -> Immediately create sticky & inline edit!
  vp?.addEventListener('dblclick', async (ev) => {
    if (state.viewMode !== 'freeform' || !state.roomId) return;
    if (
      ev.target.closest(
        '.desk-card, .constellation-node, .causal-node-card, .link-capsule, .cold-start-card, button, input, textarea'
      )
    ) {
      return;
    }
    const rect = vp.getBoundingClientRect();
    const cx = Math.round((ev.clientX - rect.left - state.panX) / state.scale - 125);
    const cy = Math.round((ev.clientY - rect.top - state.panY) / state.scale - 68);
    await createQuickStickyOnDesk({ x: cx, y: cy, autoFocus: !state.starLayoutOn });
  });

  // Drag & Drop Files / Images directly onto Freeform Canvas
  let dragDepth = 0;
  vp?.addEventListener('dragenter', (ev) => {
    if (!ev.dataTransfer?.types?.includes('Files')) return;
    ev.preventDefault();
    dragDepth += 1;
    dropOverlay?.classList.remove('hidden');
  });
  vp?.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer?.types?.includes('Files')) ev.preventDefault();
  });
  vp?.addEventListener('dragleave', (ev) => {
    if (!ev.dataTransfer?.types?.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay?.classList.add('hidden');
  });
  vp?.addEventListener('drop', async (ev) => {
    if (!ev.dataTransfer?.files?.length) return;
    ev.preventDefault();
    dragDepth = 0;
    dropOverlay?.classList.add('hidden');
    const rect = vp.getBoundingClientRect();
    const dx = Math.round((ev.clientX - rect.left - state.panX) / state.scale - 125);
    const dy = Math.round((ev.clientY - rect.top - state.panY) / state.scale - 75);
    await handleDroppedFilesOntoDesk(ev.dataTransfer.files, dx, dy);
  });

  vp?.addEventListener('pointerdown', (ev) => {
    if (
      ev.button !== 0 ||
      ev.target.closest(
        '.desk-card, .constellation-node, .causal-node-card, .link-capsule, .cold-start-card, button, input'
      )
    ) {
      return;
    }
    if (state.starPinnedId) {
      state.starPinnedId = null;
      document
        .querySelectorAll('.constellation-node.is-pinned')
        .forEach((n) => n.classList.remove('is-pinned'));
      applyConstellationEgoFocus();
    }
    if (state.activeAgentPickerCardId) {
      state.activeAgentPickerCardId = null;
      refreshAllUi();
    }
    state.selectedArtifactIds.clear();
    document
      .querySelectorAll('.desk-card.is-selected')
      .forEach((n) => n.classList.remove('is-selected'));

    vp.classList.add('panning');
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = state.panX;
    const oy = state.panY;

    const onMove = (mev) => {
      state.panX = Math.round(ox + (mev.clientX - sx));
      state.panY = Math.round(oy + (mev.clientY - sy));
      applyViewportTransform();
    };
    const onUp = () => {
      vp.classList.remove('panning');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  vp?.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY < 0 ? 0.06 : -0.06;
      state.scale = Math.max(0.45, Math.min(1.6, Number((state.scale + delta).toFixed(2))));
      applyViewportTransform();
    },
    { passive: false }
  );

  document.getElementById('zoomInBtn')?.addEventListener('click', () => {
    state.scale = Math.min(1.6, Number((state.scale + 0.1).toFixed(2)));
    applyViewportTransform();
  });
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
    state.scale = Math.max(0.45, Number((state.scale - 0.1).toFixed(2)));
    applyViewportTransform();
  });
  document.getElementById('zoomFitBtn')?.addEventListener('click', fitViewportToContent);

  // 3 Peer Views Switcher (Does NOT stop Spotlight Onboarding!)
  document.querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.getAttribute('data-view') || 'freeform';
      refreshAllUi();
    });
  });

  document.getElementById('staleBannerBtn')?.addEventListener('click', () => {
    state.viewMode = 'causal';
    refreshAllUi();
  });

  document.getElementById('starLayoutBtn')?.addEventListener('click', () => {
    toggleObsidianStarLayout();
  });

  document.getElementById('starOrbitModeBtn')?.addEventListener('click', () => {
    state.starSubStyle = 'orbit';
    refreshAllUi();
    showToast('🪐 已切换为「同心星轨」：核心焦点沉入靶心，强/弱关联分环围绕');
  });

  document.getElementById('starFreeCloudModeBtn')?.addEventListener('click', () => {
    state.starSubStyle = 'freecloud';
    refreshAllUi();
    showToast('🔮 已切换为「自由星云」：无轨道纯力导向星团');
  });

  document.getElementById('microCursorToggleBtn')?.addEventListener('click', (ev) => {
    state.showMicroCursors = !state.showMicroCursors;
    ev.currentTarget.classList.toggle('active', state.showMicroCursors);
    ev.currentTarget.setAttribute('aria-pressed', String(state.showMicroCursors));
    renderAmbientPresenceCursors();
  });

  // Top-Left Host Digest Dynamic Island Toggle
  document.getElementById('hostDigestPill')?.addEventListener('click', () => {
    state.digestExpanded = true;
    renderHostDigestIsland();
  });
  document.getElementById('closeHostDigestBtn')?.addEventListener('click', () => {
    state.digestExpanded = false;
    renderHostDigestIsland();
  });

  // Top-Right Prominent Left-End Uncircled Chevron Toggles (User List & Agent List)
  const toggleUsers = () => {
    state.usersListCollapsed = !state.usersListCollapsed;
    renderTopHud();
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  };
  document.getElementById('toggleUsersListBtn')?.addEventListener('click', toggleUsers);
  document.getElementById('usersCollapsedSummary')?.addEventListener('click', () => {
    state.usersListCollapsed = false;
    renderTopHud();
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  });

  const toggleAgents = () => {
    state.agentsListCollapsed = !state.agentsListCollapsed;
    renderRoleStripAndHandBubble();
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  };
  document.getElementById('toggleAgentsListBtn')?.addEventListener('click', toggleAgents);
  document.getElementById('agentsCollapsedSummary')?.addEventListener('click', () => {
    state.agentsListCollapsed = false;
    renderRoleStripAndHandBubble();
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  });

  const openLauncher = () => navigateToNewLauncher();
  document.getElementById('quickNewRoomBtn')?.addEventListener('click', openLauncher);

  document.getElementById('resetStarterBtn')?.addEventListener('click', async () => {
    const me = getCurrentParticipant();
    const res = await api.resetStarterRoom(state.roomId, {
      creatorName: me.name || '林知夏',
      creatorAvatar: me.avatar || '🦊',
      creatorColor: me.color || '#4F46E5',
    });
    if (res.participantId && res.participantToken) {
      saveRoomParticipantChoice(state.roomId, res.participantId, res.participantToken);
    }
    await loadAndEnterRoom(state.roomId);
    startOnboardingQuest(0);
    showToast('↺ 已重置新手案例并重新开启 8 步聚光灯引导！');
  });

  document.getElementById('roomSwitchBtn')?.addEventListener('click', async () => {
    const menu = document.getElementById('roomSwitchMenu');
    if (!menu) return;
    if (!menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      return;
    }
    const res = await api.listRooms().catch(() => ({ rooms: [] }));
    state.knownRooms = res.rooms || [];
    const merged = [...getLocalRecentRooms(), ...state.knownRooms];
    const seen = new Set();
    const items = [];
    for (const r of merged) {
      if (r?.roomId && !seen.has(r.roomId)) {
        seen.add(r.roomId);
        items.push(r);
      }
    }

    menu.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:#78716C;padding:4px 8px;">切换讨论桌面</div>
      ${items
        .map(
          (r) => `
        <button type="button" class="hud-btn" style="width:100%;justify-content:space-between;border-radius:8px;padding:6px 8px;" data-switch-rid="${escapeHtml(r.roomId)}">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:185px;">${escapeHtml(r.title)}</span>
          ${r.roomId === state.roomId ? '<span style="color:#059669;">●</span>' : ''}
        </button>
      `
        )
        .join('')}
      <div style="border-top:1px solid rgba(28,25,23,0.08);margin-top:4px;padding-top:4px;">
        <button id="menuCreateRoomBtn" type="button" class="hud-btn" style="width:100%;color:#4F46E5;">＋ 新建圆桌桌面…</button>
      </div>
    `;
    menu.classList.remove('hidden');

    menu.querySelectorAll('[data-switch-rid]').forEach((b) => {
      b.addEventListener('click', () => {
        menu.classList.add('hidden');
        loadAndEnterRoom(b.getAttribute('data-switch-rid'), { pushHistory: true });
      });
    });
    menu.querySelector('#menuCreateRoomBtn')?.addEventListener('click', () => {
      menu.classList.add('hidden');
      openLauncher();
    });
  });

  // Cute Emoji Join Seat Modal (`+ 入座`)
  document.getElementById('joinSeatBtn')?.addEventListener('click', () => {
    let rollIdx = Math.floor(Math.random() * SIMULATED_PERSONAS.length);
    let chosenEmoji = SIMULATED_PERSONAS[rollIdx].avatar;
    let chosenColor = SIMULATED_PERSONAS[rollIdx].color;

    openCenterModal(
      `
      <h3 style="margin:0 0 8px;">👋 选一枚可爱头像入座圆桌</h3>
      <p style="margin:0 0 12px;font-size:12px;color:#57534E;">
        入座自动签发专属个人凭证（7 天有效）；活跃成员 ≥ 2 人时自动切换为「多人举手不刷屏」模式。
      </p>

      <div class="form-field">
        <label>可爱风 Emoji 头像</label>
        <div class="emoji-grid" id="joinEmojiGrid">
          ${CUTE_EMOJI_POOL.slice(0, 15)
            .map(
              (em) => `
            <button
              type="button"
              class="emoji-pick-cell ${em.emoji === chosenEmoji ? 'selected' : ''}"
              style="background:${escapeHtml(em.bg)};"
              data-join-emoji="${escapeHtml(em.emoji)}"
              data-join-color="${escapeHtml(em.color)}"
            >${escapeHtml(em.emoji)}</button>
          `
            )
            .join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px;">
        <div class="form-field">
          <label>你的昵称</label>
          <div style="display:flex;gap:6px;">
            <input id="joinNameInput" class="form-input" value="${escapeHtml(SIMULATED_PERSONAS[rollIdx].name)}" placeholder="输入昵称…" />
            <button id="joinDiceBtn" type="button" class="btn btn-xs btn-subtle" title="随机换昵称">🎲</button>
          </div>
        </div>
        <div class="form-field">
          <label>角色头衔</label>
          <input id="joinTitleInput" class="form-input" value="${escapeHtml(SIMULATED_PERSONAS[rollIdx].role)}" />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
        <button id="cancelJoinBtn" type="button" class="btn btn-subtle">取消</button>
        <button id="confirmJoinBtn" type="button" class="btn btn-primary">入座并切换为我的视角</button>
      </div>
      `,
      (modal) => {
        modal.querySelector('#cancelJoinBtn')?.addEventListener('click', closeCenterModal);

        modal.querySelectorAll('[data-join-emoji]').forEach((btn) => {
          btn.addEventListener('click', () => {
            chosenEmoji = btn.getAttribute('data-join-emoji') || '🦊';
            chosenColor = btn.getAttribute('data-join-color') || '#4F46E5';
            modal
              .querySelectorAll('[data-join-emoji]')
              .forEach((b) => b.classList.toggle('selected', b === btn));
          });
        });

        modal.querySelector('#joinDiceBtn')?.addEventListener('click', () => {
          rollIdx = (rollIdx + 1) % SIMULATED_PERSONAS.length;
          const p = SIMULATED_PERSONAS[rollIdx];
          chosenEmoji = p.avatar;
          chosenColor = p.color;
          const nInp = modal.querySelector('#joinNameInput');
          const tInp = modal.querySelector('#joinTitleInput');
          if (nInp) nInp.value = p.name;
          if (tInp) tInp.value = p.role;
          modal.querySelectorAll('[data-join-emoji]').forEach((b) => {
            b.classList.toggle('selected', b.getAttribute('data-join-emoji') === chosenEmoji);
          });
        });

        modal.querySelector('#confirmJoinBtn')?.addEventListener('click', async () => {
          const name = modal.querySelector('#joinNameInput')?.value?.trim();
          const roleTitle = modal.querySelector('#joinTitleInput')?.value?.trim() || '协作者';
          if (!name) {
            showToast('请输入昵称');
            return;
          }
          const res = await api.joinRoom(
            state.roomId,
            {
              name,
              roleTitle,
              avatar: chosenEmoji,
              color: chosenColor,
            },
            true
          );
          state.currentParticipantId = res.participant.id;
          state.currentParticipantToken = res.participantToken;
          saveRoomParticipantChoice(state.roomId, res.participant.id, res.participantToken);
          upsertById(state.participants, res.participant);
          if (state.roomMeta) {
            state.roomMeta.pacingMode = res.pacingMode;
            state.roomMeta.activeHumanCount = res.activeHumanCount;
          }
          closeCenterModal();
          refreshAllUi();
          showToast(`欢迎入座，${res.participant.avatar} ${res.participant.name}！`);
        });
      }
    );
  });

  document.getElementById('configRolesBtn')?.addEventListener('click', openRoleConfiguratorDrawer);
  document.getElementById('openMcpDrawerBtn')?.addEventListener('click', openMcpConnectorDrawer);
  document.getElementById('finalizeBtn')?.addEventListener('click', () => {
    stopOnboardingQuest();
    openFinalizeModal({
      onFinalized: (shareId, shareToken) =>
        openSharePageOverlay(shareId, shareToken, {
          pushHistory: true,
          onCloseShare: (backRoomId) => {
            if (backRoomId) {
              history.pushState({}, '', `/room/${encodeURIComponent(backRoomId)}`);
            } else {
              navigateToHome();
            }
          },
        }),
    });
  });

  document.getElementById('coldStartVoiceBtn')?.addEventListener('click', () => {
    startSpatialVoiceCapture([]);
  });
  document.getElementById('coldStartPasteBtn')?.addEventListener('click', openPasteOrLinkModal);
  document.getElementById('coldStartMcpBtn')?.addEventListener('click', () => {
    if (state.mcpConnectInfo?.preMeetingPrompt) {
      copyText(state.mcpConnectInfo.preMeetingPrompt, '🔌 已复制本房 MCP 投递指令');
    } else {
      openMcpConnectorDrawer();
    }
  });

  document.getElementById('spatialVoiceSimBtn')?.addEventListener('click', () => {
    const first = state.artifacts.find((a) => a.id === activeSpatialAnchorIds[0]);
    voiceController.injectSimulatedText(
      first
        ? `针对「${(first.title || first.content).slice(0, 14)}」补充：需要加上断线幂等去重校验，避免弱网重复写入。`
        : '今天我们要在 15 分钟内拍板新网关方案，明确采用 SSE 还是 WebSocket 并拆清周五前的排期。'
    );
  });
  document.getElementById('spatialVoiceSendBtn')?.addEventListener('click', () =>
    finishSpatialVoiceCapture(false)
  );
  document.getElementById('spatialVoiceCancelBtn')?.addEventListener('click', () =>
    finishSpatialVoiceCapture(true)
  );

  document.getElementById('cancelLinkingBtn')?.addEventListener('click', () => {
    state.linkingFromId = null;
    document.getElementById('linkingModeBanner')?.classList.add('hidden');
  });

  // Bottom Creation Dock (Zero-Modal Instant Sticky + Voice + Link + Polaroid + Random Spark + Vibe Cheers!)
  document.getElementById('dockAddStickyBtn')?.addEventListener('click', async () => {
    if (state.viewMode !== 'freeform') {
      state.viewMode = 'freeform';
      refreshAllUi();
    }
    await createQuickStickyOnDesk({ autoFocus: true });
  });

  document.getElementById('dockVoiceStickyBtn')?.addEventListener('click', openVoiceStickyModal);
  document.getElementById('dockAddLinkBtn')?.addEventListener('click', openPasteOrLinkModal);

  document.getElementById('dockImageInput')?.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    handleDroppedFilesOntoDesk([file]);
    ev.target.value = '';
  });

  document.getElementById('dockRandomSparkBtn')?.addEventListener('click', async () => {
    if (state.viewMode !== 'freeform') state.viewMode = 'freeform';
    const spark = RANDOM_DESK_SPARKS[randomSparkCursor % RANDOM_DESK_SPARKS.length];
    randomSparkCursor += 1;
    await createQuickStickyOnDesk({
      title: spark.title,
      content: spark.content,
      color: spark.color,
      autoFocus: false,
    });
    showToast(`🎲 已抛出一张灵感便签：${spark.title}`);
  });

  document.getElementById('dockAddConsensusBtn')?.addEventListener('click', () =>
    openConsensusModal(null)
  );

  document.querySelectorAll('[data-vibe-emoji]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const em = btn.getAttribute('data-vibe-emoji') || '🎉';
      spawnEmojiFountain(ev.clientX, ev.clientY, em, 7);
      if (em === '🎉') launchConfetti();
    });
  });

  const sendChatText = async () => {
    const input = document.getElementById('airInput');
    const text = input?.value?.trim();
    if (!text || !state.roomId) return;
    input.value = '';
    const me = getCurrentParticipant();
    if (/@[A-Za-z0-9_\u4e00-\u9fa5]+/.test(text)) {
      notifyQuestProgress('agent_summoned');
    }
    await api.postMessage(state.roomId, {
      senderId: me.id,
      inputModality: 'text',
      content: text,
    });
  };

  document.getElementById('sendAirMsgBtn')?.addEventListener('click', sendChatText);
  document.getElementById('airInput')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      sendChatText();
    }
  });

  document.getElementById('quickMentionBtn')?.addEventListener('click', () => {
    const input = document.getElementById('airInput');
    if (input) {
      input.value += '@spark ';
      input.focus();
    }
  });

  const pttBar = document.getElementById('pttRecordingBar');
  const pttStatus = document.getElementById('pttStatusText');

  document.getElementById('pttMicBtn')?.addEventListener('click', () => {
    pttBar?.classList.remove('hidden');
    if (pttStatus) pttStatus.textContent = '🎙 正在聆听语音条…';
    voiceController.start({
      onInterim: (txt) => {
        if (pttStatus && txt) pttStatus.textContent = `🎙 ${txt.slice(0, 28)}`;
      },
    });
  });

  document.getElementById('pttSimFillBtn')?.addEventListener('click', () => {
    voiceController.injectSimulatedText(
      '我补充一条关键结论：对外分享页默认带只读凭证并附带已排除方案避坑附录，方便下游直接拉进 Cursor 开工。'
    );
  });

  document.getElementById('pttFinishBtn')?.addEventListener('click', async () => {
    pttBar?.classList.add('hidden');
    const { text, durationMs } = voiceController.finish();
    const content =
      text || '建议我们先把核心决策锁定下来，再让各自 PA 认领对应的行动项。';
    const me = getCurrentParticipant();
    await api.postMessage(state.roomId, {
      senderId: me.id,
      inputModality: 'voice_ptt',
      voiceDurationMs: durationMs,
      content,
    });
  });

  document.getElementById('toggleAirStreamBtn')?.addEventListener('click', () => {
    document.getElementById('airStreamPanel')?.classList.add('hidden');
    document.getElementById('airStreamCollapsedBtn')?.classList.remove('hidden');
    document.getElementById('bottomDockRail')?.classList.add('air-collapsed');
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  });
  document.getElementById('airStreamCollapsedBtn')?.addEventListener('click', () => {
    document.getElementById('airStreamCollapsedBtn')?.classList.add('hidden');
    document.getElementById('airStreamPanel')?.classList.remove('hidden');
    document.getElementById('bottomDockRail')?.classList.remove('air-collapsed');
    if (state.tourActive) requestAnimationFrame(() => positionSpotlightElements());
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth < 1280 && (!state.usersListCollapsed || !state.agentsListCollapsed)) {
      state.usersListCollapsed = true;
      state.agentsListCollapsed = true;
      renderTopHud();
      renderRoleStripAndHandBubble();
    }
  });

  window.addEventListener('paste', async (ev) => {
    if (isEditableFocus()) return;
    const items = ev.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          await handleDroppedFilesOntoDesk([blob]);
          return;
        }
      }
    }
    const text = ev.clipboardData?.getData('text/plain');
    if (text) {
      ev.preventDefault();
      await handleSmartPasteTextOrUrl(text);
    }
  });

  let spaceVoiceHolding = false;
  window.addEventListener('keydown', (ev) => {
    if (isEditableFocus()) return;

    if (ev.code === 'Space' && !ev.repeat) {
      const targetIds = state.hoveredArtifactId
        ? [state.hoveredArtifactId]
        : state.selectedArtifactIds.size > 0
          ? [...state.selectedArtifactIds]
          : state.artifacts.length === 0 && state.messages.length === 0
            ? []
            : null;

      if (targetIds !== null) {
        ev.preventDefault();
        spaceVoiceHolding = true;
        startSpatialVoiceCapture(targetIds);
      }
      return;
    }

    if (ev.key === '1') {
      state.viewMode = 'freeform';
      refreshAllUi();
    } else if (ev.key === '2') {
      state.viewMode = 'cluster';
      refreshAllUi();
    } else if (ev.key === '3') {
      state.viewMode = 'causal';
      refreshAllUi();
    } else if (ev.key === 'Escape') {
      state.linkingFromId = null;
      state.activeAgentPickerCardId = null;
      state.selectedArtifactIds.clear();
      document.getElementById('linkingModeBanner')?.classList.add('hidden');
      document.getElementById('roomSwitchMenu')?.classList.add('hidden');
      stopOnboardingQuest();
      closeCenterModal();
      closeSideDrawer();
      if (spaceVoiceHolding) {
        spaceVoiceHolding = false;
        finishSpatialVoiceCapture(true);
      }
      refreshAllUi();
    }
  });

  window.addEventListener('keyup', (ev) => {
    if (ev.code === 'Space' && spaceVoiceHolding) {
      spaceVoiceHolding = false;
      finishSpatialVoiceCapture(false);
    }
  });

  window.addEventListener('omind:open-share', (ev) => {
    if (ev.detail?.shareId) {
      openSharePageOverlay(ev.detail.shareId, ev.detail.shareToken || '', {
        pushHistory: true,
        onCloseShare: (backRoomId) => {
          if (backRoomId) {
            history.pushState({}, '', `/room/${encodeURIComponent(backRoomId)}`);
          } else if (state.roomId) {
            history.pushState({}, '', `/room/${encodeURIComponent(state.roomId)}`);
          } else {
            navigateToHome();
          }
        },
      });
    }
  });

  window.addEventListener('omind:edit-consensus', (ev) => {
    if (ev.detail?.item) openConsensusModal(ev.detail.item);
  });

  document.getElementById('modalBackdrop')?.addEventListener('click', closeCenterModal);
}

function openPasteOrLinkModal() {
  openCenterModal(
    `
    <h3 style="margin:0 0 8px;">📋 粘贴外部链接、文本或前序定稿分享链接</h3>
    <p style="margin:0 0 12px;font-size:12px;color:#57534E;">
      若粘贴上一场定稿的 <code>/share/shr_...?t=st_...</code> 链接，将自动解析为<strong>「🔗 前序会议参考卡」</strong>并在冲突时自动拉橙色预警虚线！
    </p>
    <textarea id="pasteModalInput" class="form-input" rows="3" placeholder="粘贴 https://kokowork.top/share/shr_...?t=st_... 或任意外部链接 / 文本"></textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
      <button id="cancelPasteModalBtn" type="button" class="btn btn-subtle">取消</button>
      <button id="confirmPasteModalBtn" type="button" class="btn btn-primary">放到桌面上</button>
    </div>
    `,
    (modal) => {
      modal.querySelector('#cancelPasteModalBtn')?.addEventListener('click', closeCenterModal);
      modal.querySelector('#confirmPasteModalBtn')?.addEventListener('click', async () => {
        const val = modal.querySelector('#pasteModalInput')?.value?.trim();
        if (!val) return;
        closeCenterModal();
        await handleSmartPasteTextOrUrl(val);
      });
    }
  );
}

function parseAppRoute(loc = location) {
  const pathname = loc.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(loc.search);

  const pathShare = pathname.match(/^\/(?:share|s)\/([^/]+)$/)?.[1];
  const queryShare = params.get('share') || params.get('shareId');
  if (pathShare || queryShare) {
    return {
      page: 'share',
      shareId: decodeURIComponent(pathShare || queryShare),
      shareToken: params.get('t') || params.get('shareToken') || '',
    };
  }

  if (pathname === '/starter' || params.get('starter') === '1') {
    return { page: 'starter' };
  }

  if (pathname === '/new' || params.get('new') === '1') {
    return { page: 'new' };
  }

  const pathRoom = pathname.match(/^\/(?:room|r)\/([^/]+)$/)?.[1];
  const queryRoom = params.get('room') || params.get('roomId');
  if (pathRoom || queryRoom) {
    return {
      page: 'room',
      roomId: decodeURIComponent(pathRoom || queryRoom),
      tour: params.get('tour') === '1',
    };
  }

  return { page: 'home' };
}

async function syncRouteFromLocation() {
  const route = parseAppRoute(location);

  if (route.page === 'share') {
    document.getElementById('welcomeStudioOverlay')?.classList.add('hidden');
    document.getElementById('launcherOverlay')?.classList.add('hidden');
    if (!state.roomId) {
      document.getElementById('app')?.classList.add('hidden');
    }
    await openSharePageOverlay(route.shareId, route.shareToken, {
      pushHistory: false,
      onCloseShare: (backRoomId) => {
        if (backRoomId) {
          history.pushState({}, '', `/room/${encodeURIComponent(backRoomId)}`);
        } else {
          navigateToHome();
        }
      },
    });
    return;
  }

  if (route.page === 'new') {
    navigateToNewLauncher({ replace: true });
    return;
  }

  if (route.page === 'starter') {
    await loadAndEnterRoom('room_starter_v5', {
      pushHistory: false,
      customPath: '/starter',
    });
    startOnboardingQuest(0);
    return;
  }

  if (route.page === 'room') {
    try {
      await loadAndEnterRoom(route.roomId, { pushHistory: false });
      if (route.tour || route.roomId === 'room_starter_v5') {
        startOnboardingQuest(0);
      }
      return;
    } catch {
      showToast(`桌面 ${route.roomId} 不存在，已返回首页`);
      navigateToHome({ replace: true });
      return;
    }
  }

  navigateToHome({ replace: true });
}

async function bootstrap() {
  initOnboardingSystem({
    onNavigateHome: () => navigateToHome({ replace: false }),
    onNavigateNew: () => navigateToNewLauncher({ replace: false }),
    onEnterRoomId: (rid, opts = {}) => loadAndEnterRoom(rid, opts),
    onOpenBlankLauncher: () => navigateToNewLauncher({ replace: false }),
    onOpenFinalizeModal: () =>
      openFinalizeModal({
        onFinalized: (shareId, shareToken) => {
          notifyQuestProgress('finalized');
          openSharePageOverlay(shareId, shareToken, {
            pushHistory: true,
            onCloseShare: (backRoomId) => {
              if (backRoomId) {
                history.pushState({}, '', `/room/${encodeURIComponent(backRoomId)}`);
              } else {
                navigateToHome();
              }
            },
          });
        },
      }),
    onOpenSeatInspector: (pid) =>
      openSeatInspectorDrawer(pid, { onIdentityChanged: () => refreshAllUi() }),
    onCreateQuickSticky: (opts) => createQuickStickyOnDesk(opts),
    onSummonCardAgent: (artId, opts) => handleSummonAgentOnCard(artId, opts),
    onPluckLinks: () => pluckAllVisibleLinks(),
    onToggleStarLayout: (forceVal) => toggleObsidianStarLayout(forceVal),
    onRefreshUi: () => refreshAllUi(),
  });

  wireInteractiveEvents();

  window.addEventListener('popstate', () => {
    syncRouteFromLocation();
  });

  await syncRouteFromLocation();
}

bootstrap();
