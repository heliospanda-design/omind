/**
 * Omind v5.3 — Spatial Canvas Renderer (V4 Tactile Freeform Studio × Option A Craft + 60fps Spring Physics)
 * Supports:
 *   1. `自由桌面`: Open dotted paper (no giant right-side box), double-click empty canvas to create & inline-edit sticky,
 *      double-click card/link to edit in place, 5-color pastel swatches + washi tape, card-level `🤖` & drag-drop Agent summon,
 *      60fps Hooke's law elastic spring wires + guitar-string pluck + live rubber-band linking, Host Digest Dynamic Island.
 *   2. `整理归类`: 4 Semantic Cluster Zones + Lockable Zone Consensus Header.
 *   3. `因果脉络`: Consensus DAG + Human Lock + Upstream Stale Alert + Inline Diff Proposal Resolution.
 *   4. `agent.cursor_flash` Bezier Micro-Cursor + Ambient Peer Presence Cursors.
 */

import { api } from './api.js';
import { notifyQuestProgress, positionSpotlightElements } from './onboarding.js';
import { escapeHtml, getCurrentParticipant, showToast, state } from './state.js';

const LINK_CLASS = {
  support: 'sem-evidence',
  derive: 'sem-derive',
  conflict: 'sem-conflict',
};

const LINK_COLORS = {
  support: '#059669',
  derive: '#7C3AED',
  conflict: '#D97706',
};

const LINK_LABELS = {
  support: '🟢',
  derive: '🟣',
  conflict: '🟠',
};

const PASTEL_SWATCHES = [
  { hex: '#FEF3C7', label: '奶油黄' },
  { hex: '#DCFCE7', label: '薄荷绿' },
  { hex: '#FFE4E6', label: '蜜桃粉' },
  { hex: '#EDE9FE', label: '薰衣草紫' },
  { hex: '#E0F2FE', label: '晴空蓝' },
];

// Per-link 60fps spring control state `{ cx, cy, vx, vy }`
const linkSprings = new Map();
const cardVelocities = new Map();
const currentDisplayCoords = new Map();
const rubberState = { cx: 420, cy: 280, vx: 0, vy: 0 };

// Mode 2 + 3 Obsidian Orbital Constellation Physics State
const starSimNodes = new Map(); // id -> { x, y, vx, vy, degree, strongDegree, tier }
let implicitWeakLinks = []; // { id, fromArtifactId, toArtifactId, sharedTopic }
const constellationCenter = { x: 510, y: 355 };

let springLoopStarted = false;
let presenceTimer = null;

const SPRING_STIFFNESS = 0.135;
const SPRING_DAMPING = 0.81;

const ZH_STOPWORDS = new Set([
  '的', '了', '和', '与', '在', '是', '有', '对', '把', '将', '及', '或', '等', '被', '让', '给',
  '可以', '这个', '这张', '我们', '已经', '进行', '一个', '目前', '直接', '支持', '通过', '如果',
  '需要', '尝试', '修改', '双击', '拖拽', '移动', '便签', '卡片', '方案', '讨论', '问题', '建议',
]);

const TOPIC_CLUSTERS = [
  { tag: '免注册体验', re: /(免注册|免登录|免登|注册墙|匿名|游客|手机号|验证码)/ },
  { tag: '首屏与破冰', re: /(首屏|引导|冷启动|破冰|聚光灯|上手|空白页|新手)/ },
  { tag: '留存与增长', re: /(留存|分享|转化|流失|实验|A\/B|数据|翻倍|增长)/i },
  { tag: '语音与互动', re: /(语音|对讲|麦克风|Space|空格|说话|秒贴)/i },
  { tag: '定稿与回放', re: /(定稿|收敛|回放|快照|导出|领走|凭证|PRD)/i },
  { tag: '风控与成本', re: /(风控|防刷|配额|成本|排期|工期|预算|红线|签字)/ },
  { tag: '桌面与草图', re: /(草图|线框|设计|白板|沙盒|案例桌面|拍立得)/ },
];

export function spawnEmojiFountain(clientX, clientY, emoji = '🔥', count = 5) {
  for (let i = 0; i < count; i += 1) {
    const sp = document.createElement('span');
    sp.className = 'emoji-fountain-spark';
    sp.textContent = emoji;
    sp.style.left = `${clientX + (Math.random() - 0.5) * 38}px`;
    sp.style.top = `${clientY - 8 + (Math.random() - 0.5) * 16}px`;
    document.body.appendChild(sp);
    setTimeout(() => sp.remove(), 880);
  }
}

export function pluckLink(linkId, impulseX = 0, impulseY = 24) {
  const sp = linkSprings.get(linkId);
  if (sp) {
    sp.vx += impulseX;
    sp.vy += impulseY;
  }
}

export function pluckAllVisibleLinks() {
  state.links.forEach((lk, idx) => {
    pluckLink(lk.id, (idx % 2 === 0 ? 1 : -1) * 16, 28);
  });
}

function deterministicTilt(idStr) {
  let hash = 0;
  const s = String(idStr || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return (((Math.abs(hash) % 25) - 12) / 10).toFixed(1);
}

export function applyViewportTransform() {
  const stage = document.getElementById('studioStage');
  if (stage) {
    stage.style.transform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.scale})`;
  }
  const pct = document.getElementById('zoomPctLabel');
  if (pct) pct.textContent = `${Math.round(state.scale * 100)}%`;
  if (state.tourActive) {
    requestAnimationFrame(() => positionSpotlightElements());
  }
}

export function fitViewportToContent() {
  state.panX = 48;
  state.panY = 86;
  state.scale = 0.92;
  applyViewportTransform();
}

function extractCardSemanticTokens(card) {
  const text = `${card.title || ''} ${card.content || ''} ${card.metadata?.verifiedBadge || ''} ${card.metadata?.confidenceLabel || ''}`;
  const tokens = new Set();

  for (const tc of TOPIC_CLUSTERS) {
    if (tc.re.test(text)) tokens.add(`topic:${tc.tag}`);
  }

  const enWords = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  enWords.forEach((w) => tokens.add(`en:${w}`));

  const zhChunks = text.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  for (const chunk of zhChunks) {
    for (let i = 0; i <= chunk.length - 2; i += 1) {
      const bi = chunk.slice(i, i + 2);
      if (!ZH_STOPWORDS.has(bi) && !ZH_STOPWORDS.has(bi[0]) && !ZH_STOPWORDS.has(bi[1])) {
        tokens.add(bi);
      }
    }
  }
  return tokens;
}

export function resetConstellationPhysicsFromCards(recenter = true) {
  if (recenter) {
    const vp = document.getElementById('studioViewport');
    const vpW = vp?.clientWidth || window.innerWidth || 1360;
    const vpH = vp?.clientHeight || window.innerHeight || 820;
    const rightReserve = !state.airCollapsed && vpW >= 1040 ? 316 : 24;
    const screenCx = Math.max(380, (vpW - rightReserve) * 0.52);
    const screenCy = Math.max(300, vpH * 0.53);
    constellationCenter.x = Math.round((screenCx - state.panX) / state.scale);
    constellationCenter.y = Math.round((screenCy - state.panY) / state.scale);
  }

  starSimNodes.clear();
  const total = Math.max(1, state.artifacts.length);
  state.artifacts.forEach((c, idx) => {
    const startX = Number(c.x || 320) + 128;
    const startY = Number(c.y || 240) + 72;
    const ang = (idx / total) * Math.PI * 2;
    starSimNodes.set(c.id, {
      x: startX,
      y: startY,
      vx: Math.cos(ang) * 5.5,
      vy: Math.sin(ang) * 5.5,
      degree: 1,
      strongDegree: 0,
      tier: 'outer',
    });
  });
  rebuildConstellationGraph();
}

export function rebuildConstellationGraph() {
  const cards = state.artifacts || [];
  const validIds = new Set(cards.map((c) => c.id));

  for (const existingId of Array.from(starSimNodes.keys())) {
    if (!validIds.has(existingId)) starSimNodes.delete(existingId);
  }

  cards.forEach((c, idx) => {
    if (!starSimNodes.has(c.id)) {
      const ang = ((idx + 1) / Math.max(1, cards.length)) * Math.PI * 2;
      starSimNodes.set(c.id, {
        x: constellationCenter.x + Math.cos(ang) * 260,
        y: constellationCenter.y + Math.sin(ang) * 180,
        vx: Math.cos(ang) * 4,
        vy: Math.sin(ang) * 4,
        degree: 1,
        strongDegree: 0,
        tier: 'outer',
      });
    }
  });

  const degMap = new Map(cards.map((c) => [c.id, 0]));
  const strongMap = new Map(cards.map((c) => [c.id, 0]));
  const pairSet = new Set();

  for (const lk of state.links) {
    if (!validIds.has(lk.fromArtifactId) || !validIds.has(lk.toArtifactId)) continue;
    const key = [lk.fromArtifactId, lk.toArtifactId].sort().join('::');
    pairSet.add(key);
    degMap.set(lk.fromArtifactId, (degMap.get(lk.fromArtifactId) || 0) + 2);
    degMap.set(lk.toArtifactId, (degMap.get(lk.toArtifactId) || 0) + 2);
    strongMap.set(lk.fromArtifactId, (strongMap.get(lk.fromArtifactId) || 0) + 1);
    strongMap.set(lk.toArtifactId, (strongMap.get(lk.toArtifactId) || 0) + 1);
  }

  // Build Obsidian-style implicit weak semantic threads from shared topics/keywords
  const tokenMap = new Map(cards.map((c) => [c.id, extractCardSemanticTokens(c)]));
  const scoredPairs = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i];
      const b = cards[j];
      const key = [a.id, b.id].sort().join('::');
      if (pairSet.has(key)) continue;

      const ta = tokenMap.get(a.id);
      const tb = tokenMap.get(b.id);
      let score = 0;
      let sharedTopic = '';
      for (const tok of ta) {
        if (tb.has(tok)) {
          if (tok.startsWith('topic:')) {
            score += 3;
            if (!sharedTopic) sharedTopic = tok.slice(6);
          } else {
            score += 1;
            if (!sharedTopic) sharedTopic = tok.replace(/^en:/, '');
          }
        }
      }
      if (score >= 2) {
        scoredPairs.push({ aId: a.id, bId: b.id, key, score, sharedTopic });
      }
    }
  }

  scoredPairs.sort((x, y) => y.score - x.score);
  const weakPerNode = new Map(cards.map((c) => [c.id, 0]));
  const nextWeak = [];

  for (const sp of scoredPairs) {
    const ca = weakPerNode.get(sp.aId) || 0;
    const cb = weakPerNode.get(sp.bId) || 0;
    if (ca >= 3 || cb >= 3) continue;
    pairSet.add(sp.key);
    weakPerNode.set(sp.aId, ca + 1);
    weakPerNode.set(sp.bId, cb + 1);
    degMap.set(sp.aId, (degMap.get(sp.aId) || 0) + 1);
    degMap.set(sp.bId, (degMap.get(sp.bId) || 0) + 1);
    nextWeak.push({
      id: `weak_${sp.aId}_${sp.bId}`,
      fromArtifactId: sp.aId,
      toArtifactId: sp.bId,
      sharedTopic: sp.sharedTopic || '语义脉络',
    });
  }

  // Rank nodes to determine Core Hub before tethering any zero-degree orphan
  const calcWeight = (c) => {
    const voteSum = Object.values(c.votes || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
    return (degMap.get(c.id) || 0) * 2 + (strongMap.get(c.id) || 0) * 3.5 + voteSum * 0.9;
  };
  const preliminarySorted = [...cards].sort((a, b) => calcWeight(b) - calcWeight(a));
  const hubCard = preliminarySorted[0];

  // Guarantee zero isolated orphan islands
  if (hubCard && cards.length > 1) {
    for (const c of cards) {
      if (c.id !== hubCard.id && (degMap.get(c.id) || 0) === 0) {
        const key = [c.id, hubCard.id].sort().join('::');
        if (!pairSet.has(key)) {
          pairSet.add(key);
          nextWeak.push({
            id: `weak_hub_${c.id}`,
            fromArtifactId: c.id,
            toArtifactId: hubCard.id,
            sharedTopic: '同桌议题',
          });
          degMap.set(c.id, 1);
          degMap.set(hubCard.id, (degMap.get(hubCard.id) || 0) + 1);
        }
      }
    }
  }

  implicitWeakLinks = nextWeak;

  // Assign Mode 3 Concentric Gravity Orbit Tiers: 'core' | 'inner' | 'outer'
  const sorted = [...cards].sort((a, b) => calcWeight(b) - calcWeight(a));
  const coreId = sorted[0]?.id;
  const innerQuota = Math.min(6, Math.max(3, Math.floor((cards.length - 1) * 0.48)));

  sorted.forEach((c, idx) => {
    const sim = starSimNodes.get(c.id);
    if (!sim) return;
    sim.degree = Math.max(1, degMap.get(c.id) || 1);
    sim.strongDegree = strongMap.get(c.id) || 0;
    if (c.id === coreId) {
      sim.tier = 'core';
    } else if (idx <= innerQuota || sim.strongDegree >= 1) {
      sim.tier = 'inner';
    } else {
      sim.tier = 'outer';
    }
  });
}

export function applyConstellationEgoFocus() {
  const stage = document.getElementById('studioStage');
  if (!stage) return;

  const focusId =
    state.viewMode === 'freeform' && state.starLayoutOn
      ? state.starHoveredId || state.starPinnedId
      : null;

  if (!focusId) {
    stage.classList.remove('has-constellation-ego');
    stage
      .querySelectorAll('.constellation-node')
      .forEach((el) => el.classList.remove('ego-keep', 'ego-primary', 'ego-neighbor'));
    stage
      .querySelectorAll('.sem-link-path, .weak-link-path')
      .forEach((el) => el.classList.remove('ego-edge'));
    stage.querySelectorAll('.link-capsule').forEach((el) => el.classList.remove('ego-cap'));
    return;
  }

  stage.classList.add('has-constellation-ego');
  const keepIds = new Set([focusId]);

  for (const lk of state.links) {
    const hit = lk.fromArtifactId === focusId || lk.toArtifactId === focusId;
    if (hit) {
      keepIds.add(lk.fromArtifactId);
      keepIds.add(lk.toArtifactId);
    }
    document.getElementById(`link-path-${lk.id}`)?.classList.toggle('ego-edge', hit);
    document.getElementById(`link-cap-${lk.id}`)?.classList.toggle('ego-cap', hit);
  }

  for (const wl of implicitWeakLinks) {
    const hit = wl.fromArtifactId === focusId || wl.toArtifactId === focusId;
    if (hit) {
      keepIds.add(wl.fromArtifactId);
      keepIds.add(wl.toArtifactId);
    }
    document.getElementById(`weak-path-${wl.id}`)?.classList.toggle('ego-edge', hit);
  }

  stage.querySelectorAll('.constellation-node').forEach((el) => {
    const nid = el.getAttribute('data-constellation-id');
    const keep = keepIds.has(nid);
    el.classList.toggle('ego-keep', keep);
    el.classList.toggle('ego-primary', nid === focusId);
    el.classList.toggle('ego-neighbor', keep && nid !== focusId);
  });
}

function resolveOrbVisualStyle(card, tier) {
  if (tier === 'core') {
    return {
      bg: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
      emoji: '🚀',
      tintHex: card.color || '#EEF2FF',
    };
  }
  if (card.type === 'pa_quote_card') {
    return { bg: 'linear-gradient(135deg, #059669, #10B981)', emoji: '📊', tintHex: '#ECFDF5' };
  }
  if (card.type === 'spark_card') {
    return { bg: 'linear-gradient(135deg, #7C3AED, #A78BFA)', emoji: '✨', tintHex: '#F5F3FF' };
  }
  if (card.type === 'signoff_card') {
    return { bg: 'linear-gradient(135deg, #E11D48, #FB7185)', emoji: '🛑', tintHex: '#FFF1F2' };
  }
  if (card.type === 'image') {
    return { bg: 'linear-gradient(135deg, #0284C7, #38BDF8)', emoji: '🖼️', tintHex: '#F0F9FF' };
  }
  if (card.type === 'prior_room_card' || card.type === 'link') {
    return { bg: 'linear-gradient(135deg, #0D9488, #2DD4BF)', emoji: '🔗', tintHex: '#F0FDFA' };
  }
  const hex = (card.color || '').toUpperCase();
  if (hex === '#DCFCE7') {
    return { bg: 'linear-gradient(135deg, #059669, #34D399)', emoji: '🌱', tintHex: '#F0FDF4' };
  }
  if (hex === '#FFE4E6') {
    return { bg: 'linear-gradient(135deg, #E11D48, #FB7185)', emoji: '⚡', tintHex: '#FFF1F2' };
  }
  if (hex === '#EDE9FE') {
    return { bg: 'linear-gradient(135deg, #7C3AED, #C084FC)', emoji: '💡', tintHex: '#FAF5FF' };
  }
  if (hex === '#E0F2FE') {
    return { bg: 'linear-gradient(135deg, #0284C7, #60A5FA)', emoji: '🧭', tintHex: '#F0F9FF' };
  }
  return {
    bg: 'linear-gradient(135deg, #D97706, #F59E0B)',
    emoji: '🗒️',
    tintHex: card.color || '#FFFBEB',
  };
}

function classifyCardForCluster(card) {
  if (card.type === 'signoff_card') return 'action';
  if (card.isRejected || card.metadata?.category === 'conflict') return 'conflict';
  if (
    card.type === 'prior_room_card' ||
    card.type === 'pa_quote_card' ||
    card.metadata?.category === 'context' ||
    card.metadata?.coldStartAnchor
  ) {
    return 'context';
  }
  if (/(待办|负责|排期|周五|提测|截止|已拍板|共识)/.test(`${card.title} ${card.content}`)) {
    return 'action';
  }
  return 'solution';
}

export function activateInlineCardEdit(artifactId, selectAll = false) {
  const cardEl = document.getElementById(`card-${artifactId}`);
  const bodyEl = cardEl?.querySelector('[data-inline-body]');
  if (!cardEl || !bodyEl) return;

  state.editingArtifactId = artifactId;
  bodyEl.setAttribute('contenteditable', 'true');
  bodyEl.focus();

  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(bodyEl);
  if (!selectAll) range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function highlightSourceCards(artifactIds = []) {
  state.highlightedArtifactIds = new Set(artifactIds.filter(Boolean));
  document.querySelectorAll('#deskCardsLayer .desk-card').forEach((el) => {
    const id = el.id.replace(/^card-/, '');
    el.classList.toggle('source-glow', state.highlightedArtifactIds.has(id));
  });
}

export function renderHostDigestIsland() {
  const summaryEl = document.getElementById('hostDigestSummary');
  const pillBtn = document.getElementById('hostDigestPill');
  const panelEl = document.getElementById('hostDigestPanel');
  const bodyEl = document.getElementById('hostDigestBody');
  if (!summaryEl || !pillBtn || !panelEl || !bodyEl) return;

  const linkCnt = state.links.length;
  const consCnt = state.consensusItems.length;
  if (state.viewMode === 'freeform' && state.starLayoutOn && state.artifacts.length > 0) {
    let innerCnt = 0;
    let outerCnt = 0;
    for (const sim of starSimNodes.values()) {
      if (sim.tier === 'inner') innerCnt += 1;
      else if (sim.tier === 'outer') outerCnt += 1;
    }
    summaryEl.textContent = `🕸 星图已聚合 · 1 引力核 / ${innerCnt} 内轨 / ${outerCnt} 外环（0 重叠）`;
  } else {
    summaryEl.textContent = `Host 实时梳理 · ${linkCnt} 脉络 / ${consCnt} 共识`;
  }

  const showInCanvas = state.viewMode === 'freeform' || state.viewMode === 'cluster';
  pillBtn.classList.toggle('hidden', !showInCanvas || state.digestExpanded);
  panelEl.classList.toggle('hidden', !showInCanvas || !state.digestExpanded);

  if (!state.digestExpanded) return;

  if (state.consensusItems.length === 0 && state.artifacts.length === 0) {
    bodyEl.innerHTML = `<div style="font-size:12px;color:#78716C;padding:6px 2px;">暂无共识条目，双击空白桌面写下想法后 Host 将自动梳理关联。</div>`;
    return;
  }

  bodyEl.innerHTML = state.consensusItems
    .slice(0, 6)
    .map((item) => {
      const refIds = (item.sourceRefs || [])
        .map((r) => r.id || r.artifactId)
        .filter(Boolean);
      const fallbackIds =
        refIds.length > 0 ? refIds : state.artifacts.slice(0, 2).map((a) => a.id);
      const badge =
        item.signoffStatus === 'pending_human_signoff'
          ? '🛑 待本人签字'
          : item.status === 'locked'
            ? '🔒 已拍板'
            : item.status === 'stale_upstream'
              ? '⚠️ 待复核'
              : '📝 草案';
      return `
        <div class="host-digest-item" data-glow-cards="${escapeHtml(fallbackIds.join(','))}">
          <div style="display:flex;justify-content:space-between;font-weight:700;color:#1C1917;margin-bottom:2px;">
            <span>${badge}</span>
            <span style="font-size:10.5px;color:#4F46E5;">悬停定位源卡 ↗</span>
          </div>
          <div style="color:#44403C;line-height:1.45;">${escapeHtml(item.content.slice(0, 68))}</div>
        </div>
      `;
    })
    .join('');

  bodyEl.querySelectorAll('[data-glow-cards]').forEach((row) => {
    const ids = (row.getAttribute('data-glow-cards') || '').split(',').filter(Boolean);
    row.addEventListener('mouseenter', () => highlightSourceCards(ids));
    row.addEventListener('mouseleave', () => highlightSourceCards([]));
    row.addEventListener('click', () => {
      const first = state.artifacts.find((a) => a.id === ids[0]);
      if (first) {
        state.viewMode = 'freeform';
        highlightSourceCards(ids);
        showToast('✨ 已定位高亮桌面关联源卡片');
      }
    });
  });
}

function getCardCenterCoords(cardId) {
  if (state.viewMode === 'freeform' && state.starLayoutOn) {
    const sim = starSimNodes.get(cardId);
    if (sim) return { x: sim.x, y: sim.y };
  }
  const pos = currentDisplayCoords.get(cardId);
  if (!pos) return null;
  const el = document.getElementById(`card-${cardId}`);
  const w = el?.offsetWidth || 256;
  const h = el?.offsetHeight || 148;
  return { x: pos.x + w / 2, y: pos.y + h / 2 };
}

function stepConstellationOrbitalPhysics() {
  const cards = state.artifacts || [];
  if (!cards.length) return;

  const nodesArr = [];
  for (const c of cards) {
    const sim = starSimNodes.get(c.id);
    if (sim) nodesArr.push({ id: c.id, sim });
  }
  if (!nodesArr.length) return;

  const innerCount = nodesArr.filter((n) => n.sim.tier === 'inner').length;
  const outerCount = nodesArr.filter((n) => n.sim.tier === 'outer').length;

  const innerRx = Math.max(230, Math.min(340, 175 + innerCount * 22));
  const innerRy = Math.round(innerRx * 0.68);
  const outerRx = Math.max(395, Math.min(560, innerRx + 155 + Math.max(0, outerCount - 4) * 18));
  const outerRy = Math.round(outerRx * 0.66);

  const cx = constellationCenter.x;
  const cy = constellationCenter.y;

  // Sync Concentric Gravity Orbit Rings DOM
  const ringCore = document.getElementById('orbitRingCore');
  const ringInner = document.getElementById('orbitRingInner');
  const ringOuter = document.getElementById('orbitRingOuter');
  if (ringCore && ringInner && ringOuter) {
    [ringCore, ringInner, ringOuter].forEach((r) => {
      r.style.left = `${cx}px`;
      r.style.top = `${cy}px`;
    });
    ringCore.style.width = '156px';
    ringCore.style.height = '156px';
    ringInner.style.width = `${innerRx * 2}px`;
    ringInner.style.height = `${innerRy * 2}px`;
    ringOuter.style.width = `${outerRx * 2}px`;
    ringOuter.style.height = `${outerRy * 2}px`;
  }

  // (1) Mode 3 Concentric Orbital Gravity OR Mode 2 Free-Cloud Center Gravity
  for (const { id, sim } of nodesArr) {
    if (id === state.starDraggingId) continue;
    if (state.starSubStyle === 'orbit') {
      if (sim.tier === 'core') {
        sim.vx += (cx - sim.x) * 0.095;
        sim.vy += (cy - sim.y) * 0.095;
      } else {
        const rx = sim.tier === 'inner' ? innerRx : outerRx;
        const ry = sim.tier === 'inner' ? innerRy : outerRy;
        const dx = sim.x - cx || 0.1;
        const dy = sim.y - cy || 0.1;
        const theta = Math.atan2(dy / ry, dx / rx);
        const tx = cx + Math.cos(theta) * rx;
        const ty = cy + Math.sin(theta) * ry;
        sim.vx += (tx - sim.x) * 0.056;
        sim.vy += (ty - sim.y) * 0.056;
      }
    } else {
      const g = 0.015 + sim.degree * 0.0028;
      sim.vx += (cx - sim.x) * g;
      sim.vy += (cy - sim.y) * g;
    }
  }

  // (2) Many-Body Repulsion along orbits
  for (let i = 0; i < nodesArr.length; i += 1) {
    for (let j = i + 1; j < nodesArr.length; j += 1) {
      const a = nodesArr[i];
      const b = nodesArr[j];
      const dx = b.sim.x - a.sim.x;
      const dy = b.sim.y - a.sim.y;
      const distSq = Math.max(900, dx * dx + dy * dy);
      const dist = Math.sqrt(distSq);
      const repulse = 4500 / distSq;
      const fx = (dx / dist) * repulse;
      const fy = (dy / dist) * repulse;
      const lockCoreA = state.starSubStyle === 'orbit' && a.sim.tier === 'core';
      const lockCoreB = state.starSubStyle === 'orbit' && b.sim.tier === 'core';
      if (a.id !== state.starDraggingId && !lockCoreA) {
        a.sim.vx -= fx;
        a.sim.vy -= fy;
      }
      if (b.id !== state.starDraggingId && !lockCoreB) {
        b.sim.vx += fx;
        b.sim.vy += fy;
      }
    }
  }

  // (3) Dual-Layer Semantic Link Attraction (Strong + Implicit Weak Threads)
  const applySpringEdge = (srcId, tgtId, ideal, k) => {
    const a = starSimNodes.get(srcId);
    const b = starSimNodes.get(tgtId);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const delta = (dist - ideal) * k;
    const fx = (dx / dist) * delta;
    const fy = (dy / dist) * delta;
    const lockCoreA = state.starSubStyle === 'orbit' && a.tier === 'core';
    const lockCoreB = state.starSubStyle === 'orbit' && b.tier === 'core';
    if (srcId !== state.starDraggingId && !lockCoreA) {
      a.vx += fx;
      a.vy += fy;
    }
    if (tgtId !== state.starDraggingId && !lockCoreB) {
      b.vx -= fx;
      b.vy -= fy;
    }
  };

  for (const lk of state.links) {
    applySpringEdge(lk.fromArtifactId, lk.toArtifactId, 185, 0.024);
  }
  for (const wl of implicitWeakLinks) {
    applySpringEdge(wl.fromArtifactId, wl.toArtifactId, 248, 0.009);
  }

  // (4) Velocity Integration & Smooth Damping
  for (const { id, sim } of nodesArr) {
    if (id === state.starDraggingId) continue;
    sim.vx *= 0.77;
    sim.vy *= 0.77;
    sim.x += sim.vx;
    sim.y += sim.vy;
  }

  // (5) 3-Pass Hard AABB Footprint Separation (176x86 => Strictly 0 Overlaps!)
  const minW = 176;
  const minH = 86;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < nodesArr.length; i += 1) {
      for (let j = i + 1; j < nodesArr.length; j += 1) {
        const a = nodesArr[i];
        const b = nodesArr[j];
        const dx = b.sim.x - a.sim.x;
        const dy = b.sim.y - a.sim.y;
        const ox = minW - Math.abs(dx);
        const oy = minH - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          const lockCoreA = state.starSubStyle === 'orbit' && a.sim.tier === 'core';
          const lockCoreB = state.starSubStyle === 'orbit' && b.sim.tier === 'core';
          if (ox < oy) {
            const s = dx >= 0 ? 1 : -1;
            if (a.id !== state.starDraggingId && !lockCoreA) a.sim.x -= s * ox * (lockCoreB ? 1.0 : 0.52);
            if (b.id !== state.starDraggingId && !lockCoreB) b.sim.x += s * ox * (lockCoreA ? 1.0 : 0.52);
          } else {
            const s = dy >= 0 ? 1 : -1;
            if (a.id !== state.starDraggingId && !lockCoreA) a.sim.y -= s * oy * (lockCoreB ? 1.0 : 0.52);
            if (b.id !== state.starDraggingId && !lockCoreB) b.sim.y += s * oy * (lockCoreA ? 1.0 : 0.52);
          }
        }
      }
    }
  }

  // Update Constellation Orb DOM Transforms & Implicit Weak Links SVG
  for (const { id, sim } of nodesArr) {
    currentDisplayCoords.set(id, { x: sim.x, y: sim.y });
    if (Math.abs(sim.vx) > 0.1 || Math.abs(sim.vy) > 0.1) {
      cardVelocities.set(id, { vx: sim.vx, vy: sim.vy });
    }
    const el = document.getElementById(`constellation-node-${id}`);
    if (el) {
      el.style.transform = `translate3d(${sim.x.toFixed(1)}px, ${sim.y.toFixed(1)}px, 0)`;
    }
  }

  for (const wl of implicitWeakLinks) {
    const a = starSimNodes.get(wl.fromArtifactId);
    const b = starSimNodes.get(wl.toArtifactId);
    const pathEl = document.getElementById(`weak-path-${wl.id}`);
    if (!a || !b || !pathEl) continue;
    pathEl.setAttribute(
      'd',
      `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
    );
  }
}

function computeRestControlPoint(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sag = Math.min(52, dist * 0.13);
  const normalBend = Math.min(28, dist * 0.08);
  return {
    tx: (p1.x + p2.x) / 2 - (dy / dist) * normalBend,
    ty: (p1.y + p2.y) / 2 + Math.abs(dx / dist) * sag * 0.52 - 14,
  };
}

function ensureSpringLoopRunning() {
  if (springLoopStarted) return;
  springLoopStarted = true;

  const stepPhysics = () => {
    if (state.roomId && (state.viewMode === 'freeform' || state.viewMode === 'cluster')) {
      if (state.viewMode === 'freeform' && state.starLayoutOn) {
        stepConstellationOrbitalPhysics();
      }

      const capScale = state.viewMode === 'freeform' && state.starLayoutOn ? ' scale(0.88)' : '';
      for (const lk of state.links) {
        const p1 = getCardCenterCoords(lk.fromArtifactId);
        const p2 = getCardCenterCoords(lk.toArtifactId);
        if (!p1 || !p2) continue;

        const { tx, ty } = computeRestControlPoint(p1, p2);
        let sp = linkSprings.get(lk.id);
        if (!sp) {
          sp = { cx: tx, cy: ty + 32, vx: 0, vy: -7 };
          linkSprings.set(lk.id, sp);
        }

        const v1 = cardVelocities.get(lk.fromArtifactId) || { vx: 0, vy: 0 };
        const v2 = cardVelocities.get(lk.toArtifactId) || { vx: 0, vy: 0 };
        const dragLagX = -(v1.vx + v2.vx) * 0.44;
        const dragLagY = -(v1.vy + v2.vy) * 0.44;

        const ax = (tx + dragLagX - sp.cx) * SPRING_STIFFNESS;
        const ay = (ty + dragLagY - sp.cy) * SPRING_STIFFNESS;

        sp.vx = (sp.vx + ax) * SPRING_DAMPING;
        sp.vy = (sp.vy + ay) * SPRING_DAMPING;
        sp.cx += sp.vx;
        sp.cy += sp.vy;

        const d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${sp.cx.toFixed(1)} ${sp.cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        document.getElementById(`link-path-${lk.id}`)?.setAttribute('d', d);
        document.getElementById(`link-hit-${lk.id}`)?.setAttribute('d', d);

        const d1 = document.getElementById(`link-dot1-${lk.id}`);
        const d2 = document.getElementById(`link-dot2-${lk.id}`);
        if (d1) {
          d1.setAttribute('cx', p1.x.toFixed(1));
          d1.setAttribute('cy', p1.y.toFixed(1));
        }
        if (d2) {
          d2.setAttribute('cx', p2.x.toFixed(1));
          d2.setAttribute('cy', p2.y.toFixed(1));
        }

        const mx = 0.25 * p1.x + 0.5 * sp.cx + 0.25 * p2.x;
        const my = 0.25 * p1.y + 0.5 * sp.cy + 0.25 * p2.y;
        const cap = document.getElementById(`link-cap-${lk.id}`);
        if (cap) {
          cap.style.transform = `translate3d(${mx.toFixed(1)}px, ${my.toFixed(1)}px, 0) translate(-50%, -50%)${capScale}`;
        }
      }

      for (const [cid, vel] of cardVelocities.entries()) {
        vel.vx *= 0.72;
        vel.vy *= 0.72;
        if (Math.abs(vel.vx) < 0.05 && Math.abs(vel.vy) < 0.05) {
          cardVelocities.delete(cid);
        }
      }

      // Rubber-band elastic preview wire while manually linking (`🔗`)
      const rubberEl = document.getElementById('rubberPreviewPath');
      if (rubberEl) {
        if (state.linkingFromId && state.viewMode === 'freeform') {
          const p1 = getCardCenterCoords(state.linkingFromId);
          if (p1) {
            const p2 = { x: state.pointerCanvasX, y: state.pointerCanvasY };
            const { tx, ty } = computeRestControlPoint(p1, p2);
            rubberState.vx = (rubberState.vx + (tx - rubberState.cx) * 0.18) * 0.78;
            rubberState.vy = (rubberState.vy + (ty + 22 - rubberState.cy) * 0.18) * 0.78;
            rubberState.cx += rubberState.vx;
            rubberState.cy += rubberState.vy;
            rubberEl.classList.remove('hidden');
            rubberEl.setAttribute(
              'd',
              `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${rubberState.cx.toFixed(1)} ${rubberState.cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
            );
          } else {
            rubberEl.classList.add('hidden');
          }
        } else {
          rubberEl.classList.add('hidden');
        }
      }
    }
    requestAnimationFrame(stepPhysics);
  };

  requestAnimationFrame(stepPhysics);
}

export function renderAmbientPresenceCursors() {
  const wrap = document.getElementById('presenceCursorsLayer');
  if (!wrap) return;
  if (
    !state.showMicroCursors ||
    state.viewMode !== 'freeform' ||
    state.starLayoutOn ||
    state.artifacts.length === 0
  ) {
    wrap.innerHTML = '';
    return;
  }

  const peers = state.participants
    .filter((p) => p.id !== state.currentParticipantId)
    .slice(0, 2);
  const actors = [
    ...peers.map((p) => ({
      id: p.id,
      label: `${p.avatar} ${p.name}`,
      thought: '在看此卡',
      color: p.color || '#0284C7',
    })),
    {
      id: 'host_ambient',
      label: '✨ Host',
      thought: '梳理脉络',
      color: '#4F46E5',
    },
  ];

  actors.forEach((ac, idx) => {
    const target = state.artifacts[(idx + Math.floor(Date.now() / 4600)) % state.artifacts.length];
    if (!target) return;
    const pos = currentDisplayCoords.get(target.id) || { x: target.x, y: target.y };
    const cardEl = document.getElementById(`card-${target.id}`);
    const cw = cardEl?.offsetWidth || 256;
    const ch = cardEl?.offsetHeight || 168;
    // Park cleanly at outer bottom-right edge of card so it NEVER covers card text!
    const px = Math.round(pos.x + cw - 34 + (idx % 2) * 18);
    const py = Math.round(pos.y + ch + 5);

    let el = wrap.querySelector(`[data-ambient-id="${ac.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'presence-cursor-pill';
      el.setAttribute('data-ambient-id', ac.id);
      wrap.appendChild(el);
    }
    el.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;">
        <path d="M2 1.5L14 6.8L8.4 8.7L6.5 14.3L2 1.5Z" fill="${escapeHtml(ac.color)}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <span style="background:${escapeHtml(ac.color)};color:#fff;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.12);">
        ${escapeHtml(ac.label)} · ${escapeHtml(ac.thought)}
      </span>
    `;
    el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  });

  if (!presenceTimer) {
    presenceTimer = setInterval(() => {
      if (state.roomId && state.viewMode === 'freeform' && state.showMicroCursors) {
        renderAmbientPresenceCursors();
      }
    }, 4200);
  }
}

function buildImplicitWeakLinksDom() {
  const weakGroup = document.getElementById('weakLinksPathsGroup');
  if (!weakGroup) return;
  weakGroup.innerHTML = '';

  if (state.viewMode !== 'freeform' || !state.starLayoutOn) return;

  for (const wl of implicitWeakLinks) {
    const a = starSimNodes.get(wl.fromArtifactId);
    const b = starSimNodes.get(wl.toArtifactId);
    if (!a || !b) continue;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.id = `weak-path-${wl.id}`;
    p.setAttribute('class', 'weak-link-path');
    p.setAttribute('d', `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    weakGroup.appendChild(p);
  }
}

function renderConstellationNodes({
  deskLayer,
  me,
  onOpenLinkKindPicker,
  onSummonAgentOnCard,
  onJumpToFreeformCard,
}) {
  const emojis = ['🔥', '👍', '💡'];

  for (const card of state.artifacts) {
    const sim = starSimNodes.get(card.id) || {
      x: Number(card.x || 320) + 128,
      y: Number(card.y || 240) + 72,
      vx: 0,
      vy: 0,
      degree: 1,
      strongDegree: 0,
      tier: 'outer',
    };
    currentDisplayCoords.set(card.id, { x: sim.x, y: sim.y });

    const { bg, emoji, tintHex } = resolveOrbVisualStyle(card, sim.tier);
    const orbSize =
      sim.tier === 'core'
        ? 48
        : sim.tier === 'inner'
          ? Math.min(38, 26 + sim.degree * 2)
          : Math.min(29, 21 + Math.round(sim.degree * 1.4));

    const tierLabel =
      sim.tier === 'core'
        ? '✦ 核心焦点'
        : sim.tier === 'inner'
          ? '◎ 内轨强关联'
          : '◌ 外环灵感';

    const rawLabel = (card.title || card.content || '未命名便签').replace(/\s+/g, ' ').trim();
    const shortTitle = rawLabel.length > 13 ? `${rawLabel.slice(0, 13)}…` : rawLabel;

    const votesBar = emojis
      .map((em) => {
        const voters = card.votes?.[em] || [];
        const voted = voters.includes(me.id);
        return `<button type="button" class="vote-pill-btn ${voted ? 'voted' : ''}" data-orb-vote="${em}">${em}${voters.length ? ` ${voters.length}` : ''}</button>`;
      })
      .join('');

    const imgPreviewHtml =
      card.type === 'image' && card.metadata?.dataUrl
        ? `<img src="${escapeHtml(card.metadata.dataUrl)}" alt="${escapeHtml(card.title || '')}" style="width:100%;max-height:92px;object-fit:cover;border-radius:9px;margin-bottom:6px;border:1px solid rgba(28,25,23,0.08);" />`
        : '';

    // Zero-size coordinate anchor — guarantees ZERO offset rectangular boxes on hover!
    const anchor = document.createElement('div');
    anchor.id = `constellation-node-${card.id}`;
    anchor.setAttribute('data-constellation-id', card.id);
    anchor.className = [
      'constellation-node',
      state.starPinnedId === card.id ? 'is-pinned' : '',
      card.isRejected ? 'is-rejected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    anchor.style.transform = `translate3d(${sim.x.toFixed(1)}px, ${sim.y.toFixed(1)}px, 0)`;

    anchor.innerHTML = `
      <div class="orb-node-wrap">
        <div class="orb-preview-card" style="background:${escapeHtml(tintHex)};">
          <div class="orb-preview-head">
            <span class="orb-preview-author">${escapeHtml(card.authorName)}</span>
            <span class="orb-preview-tier">${tierLabel}</span>
          </div>
          ${imgPreviewHtml}
          ${card.title ? `<div class="orb-preview-title">${escapeHtml(card.title)}</div>` : ''}
          <div class="orb-preview-body">${escapeHtml(card.content)}</div>
          <div class="orb-preview-foot">
            <div style="display:flex;align-items:center;gap:3px;">
              ${votesBar}
              <button type="button" class="card-tool-btn" data-orb-link="${escapeHtml(card.id)}" title="从该星点拉出语义连线" style="opacity:1;">🔗</button>
              <button type="button" class="card-tool-btn" data-orb-summon="${escapeHtml(card.id)}" title="让 @spark 针对该星点补充" style="opacity:1;">🤖</button>
            </div>
            <button type="button" class="orb-jump-btn" data-orb-jump="${escapeHtml(card.id)}">
              回到桌面编辑 ↗
            </button>
          </div>
        </div>

        <div class="orb-planet tier-${sim.tier}" style="width:${orbSize}px;height:${orbSize}px;background:${bg};">
          <span style="font-size:${sim.tier === 'core' ? '19px' : '13.5px'};line-height:1;">${emoji}</span>
        </div>

        <div class="orb-label-pill">
          <span class="orb-label-text">${escapeHtml(shortTitle)}</span>
          <span class="orb-degree-badge">${sim.degree}</span>
        </div>
      </div>
    `;

    anchor.addEventListener('mouseenter', () => {
      state.hoveredArtifactId = card.id;
      if (state.starDraggingId) return;
      state.starHoveredId = card.id;
      if (state.linkingFromId && state.linkingFromId !== card.id) {
        anchor.classList.add('link-snap-hover');
      }
      const orbEl = anchor.querySelector('.orb-planet');
      const rect = orbEl?.getBoundingClientRect();
      if (rect && rect.top < 255) {
        anchor.classList.add('flip-down');
      } else {
        anchor.classList.remove('flip-down');
      }
      applyConstellationEgoFocus();
    });

    anchor.addEventListener('mouseleave', () => {
      if (state.hoveredArtifactId === card.id) state.hoveredArtifactId = null;
      if (state.starHoveredId === card.id) state.starHoveredId = null;
      anchor.classList.remove('link-snap-hover');
      applyConstellationEgoFocus();
    });

    // HTML5 Drag-and-Drop Target so Role/PA badges from Top-Right can also drop onto Constellation Orbs!
    anchor.addEventListener('dragover', (ev) => {
      if (
        ev.dataTransfer?.types?.includes('text/omind-role-key') ||
        ev.dataTransfer?.types?.includes('text/omind-pa-seat')
      ) {
        ev.preventDefault();
        ev.stopPropagation();
        anchor.classList.add('agent-drop-hover');
      }
    });
    anchor.addEventListener('dragleave', () => anchor.classList.remove('agent-drop-hover'));
    anchor.addEventListener('drop', async (ev) => {
      const roleKey = ev.dataTransfer?.getData('text/omind-role-key');
      const paPid = ev.dataTransfer?.getData('text/omind-pa-seat');
      if (!roleKey && !paPid) return;
      ev.preventDefault();
      ev.stopPropagation();
      anchor.classList.remove('agent-drop-hover');
      if (roleKey) {
        await onSummonAgentOnCard?.(card.id, { targetType: 'role', roleKey });
      } else if (paPid) {
        await onSummonAgentOnCard?.(card.id, { targetType: 'pa', participantId: paPid });
      }
    });

    // Tactile Orb Dragging + Click-to-Pin + Rubber-Band Link Completion
    anchor.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target.closest('button, a')) return;
      ev.stopPropagation();

      if (state.linkingFromId && state.linkingFromId !== card.id) {
        const fromId = state.linkingFromId;
        state.linkingFromId = null;
        anchor.classList.remove('link-snap-hover');
        document.getElementById('linkingModeBanner')?.classList.add('hidden');
        onOpenLinkKindPicker?.(fromId, card.id);
        return;
      }

      const startClientX = ev.clientX;
      const startClientY = ev.clientY;
      const origX = sim.x;
      const origY = sim.y;
      let prevX = origX;
      let prevY = origY;
      let moved = false;
      state.starDraggingId = card.id;
      anchor.classList.add('dragging');

      const onMove = (mev) => {
        const dx = (mev.clientX - startClientX) / state.scale;
        const dy = (mev.clientY - startClientY) / state.scale;
        if (Math.hypot(dx, dy) > 4) moved = true;
        if (!moved) return;

        const nx = origX + dx;
        const ny = origY + dy;
        const vx = nx - prevX;
        const vy = ny - prevY;
        prevX = nx;
        prevY = ny;

        sim.x = nx;
        sim.y = ny;
        sim.vx = 0;
        sim.vy = 0;
        currentDisplayCoords.set(card.id, { x: nx, y: ny });
        cardVelocities.set(card.id, { vx, vy });
        anchor.style.transform = `translate3d(${nx.toFixed(1)}px, ${ny.toFixed(1)}px, 0)`;
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        state.starDraggingId = null;
        anchor.classList.remove('dragging');

        if (!moved) {
          state.starPinnedId = state.starPinnedId === card.id ? null : card.id;
          deskLayer.querySelectorAll('.constellation-node').forEach((nodeEl) => {
            nodeEl.classList.toggle(
              'is-pinned',
              nodeEl.getAttribute('data-constellation-id') === state.starPinnedId
            );
          });
          applyConstellationEgoFocus();
        } else {
          state.links.forEach((lk) => {
            if (lk.fromArtifactId === card.id || lk.toArtifactId === card.id) {
              pluckLink(lk.id, 0, 18);
            }
          });
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    anchor.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('button, a')) return;
      ev.stopPropagation();
      onJumpToFreeformCard?.(card.id);
    });

    anchor.querySelector('[data-orb-jump]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onJumpToFreeformCard?.(card.id);
    });

    anchor.querySelector('[data-orb-link]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.starPinnedId = null;
      state.linkingFromId = card.id;
      state.pointerCanvasX = sim.x + 55;
      state.pointerCanvasY = sim.y + 30;
      rubberState.cx = sim.x;
      rubberState.cy = sim.y;
      const banner = document.getElementById('linkingModeBanner');
      const label = document.getElementById('linkingBannerText');
      if (label) {
        label.textContent = `🔗 已选起点星点「${shortTitle}」，点击另一颗星点建立三色语义连接…`;
      }
      banner?.classList.remove('hidden');
      applyConstellationEgoFocus();
    });

    anchor.querySelector('[data-orb-summon]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const firstRole = state.roles.find((r) => r.enabled)?.roleKey || 'spark';
      await onSummonAgentOnCard?.(card.id, { targetType: 'role', roleKey: firstRole });
    });

    anchor.querySelectorAll('[data-orb-vote]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const voteEmoji = btn.getAttribute('data-orb-vote');
        spawnEmojiFountain(ev.clientX, ev.clientY, voteEmoji, 4);
        await api.patchArtifact(state.roomId, card.id, { voteEmoji, actorId: me.id });
      });
    });

    deskLayer.appendChild(anchor);
  }
}

export function renderCanvas({
  onOpenLinkKindPicker,
  onOpenEditModal,
  onSummonAgentOnCard,
  onJumpToFreeformCard,
}) {
  ensureSpringLoopRunning();

  const vp = document.getElementById('studioViewport');
  const stage = document.getElementById('studioStage');
  const orbitLayer = document.getElementById('constellationOrbitLayer');
  const weakGroup = document.getElementById('weakLinksPathsGroup');
  const deskLayer = document.getElementById('deskCardsLayer');
  const linksSvg = document.getElementById('linksSvgLayer');
  const capsulesLayer = document.getElementById('linkCapsulesLayer');
  const causalLayer = document.getElementById('causalFlowLayer');
  const coldStart = document.getElementById('coldStartCard');

  if (!deskLayer || !linksSvg || !capsulesLayer || !causalLayer) return;

  const isConstellationActive =
    state.viewMode === 'freeform' && state.starLayoutOn && state.artifacts.length > 0;

  vp?.classList.toggle('constellation-active', isConstellationActive);
  orbitLayer?.classList.toggle(
    'hidden',
    !(isConstellationActive && state.starSubStyle === 'orbit')
  );
  if (!isConstellationActive) {
    weakGroup?.replaceChildren();
    stage?.classList.remove('has-constellation-ego');
  }

  const isColdStart =
    state.viewMode === 'freeform' &&
    state.artifacts.length === 0 &&
    state.messages.length === 0;
  coldStart?.classList.toggle('hidden', !isColdStart);

  if (state.viewMode === 'causal') {
    renderHostDigestIsland();
    deskLayer.classList.add('hidden');
    linksSvg.classList.add('hidden');
    capsulesLayer.classList.add('hidden');
    causalLayer.classList.remove('hidden');
    document.getElementById('presenceCursorsLayer')?.replaceChildren();
    renderCausalFlowGraph();
    return;
  }

  deskLayer.classList.remove('hidden');
  linksSvg.classList.remove('hidden');
  capsulesLayer.classList.remove('hidden');
  causalLayer.classList.add('hidden');

  deskLayer.innerHTML = '';
  currentDisplayCoords.clear();

  const me = getCurrentParticipant();

  // Mode 2 + 3 Combo: Concentric Gravity Orbits × Obsidian Glowing Constellation Orbs
  if (isConstellationActive) {
    rebuildConstellationGraph();
    renderHostDigestIsland();
    renderConstellationNodes({
      deskLayer,
      me,
      onOpenLinkKindPicker,
      onSummonAgentOnCard,
      onJumpToFreeformCard,
    });
    buildImplicitWeakLinksDom();
    buildElasticSemanticLinkDom();
    renderAmbientPresenceCursors();
    applyConstellationEgoFocus();
    return;
  }

  renderHostDigestIsland();

  if (state.viewMode === 'cluster') {
    const zones = [
      { key: 'context', title: '🎯 背景与佐证', section: 'context', x: 80, y: 100 },
      { key: 'solution', title: '💡 核心方案与灵感', section: 'decision', x: 680, y: 100 },
      { key: 'conflict', title: '⚡ 分歧与边界', section: 'open_question', x: 80, y: 520 },
      { key: 'action', title: '🏃 行动与待签', section: 'action_item', x: 680, y: 520 },
    ];

    const grouped = { context: [], solution: [], conflict: [], action: [] };
    for (const card of state.artifacts) {
      grouped[classifyCardForCluster(card)].push(card);
    }

    for (const z of zones) {
      const items = grouped[z.key];
      const rows = Math.max(1, Math.ceil(items.length / 2));
      const frame = document.createElement('div');
      frame.className = 'cluster-zone-frame';
      frame.style.left = `${z.x}px`;
      frame.style.top = `${z.y}px`;
      frame.style.width = '560px';
      frame.style.minHeight = `${110 + rows * 190}px`;

      const topCons = state.consensusItems.find((c) => c.section === z.section);
      frame.innerHTML = `
        <div class="cluster-zone-title">
          <span>${z.title} (${items.length})</span>
          ${
            topCons
              ? `<span style="font-size:11px;font-weight:700;color:${topCons.status === 'locked' ? '#059669' : '#57534E'}">
                  ${topCons.status === 'locked' ? '🔒 已拍板' : '📝 草案待锁'}
                 </span>`
              : ''
          }
        </div>
        ${
          topCons
            ? `<div style="padding:7px 10px;border-radius:10px;background:#fff;border:1px ${topCons.status === 'locked' ? 'solid #059669' : 'dashed #A8A29E'};font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
                <span>${escapeHtml(topCons.content)}</span>
                ${
                  topCons.status !== 'locked'
                    ? `<button type="button" class="btn btn-xs btn-emerald" data-lock-cons="${escapeHtml(topCons.id)}">拍板锁定</button>`
                    : `<span style="color:#059669;font-weight:700;white-space:nowrap;">✓ ${escapeHtml(topCons.lockedBy || '')}</span>`
                }
               </div>`
            : ''
        }
      `;

      frame.querySelectorAll('[data-lock-cons]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cid = btn.getAttribute('data-lock-cons');
          try {
            await api.lockConsensus(state.roomId, cid, { actorId: me.id });
            showToast('🔒 已拍板锁定该区核心结论');
          } catch (err) {
            showToast(err.message);
          }
        });
      });

      deskLayer.appendChild(frame);

      items.forEach((card, idx) => {
        currentDisplayCoords.set(card.id, {
          x: z.x + 16 + (idx % 2) * 268,
          y: z.y + (topCons ? 98 : 48) + Math.floor(idx / 2) * 185,
        });
      });
    }
  } else {
    // Open, Breathable Freeform Studio (Room title & legend already live cleanly in Top Rail!)
    for (const card of state.artifacts) {
      currentDisplayCoords.set(card.id, { x: Number(card.x), y: Number(card.y) });
    }
  }

  const enabledRoles = state.roles.filter((r) => r.enabled);
  const paMap = new Map(state.paBriefs.map((b) => [b.participantId, b]));
  const paParticipants = state.participants.filter((p) => paMap.has(p.id));

  // Render Tactile Pastel Stationery Cards
  for (const card of state.artifacts) {
    const pos = currentDisplayCoords.get(card.id) || { x: card.x, y: card.y };
    const tiltDeg =
      state.viewMode === 'freeform' && !state.starLayoutOn && card.type !== 'prior_room_card'
        ? deterministicTilt(card.id)
        : '0';

    const el = document.createElement('article');
    el.id = `card-${card.id}`;
    el.className = [
      'desk-card',
      `type-${card.type}`,
      card.isRejected ? 'is-rejected' : '',
      state.selectedArtifactIds.has(card.id) ? 'is-selected' : '',
      state.highlightedArtifactIds.has(card.id) ? 'source-glow' : '',
    ]
      .filter(Boolean)
      .join(' ');

    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.width = `${card.width || 258}px`;
    if (tiltDeg !== '0') {
      el.style.transform = `rotate(${tiltDeg}deg)`;
    }

    if (
      card.color &&
      !['prior_room_card', 'signoff_card', 'image'].includes(card.type)
    ) {
      el.style.background = card.color;
    }

    const showWashi = ['sticky', 'spark_card', 'pa_quote_card'].includes(card.type);
    const washiHtml = showWashi ? `<span class="washi-tape" aria-hidden="true"></span>` : '';

    const stepBadgeHtml = card.metadata?.stepBadge
      ? `<span class="starter-step-badge" title="${escapeHtml(card.metadata.stepHint || '')}">${escapeHtml(card.metadata.stepBadge)}</span>`
      : '';

    const vellumPillHtml =
      card.type === 'pa_quote_card'
        ? `<div class="vellum-meta-pill">✓ ${escapeHtml(card.metadata?.verifiedBadge || 'PA 已核实事实')}</div>`
        : card.type === 'spark_card'
          ? `<div class="vellum-meta-pill spark">✦ ${escapeHtml(card.metadata?.confidenceLabel || 'AI 角色搭档回应')}</div>`
          : '';

    const imageHtml =
      card.type === 'image' && card.metadata?.dataUrl
        ? `<img src="${escapeHtml(card.metadata.dataUrl)}" alt="${escapeHtml(card.title)}" class="card-polaroid-img" />`
        : '';

    const linkUrlHtml =
      card.type === 'link' && card.metadata?.url
        ? `<div style="margin-top:5px;font-size:11px;"><a href="${escapeHtml(card.metadata.url)}" target="_blank" rel="noopener" style="color:#4F46E5;text-decoration:underline;">🔗 打开外部链接 ↗</a></div>`
        : '';

    const priorShareHtml =
      card.type === 'prior_room_card' && card.metadata?.shareId
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(79,70,229,0.25);display:flex;justify-content:space-between;align-items:center;font-size:11px;">
            <span style="color:#4F46E5;font-weight:700;">已继承 ${(card.metadata.lockedDecisions || []).length} 条锁定结论</span>
            <button type="button" class="link-mini-btn" data-open-prior-share="${escapeHtml(card.metadata.shareId)}" data-open-prior-token="${escapeHtml(card.metadata.shareToken || '')}">查看原定稿</button>
           </div>`
        : '';

    let signoffHtml = '';
    if (card.type === 'signoff_card' && card.metadata?.consensusItemId) {
      const sStatus = card.metadata.signoffStatus || 'pending_human_signoff';
      const isOwner = me.id === card.metadata.ownerParticipantId;
      if (sStatus === 'pending_human_signoff') {
        signoffHtml = `
          <div class="signoff-actions">
            <button type="button" class="btn btn-xs ${isOwner ? 'btn-emerald' : 'btn-subtle'}" data-signoff-action="signed" data-cons-id="${escapeHtml(card.metadata.consensusItemId)}">
              ${isOwner ? '✅ 本人签字生效' : `🔒 仅 ${escapeHtml(card.metadata.ownerName || '本人')} 可签`}
            </button>
            <button type="button" class="btn btn-xs btn-subtle" data-signoff-action="rejected" data-cons-id="${escapeHtml(card.metadata.consensusItemId)}">
              ✕ 驳回
            </button>
          </div>
        `;
      } else {
        signoffHtml = `<div style="margin-top:6px;font-size:11px;font-weight:700;color:${sStatus === 'signed' ? '#059669' : '#E11D48'};">${sStatus === 'signed' ? '✅ 本人已签字锁定' : '❌ 本人已驳回'}</div>`;
      }
    }

    const swatchesHtml =
      card.type === 'sticky' || card.type === 'spark_card'
        ? PASTEL_SWATCHES.map(
            (sw) =>
              `<button type="button" class="color-dot-btn" style="background:${sw.hex};" data-swatch-hex="${sw.hex}" title="换色：${sw.label}"></button>`
          ).join('')
        : '';

    const isPickerOpen = state.activeAgentPickerCardId === card.id;
    const agentPickerHtml = isPickerOpen
      ? `
        <div class="card-agent-picker">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:#4338CA;">
            <span>🤖 召唤谁评估这张卡？</span>
            <button type="button" class="btn btn-xs btn-ghost" data-close-agent-picker style="padding:0 4px;">✕</button>
          </div>
          <div class="card-agent-picker-grid">
            ${enabledRoles
              .slice(0, 6)
              .map(
                (r) =>
                  `<button type="button" class="card-agent-pick-btn" data-summon-role="${escapeHtml(r.roleKey)}">${escapeHtml(r.badgeEmoji)} ${escapeHtml(r.displayName.replace(/\s.*$/, ''))}</button>`
              )
              .join('')}
            ${paParticipants
              .map(
                (p) =>
                  `<button type="button" class="card-agent-pick-btn" style="background:#ECFDF5;" data-summon-pa="${escapeHtml(p.id)}">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}·PA</button>`
              )
              .join('')}
          </div>
        </div>
      `
      : '';

    const emojis = ['🔥', '👍', '💡'];
    const votesBar = emojis
      .map((em) => {
        const voters = card.votes?.[em] || [];
        const voted = voters.includes(me.id);
        return `<button type="button" class="vote-pill-btn ${voted ? 'voted' : ''}" data-vote-emoji="${em}">${em}${voters.length ? ` ${voters.length}` : ''}</button>`;
      })
      .join('');

    const isEditingNow = state.editingArtifactId === card.id;

    el.innerHTML = `
      ${washiHtml}
      ${stepBadgeHtml}
      <div class="card-head">
        <span class="card-author">${escapeHtml(card.authorName)}</span>
        <div class="card-hover-tools">
          ${swatchesHtml}
          <button type="button" class="card-tool-btn" data-card-summon="${escapeHtml(card.id)}" title="针对此卡召唤 Agent（也可从右上角拖拽角色过来）">🤖</button>
          <button type="button" class="card-tool-btn" data-card-link="${escapeHtml(card.id)}" title="拉出弹性语义虚线">🔗</button>
          <button type="button" class="card-tool-btn" data-card-edit="${escapeHtml(card.id)}" title="编辑标题与内容">✎</button>
          <button type="button" class="card-tool-btn" data-card-reject="${escapeHtml(card.id)}" title="标记/取消已排除分支（写进定稿避坑附录）">🚫</button>
          <button type="button" class="card-tool-btn" data-card-del="${escapeHtml(card.id)}" title="删除">×</button>
        </div>
      </div>
      ${vellumPillHtml}
      ${imageHtml}
      ${card.title ? `<div class="card-title">${escapeHtml(card.title)}</div>` : ''}
      <div
        class="card-body"
        data-inline-body="${escapeHtml(card.id)}"
        contenteditable="${isEditingNow ? 'true' : 'false'}"
        spellcheck="false"
        title="双击可直接原地修改文字"
      >${escapeHtml(card.content)}</div>
      ${agentPickerHtml}
      ${linkUrlHtml}
      ${priorShareHtml}
      ${signoffHtml}
      <div class="card-foot">
        <div style="display:flex;gap:3px;">${votesBar}</div>
        ${card.isRejected ? '<span class="rejected-tag">❌ 已排除分支</span>' : ''}
      </div>
    `;

    // Hover tracking for Spacebar Point-and-Talk Spatial Voice + Rubber-Band Snap Highlight
    el.addEventListener('mouseenter', () => {
      state.hoveredArtifactId = card.id;
      if (state.linkingFromId && state.linkingFromId !== card.id) {
        el.classList.add('link-snap-hover');
      }
    });
    el.addEventListener('mouseleave', () => {
      if (state.hoveredArtifactId === card.id) state.hoveredArtifactId = null;
      el.classList.remove('link-snap-hover');
    });

    // HTML5 Drag-and-Drop Target for Top-Right Role Badges & PA Seat Capsules!
    el.addEventListener('dragover', (ev) => {
      if (
        ev.dataTransfer?.types?.includes('text/omind-role-key') ||
        ev.dataTransfer?.types?.includes('text/omind-pa-seat')
      ) {
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.add('agent-drop-hover');
      }
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('agent-drop-hover');
    });
    el.addEventListener('drop', async (ev) => {
      const roleKey = ev.dataTransfer?.getData('text/omind-role-key');
      const paPid = ev.dataTransfer?.getData('text/omind-pa-seat');
      if (!roleKey && !paPid) return;
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.remove('agent-drop-hover');
      if (roleKey) {
        await onSummonAgentOnCard?.(card.id, { targetType: 'role', roleKey });
      } else if (paPid) {
        await onSummonAgentOnCard?.(card.id, { targetType: 'pa', participantId: paPid });
      }
    });

    // Click to select OR snap-complete rubber-band semantic link
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, .card-agent-picker')) return;
      const bodyEl = el.querySelector('[data-inline-body]');
      if (bodyEl?.getAttribute('contenteditable') === 'true') return;

      if (state.linkingFromId && state.linkingFromId !== card.id) {
        const fromId = state.linkingFromId;
        state.linkingFromId = null;
        el.classList.remove('link-snap-hover');
        document.getElementById('linkingModeBanner')?.classList.add('hidden');
        onOpenLinkKindPicker?.(fromId, card.id);
        return;
      }
      if (ev.shiftKey || ev.metaKey) {
        if (state.selectedArtifactIds.has(card.id)) state.selectedArtifactIds.delete(card.id);
        else state.selectedArtifactIds.add(card.id);
      } else {
        state.selectedArtifactIds.clear();
        state.selectedArtifactIds.add(card.id);
      }
      document.querySelectorAll('.desk-card').forEach((node) => {
        const nid = node.id.replace(/^card-/, '');
        node.classList.toggle('is-selected', state.selectedArtifactIds.has(nid));
      });
    });

    // Double-click Card -> Direct Inline Contenteditable (V4 Studio Feel!)
    const inlineBodyEl = el.querySelector('[data-inline-body]');
    el.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('button, a, .card-agent-picker')) return;
      ev.stopPropagation();
      activateInlineCardEdit(card.id, false);
    });

    inlineBodyEl?.addEventListener('keydown', (ev) => {
      if (inlineBodyEl.getAttribute('contenteditable') !== 'true') return;
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) {
        ev.preventDefault();
        inlineBodyEl.blur();
      }
    });

    inlineBodyEl?.addEventListener('blur', async () => {
      if (inlineBodyEl.getAttribute('contenteditable') !== 'true') return;
      inlineBodyEl.setAttribute('contenteditable', 'false');
      if (state.editingArtifactId === card.id) state.editingArtifactId = null;
      const nextText = inlineBodyEl.textContent.trim();
      if (nextText && nextText !== card.content) {
        card.content = nextText;
        try {
          await api.patchArtifact(state.roomId, card.id, {
            content: nextText,
            actorId: me.id,
          });
          showToast('✨ 便签内容已原地保存');
        } catch (err) {
          showToast(err.message);
        }
      } else {
        inlineBodyEl.textContent = card.content;
      }
    });

    // Smooth Freeform Dragging -> Feeds Real Velocity into 60fps Elastic Spring Links!
    if (state.viewMode === 'freeform') {
      el.addEventListener('pointerdown', (ev) => {
        if (
          ev.button !== 0 ||
          ev.target.closest('button, a, input, textarea, .card-agent-picker') ||
          inlineBodyEl?.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
        if (state.linkingFromId && state.linkingFromId !== card.id) return;

        ev.stopPropagation();
        const startClientX = ev.clientX;
        const startClientY = ev.clientY;
        const origX = pos.x;
        const origY = pos.y;
        let prevX = origX;
        let prevY = origY;
        let moved = false;

        const onMove = (mev) => {
          const dx = (mev.clientX - startClientX) / state.scale;
          const dy = (mev.clientY - startClientY) / state.scale;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
          if (!moved) return;

          el.classList.add('dragging');
          const nx = Math.round(origX + dx);
          const ny = Math.round(origY + dy);
          const vx = nx - prevX;
          const vy = ny - prevY;
          prevX = nx;
          prevY = ny;

          cardVelocities.set(card.id, { vx, vy });
          const dynTilt = Math.max(-4.5, Math.min(4.5, vx * 0.2));
          el.style.left = `${nx}px`;
          el.style.top = `${ny}px`;
          el.style.transform = `rotate(${dynTilt.toFixed(1)}deg) scale(1.02)`;

          card.x = nx;
          card.y = ny;
          currentDisplayCoords.set(card.id, { x: nx, y: ny });
          if (state.tourActive) positionSpotlightElements();
        };

        const onUp = async () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          el.classList.remove('dragging');
          el.style.transform = tiltDeg !== '0' ? `rotate(${tiltDeg}deg)` : '';
          if (moved) {
            const vel = cardVelocities.get(card.id) || { vx: 0, vy: 0 };
            state.links.forEach((lk) => {
              if (lk.fromArtifactId === card.id || lk.toArtifactId === card.id) {
                pluckLink(lk.id, vel.vx * 0.45, vel.vy * 0.45 + 11);
              }
            });
            if (!state.starLayoutOn) {
              state.savedFreeformCoords[card.id] = { x: card.x, y: card.y };
            }
            notifyQuestProgress('card_created_or_moved');
            try {
              await api.patchArtifact(state.roomId, card.id, {
                x: card.x,
                y: card.y,
                zone: 'main',
                actorId: me.id,
              });
            } catch {
              // ignore transient drag sync error
            }
          }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }

    // Pastel Swatch Click
    el.querySelectorAll('[data-swatch-hex]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const hex = btn.getAttribute('data-swatch-hex');
        card.color = hex;
        el.style.background = hex;
        await api.patchArtifact(state.roomId, card.id, { color: hex, actorId: me.id });
      });
    });

    // Card-Level `🤖` Summon Agent Picker
    el.querySelector('[data-card-summon]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.activeAgentPickerCardId =
        state.activeAgentPickerCardId === card.id ? null : card.id;
      renderCanvas({ onOpenLinkKindPicker, onOpenEditModal, onSummonAgentOnCard });
    });

    el.querySelector('[data-close-agent-picker]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.activeAgentPickerCardId = null;
      renderCanvas({ onOpenLinkKindPicker, onOpenEditModal, onSummonAgentOnCard });
    });

    el.querySelectorAll('[data-summon-role]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const roleKey = btn.getAttribute('data-summon-role');
        state.activeAgentPickerCardId = null;
        await onSummonAgentOnCard?.(card.id, { targetType: 'role', roleKey });
      });
    });

    el.querySelectorAll('[data-summon-pa]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const participantId = btn.getAttribute('data-summon-pa');
        state.activeAgentPickerCardId = null;
        await onSummonAgentOnCard?.(card.id, { targetType: 'pa', participantId });
      });
    });

    // Start Elastic Rubber-Band Link
    el.querySelector('[data-card-link]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.linkingFromId = card.id;
      const c = getCardCenterCoords(card.id) || { x: pos.x + 125, y: pos.y + 70 };
      state.pointerCanvasX = c.x + 65;
      state.pointerCanvasY = c.y + 35;
      rubberState.cx = c.x;
      rubberState.cy = c.y;
      rubberState.vx = 0;
      rubberState.vy = 0;
      const banner = document.getElementById('linkingModeBanner');
      const label = document.getElementById('linkingBannerText');
      if (label) {
        label.textContent = `🔗 已选起点「${(card.title || card.content).slice(0, 14)}」，移动鼠标预览弹性弧线并点击目标便签…`;
      }
      banner?.classList.remove('hidden');
    });

    el.querySelector('[data-card-edit]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onOpenEditModal?.(card);
    });

    el.querySelector('[data-card-reject]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await api.patchArtifact(state.roomId, card.id, {
          isRejected: !card.isRejected,
          actorId: me.id,
        });
        showToast(!card.isRejected ? '已标记为排除分支（定稿自动编入避坑附录）' : '已取消排除标记');
      } catch (err) {
        showToast(err.message);
      }
    });

    el.querySelector('[data-card-del]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await api.deleteArtifact(state.roomId, card.id, me.id);
      } catch (err) {
        showToast(err.message);
      }
    });

    el.querySelectorAll('[data-vote-emoji]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const voteEmoji = btn.getAttribute('data-vote-emoji');
        spawnEmojiFountain(ev.clientX, ev.clientY, voteEmoji, 4);
        await api.patchArtifact(state.roomId, card.id, { voteEmoji, actorId: me.id });
      });
    });

    el.querySelector('[data-open-prior-share]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const sid = ev.currentTarget.getAttribute('data-open-prior-share');
      const stok = ev.currentTarget.getAttribute('data-open-prior-token') || '';
      window.dispatchEvent(
        new CustomEvent('omind:open-share', { detail: { shareId: sid, shareToken: stok } })
      );
    });

    el.querySelectorAll('[data-signoff-action]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const decision = btn.getAttribute('data-signoff-action');
        const consId = btn.getAttribute('data-cons-id');
        try {
          await api.signoffConsensus(state.roomId, consId, {
            participantId: me.id,
            decision,
          });
          showToast(decision === 'signed' ? '✅ 本人签字确认已生效！' : '已驳回该红线事项');
        } catch (err) {
          showToast(`⛔ ${err.message}`);
        }
      });
    });

    deskLayer.appendChild(el);
  }

  buildElasticSemanticLinkDom();
  renderAmbientPresenceCursors();
}

function buildElasticSemanticLinkDom() {
  const group = document.getElementById('linksPathsGroup');
  const capsulesLayer = document.getElementById('linkCapsulesLayer');
  if (!group || !capsulesLayer) return;

  group.innerHTML = '';
  capsulesLayer.innerHTML = '';
  const me = getCurrentParticipant();

  for (const lk of state.links) {
    const p1 = getCardCenterCoords(lk.fromArtifactId);
    const p2 = getCardCenterCoords(lk.toArtifactId);
    if (!p1 || !p2) continue;

    const { tx, ty } = computeRestControlPoint(p1, p2);
    if (!linkSprings.has(lk.id)) {
      linkSprings.set(lk.id, { cx: tx, cy: ty + 34, vx: 0, vy: -8 });
    }
    const sp = linkSprings.get(lk.id);
    const initD = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${sp.cx.toFixed(1)} ${sp.cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

    // Wide invisible stroke so sweeping cursor plucks the wire like a guitar string!
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.id = `link-hit-${lk.id}`;
    hitPath.setAttribute('class', 'sem-link-hit');
    hitPath.setAttribute('d', initD);
    hitPath.addEventListener('pointerenter', (ev) => {
      const dir = (ev.movementY ?? 1) >= 0 ? 1 : -1;
      pluckLink(lk.id, (ev.movementX || 0) * 0.55, dir * 18);
    });
    hitPath.addEventListener('click', () => pluckLink(lk.id, 0, 26));

    const visPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visPath.id = `link-path-${lk.id}`;
    visPath.setAttribute('class', `sem-link-path ${LINK_CLASS[lk.kind] || 'sem-derive'}`);
    visPath.setAttribute('stroke', LINK_COLORS[lk.kind] || '#7C3AED');
    visPath.setAttribute('d', initD);

    const dot1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot1.id = `link-dot1-${lk.id}`;
    dot1.setAttribute('class', 'obsidian-node-dot');
    dot1.setAttribute('cx', p1.x.toFixed(1));
    dot1.setAttribute('cy', p1.y.toFixed(1));
    dot1.setAttribute('r', '4.5');

    const dot2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot2.id = `link-dot2-${lk.id}`;
    dot2.setAttribute('class', 'obsidian-node-dot');
    dot2.setAttribute('cx', p2.x.toFixed(1));
    dot2.setAttribute('cy', p2.y.toFixed(1));
    dot2.setAttribute('r', '4.5');

    group.appendChild(hitPath);
    group.appendChild(visPath);
    group.appendChild(dot1);
    group.appendChild(dot2);

    const midX = 0.25 * p1.x + 0.5 * sp.cx + 0.25 * p2.x;
    const midY = 0.25 * p1.y + 0.5 * sp.cy + 0.25 * p2.y;

    const cap = document.createElement('div');
    cap.id = `link-cap-${lk.id}`;
    cap.className = `link-capsule kind-${lk.kind}`;
    cap.style.transform = `translate3d(${midX.toFixed(1)}px, ${midY.toFixed(1)}px, 0) translate(-50%, -50%)`;
    cap.title = '点击拨动回弹 · 双击可直接修改这条连线的说明';

    if (state.editingLinkId === lk.id) {
      cap.innerHTML = `
        <span>✏️</span>
        <input id="edit-link-inp-${escapeHtml(lk.id)}" class="link-reason-input" value="${escapeHtml(lk.reason || '')}" placeholder="输入连线原因…" maxlength="56" />
        <button type="button" class="link-mini-btn" data-save-link="${escapeHtml(lk.id)}">✓</button>
      `;
      capsulesLayer.appendChild(cap);
      const inp = cap.querySelector('input');
      requestAnimationFrame(() => {
        inp?.focus();
        inp?.select();
      });
      const commitReason = async () => {
        if (state.editingLinkId !== lk.id) return;
        state.editingLinkId = null;
        const val = inp?.value?.trim() ?? '';
        await api.patchLink(state.roomId, lk.id, { reason: val, actorId: me.id });
        showToast('✏️ 已更新语义连线说明');
      };
      inp?.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitReason();
        } else if (ev.key === 'Escape') {
          state.editingLinkId = null;
          buildElasticSemanticLinkDom();
        }
      });
      cap.querySelector('[data-save-link]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        commitReason();
      });
      continue;
    }

    const shortKindWord =
      lk.kind === 'support' ? '佐证' : lk.kind === 'conflict' ? '碰撞' : '推导';
    const compactLabel =
      lk.kind === 'support' && lk.reason
        ? `${LINK_LABELS.support} ${escapeHtml(lk.reason.slice(0, 10))}${lk.reason.length > 10 ? '…' : ''}`
        : `${LINK_LABELS[lk.kind] || '🟣'} ${shortKindWord}`;

    let primaryHtml = '';
    let extraHtml = '';
    if (lk.kind === 'derive') {
      primaryHtml = `<button type="button" class="link-mini-btn" data-synth-link="${escapeHtml(lk.id)}">✨ 合成结论</button>`;
      extraHtml = lk.reason
        ? `<span style="font-size:10.5px;color:#57534E;">${escapeHtml(lk.reason.slice(0, 18))}</span>`
        : '';
    } else if (lk.kind === 'conflict') {
      primaryHtml = `
        <button type="button" class="link-mini-btn" data-vote-link="${escapeHtml(lk.id)}" data-choice="A">🅰 ${lk.voteAUsers.length}</button>
        <button type="button" class="link-mini-btn" data-vote-link="${escapeHtml(lk.id)}" data-choice="B">🅱 ${lk.voteBUsers.length}</button>
      `;
      extraHtml = `
        <button type="button" class="link-mini-btn" data-eval-link="${escapeHtml(lk.id)}">✨ 并行推演</button>
        <button type="button" class="link-mini-btn" data-q-link="${escapeHtml(lk.id)}">❓ 转待决</button>
      `;
    }

    cap.title = `${lk.reason ? `${lk.reason} · ` : ''}悬停展开更多 · 双击修改原因`;
    cap.innerHTML = `
      <span>${compactLabel}</span>
      ${primaryHtml}
      <span class="link-extra-actions">
        ${extraHtml}
        <button type="button" class="link-mini-btn" style="padding:1px 5px;color:#A8A29E;" data-del-link="${escapeHtml(lk.id)}" title="移除连线">×</button>
      </span>
    `;

    cap.addEventListener('click', (ev) => {
      if (ev.target.closest('button, input')) return;
      pluckLink(lk.id, (Math.random() - 0.5) * 14, 24);
    });

    cap.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('button, input')) return;
      ev.stopPropagation();
      state.editingLinkId = lk.id;
      buildElasticSemanticLinkDom();
    });

    cap.querySelector('[data-synth-link]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      pluckLink(lk.id, 0, 28);
      await api.synthesizeLink(state.roomId, lk.id, me.id);
      notifyQuestProgress('synthesized_or_locked');
      showToast('✨ 已生成互补合成结论卡与共识草案');
    });

    cap.querySelectorAll('[data-vote-link]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        pluckLink(lk.id, 0, 24);
        spawnEmojiFountain(ev.clientX, ev.clientY, '🗳️', 3);
        const choice = btn.getAttribute('data-choice');
        await api.voteLink(state.roomId, lk.id, { userId: me.id, choice });
      });
    });

    cap.querySelector('[data-eval-link]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      showToast('⚖️ 正在并行推演 A/B 方案利弊…');
      await api.parallelEvalLink(state.roomId, lk.id, me.id);
      showToast('✨ A/B 利弊评估双卡已放入桌面');
    });

    cap.querySelector('[data-q-link]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await api.addConsensus(state.roomId, {
        section: 'open_question',
        content: lk.reason || '待进一步核实的方案冲突项',
        actorId: me.id,
      });
      showToast('❓ 已转入因果脉络待决问题');
    });

    cap.querySelector('[data-del-link]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await api.deleteLink(state.roomId, lk.id, me.id);
      showToast('已移除该条语义连线');
    });

    capsulesLayer.appendChild(cap);
  }
}

function renderCausalFlowGraph() {
  const nodesBox = document.getElementById('causalNodesContainer');
  const edgesSvg = document.getElementById('causalEdgesSvg');
  if (!nodesBox || !edgesSvg) return;

  nodesBox.innerHTML = '';
  edgesSvg.innerHTML = '';

  const me = getCurrentParticipant();
  const pMap = new Map(state.participants.map((p) => [p.id, p]));
  const columns = {
    context: { label: '🎯 背景前提', x: 90, items: [] },
    decision: { label: '⚖️ 核心拍板决策', x: 450, items: [] },
    action_item: { label: '🏃 下游行动与待签', x: 820, items: [] },
    open_question: { label: '❓ 待决分歧', x: 1170, items: [] },
  };

  for (const item of state.consensusItems) {
    (columns[item.section] || columns.decision).items.push(item);
  }

  const nodePositions = new Map();

  for (const col of Object.values(columns)) {
    const header = document.createElement('div');
    header.style.position = 'absolute';
    header.style.left = `${col.x}px`;
    header.style.top = '95px';
    header.style.fontWeight = '800';
    header.style.fontSize = '13.5px';
    header.textContent = `${col.label} (${col.items.length})`;
    nodesBox.appendChild(header);

    col.items.forEach((item, idx) => {
      const y = 135 + idx * 195;
      nodePositions.set(item.id, { x: col.x, y });

      const pendingProp = state.proposals.find((pr) => pr.targetItemId === item.id);
      const owner = item.ownerParticipantId ? pMap.get(item.ownerParticipantId) : null;

      const card = document.createElement('div');
      card.className = [
        'causal-node-card',
        `status-${item.status}`,
        item.signoffStatus === 'pending_human_signoff' ? 'signoff-pending' : '',
      ]
        .filter(Boolean)
        .join(' ');
      card.style.left = `${col.x}px`;
      card.style.top = `${y}px`;

      const statusBadge =
        item.signoffStatus === 'pending_human_signoff'
          ? `<span style="color:#B45309;font-weight:800;">🛑 待 @${escapeHtml(owner?.name || '本人')} 签字</span>`
          : item.status === 'locked'
            ? `<span style="color:#059669;font-weight:800;">🔒 已拍板 (${escapeHtml(item.lockedBy || '')})</span>`
            : item.status === 'stale_upstream'
              ? `<span style="color:#D97706;font-weight:800;">⚠️ 上游变更待复核</span>`
              : `<span style="color:#78716C;font-weight:700;">📝 AI/会中草案</span>`;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:6px;">
          ${statusBadge}
          ${owner ? `<span style="color:#57534E;">@${escapeHtml(owner.name)} ${item.dueDate ? `· ${escapeHtml(item.dueDate)}` : ''}</span>` : ''}
        </div>
        <div style="font-size:12.5px;font-weight:600;color:#1C1917;">${escapeHtml(item.content)}</div>
        ${
          pendingProp
            ? `<div class="proposal-diff-box">
                <div style="font-weight:700;color:#B45309;margin-bottom:3px;">✨ 修订提案：${escapeHtml(pendingProp.reason)}</div>
                <div style="color:#059669;margin-bottom:6px;">建议改为：「${escapeHtml(pendingProp.proposedContent)}」</div>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn-xs btn-emerald" data-prop-accept="${escapeHtml(pendingProp.id)}">采纳并重锁</button>
                  <button type="button" class="btn btn-xs btn-subtle" data-prop-reject="${escapeHtml(pendingProp.id)}">忽略提案</button>
                </div>
               </div>`
            : ''
        }
        <div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap;">
          ${
            item.signoffStatus === 'pending_human_signoff'
              ? `<button type="button" class="btn btn-xs btn-emerald" data-node-signoff="${escapeHtml(item.id)}">本人签字确认</button>`
              : item.status !== 'locked'
                ? `<button type="button" class="btn btn-xs btn-emerald" data-node-lock="${escapeHtml(item.id)}">🔒 确认拍板</button>`
                : ''
          }
          <button type="button" class="btn btn-xs btn-subtle" data-node-edit="${escapeHtml(item.id)}">
            ${item.status === 'locked' ? '✎ 修改上游结论 (触发传导)' : '✎ 编辑'}
          </button>
        </div>
      `;

      card.querySelector('[data-node-lock]')?.addEventListener('click', async () => {
        try {
          await api.lockConsensus(state.roomId, item.id, { actorId: me.id });
          showToast('🔒 已拍板锁定！任何 AI 均无法直接覆写此条目');
        } catch (err) {
          showToast(`⛔ ${err.message}`);
        }
      });

      card.querySelector('[data-node-signoff]')?.addEventListener('click', async () => {
        try {
          await api.signoffConsensus(state.roomId, item.id, {
            participantId: me.id,
            decision: 'signed',
          });
          showToast('✅ 本人签字生效并已锁定');
        } catch (err) {
          showToast(`⛔ ${err.message}`);
        }
      });

      card.querySelector('[data-node-edit]')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('omind:edit-consensus', { detail: { item } }));
      });

      card.querySelector('[data-prop-accept]')?.addEventListener('click', async () => {
        await api.resolveProposal(state.roomId, pendingProp.id, {
          actorId: me.id,
          decision: 'accepted',
        });
        showToast('✅ 已采纳下游修订提案并重新锁定');
      });

      card.querySelector('[data-prop-reject]')?.addEventListener('click', async () => {
        await api.resolveProposal(state.roomId, pendingProp.id, {
          actorId: me.id,
          decision: 'rejected',
        });
        showToast('已忽略该修订提案');
      });

      nodesBox.appendChild(card);
    });
  }

  for (const item of state.consensusItems) {
    const toPos = nodePositions.get(item.id);
    if (!toPos) continue;
    for (const depId of item.dependsOnIds || []) {
      const fromPos = nodePositions.get(depId);
      if (!fromPos) continue;
      const x1 = fromPos.x + 300;
      const y1 = fromPos.y + 52;
      const x2 = toPos.x;
      const y2 = toPos.y + 52;
      const midX = (x1 + x2) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', item.status === 'stale_upstream' ? '#D97706' : '#7C3AED');
      path.setAttribute('stroke-width', item.status === 'stale_upstream' ? '3' : '2');
      if (item.status === 'stale_upstream') {
        path.setAttribute('stroke-dasharray', '6 4');
      }
      edgesSvg.appendChild(path);
    }
  }
}

export function playAgentMicroCursor({
  displayName = 'Host',
  color = '#4F46E5',
  fromPoint = { x: 140, y: 120 },
  toPoint = { x: 320, y: 240 },
  actionLabel = '整理桌面',
}) {
  if (!state.showMicroCursors) return;
  const layer = document.getElementById('microCursorsLayer');
  if (!layer) return;

  const el = document.createElement('div');
  el.className = 'agent-micro-cursor';
  el.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${escapeHtml(color)}">
      <path d="M4 2L20 11L12 13L9 21L4 2Z" stroke="#fff" stroke-width="1.5"/>
    </svg>
    <span class="micro-cursor-tag" style="background:${escapeHtml(color)};">
      ${escapeHtml(displayName)} · ${escapeHtml(actionLabel)}
    </span>
  `;
  layer.appendChild(el);

  const start = performance.now();
  const duration = 800;
  const ctrlX = (fromPoint.x + toPoint.x) / 2 + 40;
  const ctrlY = Math.min(fromPoint.y, toPoint.y) - 50;

  const tick = (now) => {
    const rawT = Math.min(1, (now - start) / duration);
    const t = 1 - Math.pow(1 - rawT, 3);
    const inv = 1 - t;
    const x = inv * inv * fromPoint.x + 2 * inv * t * ctrlX + t * t * toPoint.x;
    const y = inv * inv * fromPoint.y + 2 * inv * t * ctrlY + t * t * toPoint.y;
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 220);
      }, 420);
    }
  };

  requestAnimationFrame(tick);
}
