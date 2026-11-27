/**
 * Omind v5.2 — Modals, 3-Preset Launcher, PA Seat Inspector (with `claimCode` Claim Flow),
 * Role Configurator, MCP Connector Drawer, Finalize Modal, and Share + 30s Replay View (`?t=shareToken`)
 */

import { api } from './api.js';
import { notifyQuestProgress } from './onboarding.js';
import {
  SIMULATED_PERSONAS,
  copyText,
  escapeHtml,
  getCurrentParticipant,
  getLocalRecentRooms,
  loadRoomParticipantToken,
  loadShareToken,
  renderMarkdownHtml,
  saveRoomParticipantChoice,
  saveShareToken,
  showToast,
  state,
} from './state.js';

export function closeCenterModal() {
  document.getElementById('modalBackdrop')?.classList.add('hidden');
  const modal = document.getElementById('centerModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }
}

export function openCenterModal(innerHtml, onMount = null) {
  const backdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('centerModal');
  if (!backdrop || !modal) return;
  modal.innerHTML = innerHtml;
  backdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  onMount?.(modal);
}

export function closeSideDrawer() {
  const drawer = document.getElementById('sideDrawer');
  if (drawer) {
    drawer.classList.add('hidden');
    drawer.innerHTML = '';
  }
}

/**
 * FR-01.1: 3-Preset Room Launcher Overlay
 */
export function openRoomLauncherOverlay({ onSelectRoom, onCreatedRoom, onCancel }) {
  const overlay = document.getElementById('launcherOverlay');
  if (!overlay) return;

  const presets =
    state.presets?.length > 0
      ? state.presets
      : [
          {
            id: 'brainstorm_breakthrough',
            name: '💡 破局脑暴局',
            tagline: '高密度发散碰撞 · 反常识破局 · 收敛创意方案大纲',
          },
          {
            id: 'decision_review',
            name: '⚖️ 方案拍板局',
            tagline: '摆事实比方案 · 挑刺防盲点 · 锁定决策备忘录 / PRD',
          },
          {
            id: 'schedule_align',
            name: '📋 排期对齐局',
            tagline: '理清上下游依赖 · 守住成员排期红线 · 生成可执行排期表',
          },
        ];

  let selectedPreset = 'decision_review';
  let pIdx = Math.floor(Math.random() * SIMULATED_PERSONAS.length);
  const me = getCurrentParticipant();
  let chosenAvatar = me?.avatar || SIMULATED_PERSONAS[pIdx].avatar;
  let chosenColor = me?.color || SIMULATED_PERSONAS[pIdx].color;

  const recent = [...getLocalRecentRooms(), ...(state.knownRooms || [])];
  const dedupRooms = [];
  const seen = new Set();
  for (const r of recent) {
    if (r?.roomId && !seen.has(r.roomId)) {
      seen.add(r.roomId);
      dedupRooms.push(r);
    }
  }

  overlay.innerHTML = `
    <div class="overlay-container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="/logo.svg" alt="Omind" style="width:32px;height:32px;" />
          <div>
            <h1 style="margin:0;font-size:20px;">新建圆桌讨论桌面</h1>
            <div style="font-size:12.5px;color:#57534E;">每个桌面独享独立 SQLite Durable Object 存储，自动签发入座凭证</div>
          </div>
        </div>
        <button id="closeLauncherBtn" type="button" class="btn btn-subtle">
          ${state.roomId ? '返回当前桌面 ✕' : '← 返回首页'}
        </button>
      </div>

      <div class="glass-panel" style="padding:22px 24px;margin-top:14px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">1. 选择讨论场景模板</div>
        <div class="preset-grid" id="launcherPresetGrid">
          ${presets
            .map(
              (p) => `
            <button type="button" class="preset-card ${p.id === selectedPreset ? 'selected' : ''}" data-preset-id="${escapeHtml(p.id)}">
              <div style="font-size:15.5px;font-weight:700;margin-bottom:5px;">${escapeHtml(p.name)}</div>
              <div style="font-size:12px;color:#57534E;">${escapeHtml(p.tagline || '')}</div>
            </button>
          `
            )
            .join('')}
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
          <div class="form-field">
            <label>本场讨论话题</label>
            <input id="newRoomTitleInput" class="form-input" placeholder="例如：首屏改版方案二选一 / Q4 排期对齐" value="" />
          </div>
          <div class="form-field">
            <label>你的入座昵称</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <span id="launcherAvatarBadge" class="cute-emoji-badge" style="background:#EEF2FF;flex-shrink:0;">${escapeHtml(chosenAvatar)}</span>
              <input id="newRoomCreatorInput" class="form-input" value="${escapeHtml(me?.name || SIMULATED_PERSONAS[pIdx].name)}" />
              <button id="launcherRollBtn" type="button" class="btn btn-xs btn-subtle" title="随机换昵称与可爱头像">🎲</button>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:6px;flex-wrap:wrap;">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#57534E;cursor:pointer;">
            <input id="enableRecDomainChk" type="checkbox" checked />
            同时开启推荐的业务视角搭档（技术可行性 / 成本风控 / 挑剔用户）
          </label>
          <div style="display:flex;gap:10px;">
            <button id="enterShowcaseBtn" type="button" class="btn btn-subtle">🏛 查看架构拍板演练桌面</button>
            <button id="createNewRoomSubmitBtn" type="button" class="btn btn-primary">进入新桌面 →</button>
          </div>
        </div>
      </div>

      ${
        dedupRooms.length > 0
          ? `<div style="margin-top:22px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:#57534E;">最近桌面</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;">
                ${dedupRooms
                  .map(
                    (r) => `
                  <button type="button" class="preset-card" style="padding:12px 15px;" data-open-room="${escapeHtml(r.roomId)}">
                    <div style="font-weight:700;font-size:13.5px;">${escapeHtml(r.title)}</div>
                    <div style="font-size:11.5px;color:#78716C;margin-top:4px;">ID: ${escapeHtml(r.roomId)} · ${r.status === 'finalized' ? '已定稿' : '进行中'}</div>
                  </button>
                `
                  )
                  .join('')}
              </div>
             </div>`
          : ''
      }
    </div>
  `;

  overlay.classList.remove('hidden');

  overlay.querySelector('#closeLauncherBtn')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    onCancel?.();
  });

  overlay.querySelector('#launcherRollBtn')?.addEventListener('click', () => {
    pIdx = (pIdx + 1) % SIMULATED_PERSONAS.length;
    const next = SIMULATED_PERSONAS[pIdx];
    chosenAvatar = next.avatar;
    chosenColor = next.color;
    const badge = overlay.querySelector('#launcherAvatarBadge');
    const inp = overlay.querySelector('#newRoomCreatorInput');
    if (badge) {
      badge.textContent = next.avatar;
      badge.style.background = next.bg;
    }
    if (inp) inp.value = next.name;
  });

  overlay.querySelectorAll('[data-preset-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPreset = btn.getAttribute('data-preset-id');
      overlay.querySelectorAll('[data-preset-id]').forEach((b) => {
        b.classList.toggle('selected', b === btn);
      });
    });
  });

  overlay.querySelector('#enterShowcaseBtn')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    onSelectRoom?.('room_showcase_v5');
  });

  overlay.querySelectorAll('[data-open-room]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rid = btn.getAttribute('data-open-room');
      overlay.classList.add('hidden');
      onSelectRoom?.(rid);
    });
  });

  overlay.querySelector('#createNewRoomSubmitBtn')?.addEventListener('click', async () => {
    const titleVal =
      overlay.querySelector('#newRoomTitleInput')?.value?.trim() || '新圆桌共创讨论';
    const creatorName =
      overlay.querySelector('#newRoomCreatorInput')?.value?.trim() || '林知夏';
    const enableRecommendedDomain = Boolean(
      overlay.querySelector('#enableRecDomainChk')?.checked
    );

    try {
      const created = await api.createRoom({
        title: titleVal,
        presetId: selectedPreset,
        creatorName,
        creatorAvatar: chosenAvatar,
        creatorColor: chosenColor,
        enableRecommendedDomain,
      });
      if (created.creator?.id) {
        saveRoomParticipantChoice(
          created.roomMeta.id,
          created.creator.id,
          created.participantToken
        );
      }
      overlay.classList.add('hidden');
      onCreatedRoom?.(created);
    } catch (err) {
      showToast(err.message);
    }
  });
}

/**
 * FR-05.2 & v5.1 Claim Flow: Seat Capsule Inspector & `claimCode` Claim Drawer
 */
export function openSeatInspectorDrawer(participantId, { onIdentityChanged }) {
  const drawer = document.getElementById('sideDrawer');
  if (!drawer) return;

  notifyQuestProgress('seat_inspected');

  const p = state.participants.find((x) => x.id === participantId) || getCurrentParticipant();
  const brief = state.paBriefs.find((b) => b.participantId === p.id);
  const myPendingSignoffs = state.consensusItems.filter(
    (c) => c.ownerParticipantId === p.id && c.signoffStatus === 'pending_human_signoff'
  );

  const storedTokenForSeat =
    loadRoomParticipantToken(state.roomId, p.id) || state.demoSeatTokens?.[p.id] || null;
  const isOwnerAuthenticated =
    state.currentParticipantId === p.id && Boolean(state.currentParticipantToken || storedTokenForSeat);
  const canSwitchSeat = Boolean(storedTokenForSeat) && state.currentParticipantId !== p.id;

  drawer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="seat-avatar" style="width:34px;height:34px;font-size:18px;background:#EEF2FF;">${escapeHtml(p.avatar)}</span>
        <div>
          <div style="font-weight:700;font-size:15px;">${escapeHtml(p.name)}</div>
          <div style="font-size:11.5px;color:#78716C;">
            ${escapeHtml(p.roleTitle)} · ${p.pendingClaim ? '🔑 PA 待本人认领' : p.isOnline ? '🟢 在线' : '⚪ 离线（PA 驻席）'}
          </div>
        </div>
      </div>
      <button id="closeSeatDrawerBtn" type="button" class="icon-circle-btn">✕</button>
    </div>

    <div style="padding:10px 12px;border-radius:12px;background:#FAF8F4;border:1px solid rgba(28,25,23,0.08);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="font-size:12px;">当前我的身份：<strong>${escapeHtml(getCurrentParticipant().avatar)} ${escapeHtml(getCurrentParticipant().name)}</strong></span>
      ${
        state.currentParticipantId === p.id
          ? `<span style="font-size:11.5px;color:#059669;font-weight:700;">✓ 本人已持凭证</span>`
          : canSwitchSeat
            ? `<button id="switchToThisSeatBtn" type="button" class="btn btn-xs btn-primary">切换体验 ${escapeHtml(p.name)} 视角</button>`
            : `<span style="font-size:11px;color:#78716C;">🔒 受 Bearer Token 隔离保护</span>`
      }
    </div>

    ${
      brief?.pendingClaim
        ? `<div style="padding:12px 14px;border-radius:14px;background:#EEF2FF;border:1px solid rgba(79,70,229,0.28);margin-bottom:14px;">
            <div style="font-weight:700;font-size:12.5px;color:#4338CA;margin-bottom:4px;">🔑 认领会前投递的个人 Agent 座席</div>
            <div style="font-size:11.5px;color:#57534E;margin-bottom:8px;">
              若该 PA 由你在外部工具投递，请输入返回的一次性 <code>claimCode</code> 绑定到你当前身份（防止同名冒领）：
            </div>
            <div style="display:flex;gap:6px;">
              <input id="claimCodeInput" class="form-input" placeholder="粘贴 claim_..." style="font-family:var(--font-mono);font-size:12px;" />
              <button id="submitClaimCodeBtn" type="button" class="btn btn-xs btn-primary" style="white-space:nowrap;">确认认领</button>
            </div>
           </div>`
        : ''
    }

    ${
      brief
        ? `<div style="margin-bottom:16px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:6px;">
              个人 AI 立场包（来源：<code>${escapeHtml(brief.sourceClient)}</code> · 已引用 ${brief.referenceCount} 次）
            </div>
            <div style="padding:10px 12px;border-radius:12px;background:#F0FDF4;border:1px solid rgba(5,150,105,0.22);font-size:12.5px;margin-bottom:10px;">
              ${escapeHtml(brief.summaryMarkdown)}
            </div>

            <div class="form-field">
              <label>PA 房间参与模式 ${isOwnerAuthenticated ? '（本人可实时切换）' : '（仅本人 Token 可修改）'}</label>
              <select id="paModeSelect" class="form-input" ${isOwnerAuthenticated ? '' : 'disabled'}>
                <option value="context_only" ${brief.mode === 'context_only' ? 'selected' : ''}>📎 仅提供上下文（不公屏发言，仅由 Host 核实引用）</option>
                <option value="proxy_tiered" ${brief.mode === 'proxy_tiered' ? 'selected' : ''}>🤖 分级授权代发言（与 Host 后台通气，红线必挂待签卡）</option>
              </select>
            </div>

            ${
              brief.facts?.length
                ? `<div style="font-size:12px;margin-bottom:8px;">
                    <strong>已核实客观事实：</strong>
                    <ul style="margin:4px 0 0 18px;padding:0;">
                      ${brief.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
                    </ul>
                   </div>`
                : ''
            }

            <div style="font-size:12px;margin-bottom:8px;">
              <strong>🛑 红线硬拦截清单（触及禁止代拍板）：</strong>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
                ${(brief.redlineTopics || [])
                  .map(
                    (t) =>
                      `<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#FFF1F2;color:#E11D48;font-weight:600;">${escapeHtml(t)}</span>`
                  )
                  .join('')}
              </div>
            </div>
           </div>`
        : `<div style="padding:14px;border-radius:12px;background:#FAF8F4;border:1px dashed rgba(28,25,23,0.16);margin-bottom:14px;font-size:12.5px;color:#57534E;">
            该成员尚未投递 PA 立场简报。可点击右上角 <strong>🔌 MCP 接入</strong> 从本地 Cursor / Claude 或在线调试台投递。
           </div>`
    }

    ${
      myPendingSignoffs.length > 0
        ? `<div>
            <div style="font-weight:700;font-size:13px;color:#B45309;margin-bottom:8px;">⏳ 待 ${escapeHtml(p.name)} 本人签字确认 (${myPendingSignoffs.length})</div>
            ${myPendingSignoffs
              .map(
                (item) => `
              <div style="padding:10px 12px;border-radius:12px;background:#FFFBEB;border:1.5px solid rgba(217,119,6,0.4);margin-bottom:8px;">
                <div style="font-size:12.5px;font-weight:600;margin-bottom:8px;">${escapeHtml(item.content)}</div>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn-xs ${isOwnerAuthenticated ? 'btn-emerald' : 'btn-subtle'}" data-drawer-sign="${escapeHtml(item.id)}" data-dec="signed">
                    ${isOwnerAuthenticated ? '✅ 本人确认生效' : `🔒 需 ${escapeHtml(p.name)} 本人凭证`}
                  </button>
                  <button type="button" class="btn btn-xs btn-subtle" data-drawer-sign="${escapeHtml(item.id)}" data-dec="rejected">✕ 修改驳回</button>
                </div>
              </div>
            `
              )
              .join('')}
           </div>`
        : ''
    }
  `;

  drawer.classList.remove('hidden');

  drawer.querySelector('#closeSeatDrawerBtn')?.addEventListener('click', closeSideDrawer);

  drawer.querySelector('#switchToThisSeatBtn')?.addEventListener('click', () => {
    state.currentParticipantId = p.id;
    state.currentParticipantToken = storedTokenForSeat;
    saveRoomParticipantChoice(state.roomId, p.id, storedTokenForSeat);
    onIdentityChanged?.();
    openSeatInspectorDrawer(p.id, { onIdentityChanged });
    showToast(`已切换为「${p.avatar} ${p.name}」视角`);
  });

  drawer.querySelector('#submitClaimCodeBtn')?.addEventListener('click', async () => {
    const code = drawer.querySelector('#claimCodeInput')?.value?.trim();
    if (!code) {
      showToast('请输入一次性 claimCode');
      return;
    }
    try {
      const res = await api.claimPaBrief(state.roomId, code);
      showToast(`✅ 已成功认领并绑定到「${res.participant.name}」！`);
      onIdentityChanged?.();
      closeSideDrawer();
    } catch (err) {
      showToast(`⛔ 认领失败：${err.message}`);
    }
  });

  drawer.querySelector('#paModeSelect')?.addEventListener('change', async (ev) => {
    const mode = ev.target.value;
    try {
      await api.patchPaBrief(state.roomId, p.id, { mode });
      showToast(`已切换 PA 模式为：${mode === 'proxy_tiered' ? '🤖 分级代答' : '📎 仅提供上下文'}`);
    } catch (err) {
      showToast(`⛔ ${err.message}`);
    }
  });

  drawer.querySelectorAll('[data-drawer-sign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = btn.getAttribute('data-drawer-sign');
      const dec = btn.getAttribute('data-dec');
      try {
        await api.signoffConsensus(state.roomId, cid, { decision: dec });
        showToast(dec === 'signed' ? '✅ 本人签字生效！' : '已驳回红线事项');
        closeSideDrawer();
      } catch (err) {
        showToast(`⛔ ${err.message}`);
      }
    });
  });
}

/**
 * FR-01.1 & FR-04.2: Public Role Dual-Dimension Configurator + Folded Hand-Raise Inbox
 */
export function openRoleConfiguratorDrawer() {
  const drawer = document.getElementById('sideDrawer');
  if (!drawer) return;

  const cognitiveRoles = state.roles.filter((r) => r.dimension === 'cognitive');
  const domainRoles = state.roles.filter((r) => r.dimension === 'domain');
  const foldedHands = state.handRaises.filter(
    (h) => h.status === 'folded' || h.status === 'raised_teaser'
  );
  const me = getCurrentParticipant();

  const renderRoleRow = (r) => `
    <div style="padding:9px 11px;border-radius:12px;background:#FAF8F4;border:1px solid rgba(28,25,23,0.08);margin-bottom:7px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div>
        <div style="font-weight:700;font-size:13px;">
          ${escapeHtml(r.badgeEmoji)} ${escapeHtml(r.displayName)}
          ${r.recommended ? `<span style="font-size:10.5px;color:#4F46E5;background:rgba(79,70,229,0.1);padding:1px 6px;border-radius:99px;">推荐</span>` : ''}
        </div>
        <div style="font-size:11.5px;color:#57534E;margin-top:2px;">${escapeHtml(r.systemInstruction)}</div>
      </div>
      <input type="checkbox" data-toggle-role="${escapeHtml(r.roleKey)}" ${r.enabled ? 'checked' : ''} style="margin-top:4px;transform:scale(1.15);cursor:pointer;" />
    </div>
  `;

  drawer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:15px;">⚙ 房间角色搭档配置</div>
        <div style="font-size:11.5px;color:#78716C;">思维动作角色 + 业务岗位角色 · 多人讨论自动切换为举手微提示</div>
      </div>
      <button id="closeRoleDrawerBtn" type="button" class="icon-circle-btn">✕</button>
    </div>

    ${
      foldedHands.length > 0
        ? `<div style="margin-bottom:14px;padding:10px 12px;border-radius:12px;background:#FFFBEB;border:1px solid rgba(217,119,6,0.35);">
            <div style="font-weight:700;font-size:12.5px;color:#B45309;margin-bottom:6px;">🙋 待点开 / 已折叠举手提示 (${foldedHands.length})</div>
            ${foldedHands
              .map(
                (h) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 0;border-top:1px dashed rgba(217,119,6,0.22);font-size:12px;">
                <span><strong>${escapeHtml(h.roleKey)}</strong>：${escapeHtml(h.teaser)}</span>
                <button type="button" class="btn btn-xs btn-primary" data-expand-hr="${escapeHtml(h.id)}">展开上墙</button>
              </div>
            `
              )
              .join('')}
           </div>`
        : ''
    }

    <div style="font-weight:700;font-size:12.5px;color:#4F46E5;margin-bottom:6px;">一、思维动作角色</div>
    ${cognitiveRoles.map(renderRoleRow).join('')}

    <div style="font-weight:700;font-size:12.5px;color:#059669;margin:12px 0 6px;">二、业务岗位视角</div>
    ${domainRoles.map(renderRoleRow).join('')}

    <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(28,25,23,0.08);">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;">＋ 添加自定义岗位视角</div>
      <div style="display:grid;grid-template-columns:68px 1fr;gap:8px;margin-bottom:8px;">
        <input id="customRoleEmoji" class="form-input" value="⚖️" placeholder="Emoji" />
        <input id="customRoleName" class="form-input" placeholder="岗位名称（如：法务合规官）" />
      </div>
      <input id="customRoleInst" class="form-input" style="margin-bottom:8px;" placeholder="关注视角与风险点…" />
      <button id="addCustomRoleBtn" type="button" class="btn btn-subtle" style="width:100%;">添加并启用</button>
    </div>
  `;

  drawer.classList.remove('hidden');

  drawer.querySelector('#closeRoleDrawerBtn')?.addEventListener('click', closeSideDrawer);

  drawer.querySelectorAll('[data-toggle-role]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const rk = chk.getAttribute('data-toggle-role');
      await api.patchRole(state.roomId, rk, { enabled: chk.checked, actorId: me.id });
      showToast(`${chk.checked ? '已启用' : '已关闭'}角色 ${rk}`);
    });
  });

  drawer.querySelectorAll('[data-expand-hr]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hid = btn.getAttribute('data-expand-hr');
      btn.disabled = true;
      btn.textContent = '展开中…';
      await api.expandHandRaise(state.roomId, hid, me.id);
      showToast('✨ 已展开至右侧边缘灵感区');
      closeSideDrawer();
    });
  });

  drawer.querySelector('#addCustomRoleBtn')?.addEventListener('click', async () => {
    const displayName = drawer.querySelector('#customRoleName')?.value?.trim();
    const badgeEmoji = drawer.querySelector('#customRoleEmoji')?.value?.trim() || '🧭';
    const systemInstruction = drawer.querySelector('#customRoleInst')?.value?.trim() || '';
    if (!displayName) {
      showToast('请填写自定义岗位名称');
      return;
    }
    await api.addCustomRole(state.roomId, {
      displayName,
      dimension: 'domain',
      badgeEmoji,
      systemInstruction,
      actorId: me.id,
    });
    showToast(`已新增自定义角色「${displayName}」`);
    openRoleConfiguratorDrawer();
  });
}

/**
 * FR-05.1 & Section 4.3: Streamable HTTP MCP Connector + Live 4-Tool Debugger (with `claimCode` copy!)
 */
export function openMcpConnectorDrawer() {
  const drawer = document.getElementById('sideDrawer');
  if (!drawer) return;

  const info = state.mcpConnectInfo || {
    mcpEndpoint: `${location.origin}/mcp`,
    roomUrl: `${location.origin}/room/${state.roomId}`,
    bearerToken: '',
    cursorConfigJson: {},
    preMeetingPrompt: '',
    postMeetingPrompt: '',
  };

  drawer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <div style="font-weight:700;font-size:15px;">🔌 MCP 连接器（接入你的外部 AI）</div>
        <div style="font-size:11.5px;color:#78716C;">支持 Cursor / Claude / 飞书助理 · 全链路凭证与 claimCode 防冒领保护</div>
      </div>
      <button id="closeMcpDrawerBtn" type="button" class="icon-circle-btn">✕</button>
    </div>

    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">Cursor / Claude Desktop <code>mcp.json</code> 配置</span>
        <button id="copyMcpJsonBtn" type="button" class="btn btn-xs btn-primary">复制配置</button>
      </div>
      <pre class="code-block">${escapeHtml(JSON.stringify(info.cursorConfigJson, null, 2))}</pre>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:16px;">
      <button id="copyPrePromptBtn" type="button" class="btn btn-xs btn-subtle" style="flex:1;">📋 复制会前投递口令</button>
      <button id="copyPostPromptBtn" type="button" class="btn btn-xs btn-subtle" style="flex:1;">📋 复制会后拉取口令</button>
    </div>

    <div style="border-top:1px solid rgba(28,25,23,0.08);padding-top:12px;">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;">🧪 在线实测 <code>POST /mcp</code> 四大标准工具</div>

      <div style="padding:11px;border-radius:12px;background:#FAF8F4;border:1px solid rgba(28,25,23,0.08);margin-bottom:10px;">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;">Tool 2: <code>omind_submit_pa_brief</code>（投递 PA 并签发一次性认领码）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
          <input id="mcpBriefName" class="form-input" placeholder="成员姓名（如：陆鸣）" value="陆鸣" />
          <select id="mcpBriefMode" class="form-input">
            <option value="proxy_tiered">proxy_tiered (分级代答)</option>
            <option value="context_only">context_only (仅上下文)</option>
          </select>
        </div>
        <textarea id="mcpBriefSummary" class="form-input" rows="2" style="margin-bottom:6px;">核心数据库读写分离已在灰度环境跑通，常规性能问题可代答；排期死线提前或预算变更需本人签字。</textarea>
        <button id="runMcpSubmitBriefBtn" type="button" class="btn btn-xs btn-emerald" style="width:100%;">通过 POST /mcp 投递 PA 座席</button>
        <div id="mcpClaimBadgeSlot" style="margin-top:6px;"></div>
      </div>

      <div style="padding:11px;border-radius:12px;background:#FAF8F4;border:1px solid rgba(28,25,23,0.08);margin-bottom:10px;">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;">Tool 4: <code>omind_query_room_raw</code>（持房间/成员凭证穿透查 RAW）</div>
        <div style="display:flex;gap:6px;">
          <input id="mcpRawQueryInput" class="form-input" value="为什么放弃 WebSocket" placeholder="输入细节疑问或关键词…" />
          <button id="runMcpRawQueryBtn" type="button" class="btn btn-xs btn-primary">穿透检索</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button id="runMcpTopicBtn" type="button" class="btn btn-xs btn-subtle" style="flex:1;">调 Tool 1: 读议题</button>
        <button id="runMcpPullBtn" type="button" class="btn btn-xs btn-subtle" style="flex:1;">调 Tool 3: 拉取成品</button>
      </div>

      <pre id="mcpLiveOutput" class="code-block" style="max-height:190px;overflow-y:auto;">// 点击上方任一按钮查看真实 /mcp JSON-RPC 2.0 响应…</pre>
    </div>
  `;

  drawer.classList.remove('hidden');

  drawer.querySelector('#closeMcpDrawerBtn')?.addEventListener('click', closeSideDrawer);
  drawer.querySelector('#copyMcpJsonBtn')?.addEventListener('click', () =>
    copyText(JSON.stringify(info.cursorConfigJson, null, 2), '已复制 MCP Server JSON 配置')
  );
  drawer.querySelector('#copyPrePromptBtn')?.addEventListener('click', () =>
    copyText(info.preMeetingPrompt, '已复制会前 PA 投递口令')
  );
  drawer.querySelector('#copyPostPromptBtn')?.addEventListener('click', () =>
    copyText(info.postMeetingPrompt, '已复制会后 MCP 拉取口令')
  );

  const outputEl = drawer.querySelector('#mcpLiveOutput');
  const claimSlot = drawer.querySelector('#mcpClaimBadgeSlot');

  drawer.querySelector('#runMcpTopicBtn')?.addEventListener('click', async () => {
    const res = await api.callMcpTool(
      'omind_get_room_topic',
      { roomUrl: info.roomUrl, roomToken: info.bearerToken },
      info.bearerToken
    );
    outputEl.textContent = JSON.stringify(res, null, 2);
  });

  drawer.querySelector('#runMcpSubmitBriefBtn')?.addEventListener('click', async () => {
    const participantName = drawer.querySelector('#mcpBriefName')?.value?.trim() || '陆鸣';
    const mode = drawer.querySelector('#mcpBriefMode')?.value || 'proxy_tiered';
    const summaryMarkdown = drawer.querySelector('#mcpBriefSummary')?.value?.trim() || '';
    const res = await api.callMcpTool(
      'omind_submit_pa_brief',
      {
        roomUrl: info.roomUrl,
        roomToken: info.bearerToken,
        participantName,
        sourceClient: 'cursor',
        mode,
        summaryMarkdown,
        facts: [summaryMarkdown],
        stances: [{ topic: '当前模块就绪度', position: summaryMarkdown.slice(0, 36) }],
      },
      info.bearerToken
    );
    outputEl.textContent = JSON.stringify(res, null, 2);
    const claimCode = res?.result?.structuredContent?.claimCode;
    if (claimCode && claimSlot) {
      claimSlot.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:8px;background:#EEF2FF;font-size:11.5px;color:#4338CA;">
          <span>已生成认领码：<code>${escapeHtml(claimCode)}</code></span>
          <button id="copyClaimBtn" type="button" class="btn btn-xs btn-primary">复制认领码</button>
        </div>
      `;
      claimSlot.querySelector('#copyClaimBtn')?.addEventListener('click', () =>
        copyText(claimCode, '🔑 已复制 claimCode，点顶栏待认领座席即可绑定！')
      );
    }
    showToast(`✅ ${participantName} 的 PA 已挂载至顶栏（待本人认领）！`);
  });

  drawer.querySelector('#runMcpPullBtn')?.addEventListener('click', async () => {
    const res = await api.callMcpTool(
      'omind_pull_deliverable',
      { roomOrShareUrl: info.roomUrl, token: info.bearerToken },
      info.bearerToken
    );
    outputEl.textContent = JSON.stringify(res, null, 2);
  });

  drawer.querySelector('#runMcpRawQueryBtn')?.addEventListener('click', async () => {
    const query = drawer.querySelector('#mcpRawQueryInput')?.value?.trim() || 'WebSocket';
    const res = await api.callMcpTool(
      'omind_query_room_raw',
      { roomOrShareUrl: info.roomUrl, token: info.bearerToken, query, topK: 6 },
      info.bearerToken
    );
    outputEl.textContent = JSON.stringify(res, null, 2);
  });
}

/**
 * FR-07.1: Finalize Deliverable Picker Modal (5 Templates)
 */
export function openFinalizeModal({ onFinalized }) {
  const templates = state.templates?.length
    ? state.templates
    : [
        { id: 'creative_brief', name: '💡 创意方案大纲', subtitle: '核心洞察 · 入选破局方向 · 验证实验' },
        { id: 'prd_or_decision_memo', name: '⚖️ PRD / 决策备忘录', subtitle: '背景目标 · 已拍板决策 · 行动项' },
        { id: 'task_schedule', name: '📋 任务排期与依赖表', subtitle: '里程碑 · 负责人 · 依赖链路' },
        { id: 'client_minutes', name: '🤝 客户共创纪要', subtitle: '共识边界 · 双方交付分工' },
        { id: 'custom_outline', name: '📝 自定义段落大纲', subtitle: '按自定义骨架编译' },
      ];

  let chosen = state.roomMeta?.defaultTemplateId || 'prd_or_decision_memo';
  const lockedCount = state.consensusItems.filter((c) => c.status === 'locked').length;
  const rejectedCount = state.artifacts.filter((a) => a.isRejected).length;

  openCenterModal(
    `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="margin:0;font-size:17px;">✨ 收敛定稿 · 生成方案文档与安全分享链接</h3>
      <button id="closeFinModalBtn" type="button" class="icon-circle-btn">✕</button>
    </div>
    <p style="margin:0 0 12px;font-size:12.5px;color:#57534E;">
      按<strong>你们拍板的 ${lockedCount} 条核心结论</strong>编译成品，自动附上 <strong>${rejectedCount} 个已排除分支避坑记录</strong>，并签发只读 <code>shareToken</code>（与原始讨论严格隔离）。
    </p>
    <div id="finTemplateList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
      ${templates
        .map(
          (t) => `
        <button type="button" class="preset-card ${t.id === chosen ? 'selected' : ''}" style="padding:11px 14px;" data-tpl-id="${escapeHtml(t.id)}">
          <div style="font-weight:700;font-size:13.5px;">${escapeHtml(t.name)}</div>
          <div style="font-size:11.5px;color:#78716C;">${escapeHtml(t.subtitle || '')}</div>
        </button>
      `
        )
        .join('')}
    </div>
    <div id="customOutlineWrap" class="form-field hidden">
      <label>自定义章节大纲（每行一节）</label>
      <textarea id="customOutlineInput" class="form-input" rows="3" placeholder="核心定位\n关键架构选型\n里程碑拆解"></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="cancelFinBtn" type="button" class="btn btn-subtle">取消</button>
      <button id="confirmFinBtn" type="button" class="btn btn-primary">✨ 立即生成定稿与 30 秒回放</button>
    </div>
    `,
    (modal) => {
      const syncOutlineBox = () => {
        modal
          .querySelector('#customOutlineWrap')
          ?.classList.toggle('hidden', chosen !== 'custom_outline');
      };
      syncOutlineBox();

      modal.querySelector('#closeFinModalBtn')?.addEventListener('click', closeCenterModal);
      modal.querySelector('#cancelFinBtn')?.addEventListener('click', closeCenterModal);

      modal.querySelectorAll('[data-tpl-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          chosen = btn.getAttribute('data-tpl-id');
          modal
            .querySelectorAll('[data-tpl-id]')
            .forEach((b) => b.classList.toggle('selected', b === btn));
          syncOutlineBox();
        });
      });

      modal.querySelector('#confirmFinBtn')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = '正在编译定稿…';
        try {
          const customOutline = modal.querySelector('#customOutlineInput')?.value || '';
          const res = await api.finalizeRoom(state.roomId, {
            templateId: chosen,
            customOutline,
            actorId: getCurrentParticipant().id,
          });
          if (res.shareToken) {
            saveShareToken(res.shareId, res.shareToken);
          }
          closeCenterModal();
          onFinalized?.(res.shareId, res.shareToken);
        } catch (err) {
          showToast(err.message);
          btn.disabled = false;
          btn.textContent = '✨ 立即生成定稿与 30 秒回放';
        }
      });
    }
  );
}

/**
 * FR-07.3 & v5.1 `shareToken`: Deliverable Share Overlay + 30-Second Scrubbable Process Replay
 */
export async function openSharePageOverlay(
  shareId,
  explicitShareToken = null,
  { onCloseShare = null, pushHistory = false } = {}
) {
  const overlay = document.getElementById('shareOverlay');
  if (!overlay) return;

  const urlParams = new URLSearchParams(location.search);
  const resolvedToken =
    explicitShareToken ||
    urlParams.get('t') ||
    urlParams.get('shareToken') ||
    loadShareToken(shareId) ||
    (state.latestSnapshot?.id === shareId ? state.latestShareToken : null) ||
    '';

  if (resolvedToken) {
    state.activeShareToken = resolvedToken;
    saveShareToken(shareId, resolvedToken);
  }

  try {
    const [bundle, replay] = await Promise.all([
      api.getShare(shareId, resolvedToken),
      api.getShareReplay(shareId, resolvedToken),
    ]);

    state.activeShareBundle = bundle;
    state.replayData = replay;
    state.replayIndex = replay.keyframes.length - 1;
    if (state.replayTimer) {
      clearInterval(state.replayTimer);
      state.replayTimer = null;
    }

    const sharePath = `/share/${encodeURIComponent(shareId)}${resolvedToken ? `?t=${encodeURIComponent(resolvedToken)}` : ''}`;
    const shareFullUrl = `${location.origin}${sharePath}`;
    if (pushHistory) {
      history.pushState({}, '', sharePath);
    } else {
      history.replaceState({}, '', sharePath);
    }

    const mcpRoomUrl =
      state.mcpConnectInfo?.roomUrl || `${location.origin}/room/${bundle.roomMeta?.id || ''}`;
    const mcpPullCmd = `请调用 Omind MCP 工具 omind_pull_deliverable（携带成员或房间凭证）读取 ${mcpRoomUrl} 的定稿成品与我的待办；若细节有疑问再调用 omind_query_room_raw 按需穿透检索原始会议记录。`;
    const hasSameRoomMounted = Boolean(state.roomId && state.roomId === bundle.roomMeta?.id);

    overlay.innerHTML = `
      <div class="overlay-container">
        <div class="glass-panel" style="padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="/logo.svg" alt="Omind" style="width:28px;height:28px;" />
            <div>
              <div style="font-weight:700;font-size:15px;">${escapeHtml(bundle.snapshot.title)}</div>
              <div style="font-size:11.5px;color:#78716C;">只读定稿快照 <code>${escapeHtml(shareId)}</code> · 关键帧 #E1 ~ #E${bundle.snapshot.rawEventEndSeq}（原始聊天与 PA 隐私已隔离）</div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${
              hasSameRoomMounted
                ? `<select id="shareRecompileTpl" class="form-input" style="width:auto;padding:5px 10px;font-size:12px;">
                    ${(bundle.templates || [])
                      .map(
                        (t) =>
                          `<option value="${escapeHtml(t.id)}" ${t.id === bundle.snapshot.templateId ? 'selected' : ''}>切换模板：${escapeHtml(t.name)}</option>`
                      )
                      .join('')}
                   </select>`
                : ''
            }
            <button id="copyShareLinkBtn" type="button" class="btn btn-subtle">🔗 复制安全分享链接（可贴入新桌面继承）</button>
            <button id="copyShareMdBtn" type="button" class="btn btn-subtle">📄 复制 Markdown</button>
            <button id="copyShareMcpBtn" type="button" class="btn btn-primary">🔌 复制 MCP 拉取口令</button>
            <button id="closeShareOverlayBtn" type="button" class="btn btn-ghost">
              ${hasSameRoomMounted ? '返回桌面 ✕' : '← 前往 Omind 首页'}
            </button>
          </div>
        </div>

        <div class="replay-player-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:700;font-size:13px;color:#4F46E5;">▶️ 30 秒共创推演回放（拖动滑块秒懂结论怎么来的）</div>
            <span id="replayClockLabel" style="font-family:var(--font-mono);font-size:12px;color:#57534E;">30.0s / 30.0s</span>
          </div>
          <div class="replay-controls-row">
            <button id="replayPlayBtn" type="button" class="btn btn-xs btn-primary">▶ 播放回放</button>
            <input
              id="replayRangeInput"
              type="range"
              class="replay-slider"
              min="0"
              max="${Math.max(0, replay.keyframes.length - 1)}"
              value="${Math.max(0, replay.keyframes.length - 1)}"
            />
            <span id="replayStepBadge" class="tiny-badge">#E${bundle.snapshot.rawEventEndSeq}</span>
          </div>
          <div id="replayStagePreview" class="replay-stage-preview"></div>
        </div>

        <article class="share-doc-card" id="shareDocBody">
          ${renderMarkdownHtml(bundle.snapshot.compiledMarkdown)}
        </article>
      </div>
    `;

    overlay.classList.remove('hidden');

    const renderReplayFrameAt = (idx) => {
      const kf = replay.keyframes[idx];
      if (!kf) return;
      state.replayIndex = idx;
      const slider = overlay.querySelector('#replayRangeInput');
      if (slider) slider.value = String(idx);
      const clock = overlay.querySelector('#replayClockLabel');
      if (clock) {
        clock.textContent = `${(kf.playbackTimeMs / 1000).toFixed(1)}s / 30.0s`;
      }
      const badge = overlay.querySelector('#replayStepBadge');
      if (badge) badge.textContent = `#E${kf.seq}`;

      const uptoFrames = replay.keyframes.slice(0, idx + 1);
      const artCount = uptoFrames.filter((f) => f.eventType === 'artifact.created').length;
      const linkCount = uptoFrames.filter((f) => f.eventType === 'link.created').length;
      const lockCount = uptoFrames.filter((f) => f.eventType === 'consensus.locked').length;
      const handCount = uptoFrames.filter((f) => f.eventType === 'hand.raised').length;

      const stageEl = overlay.querySelector('#replayStagePreview');
      if (stageEl) {
        stageEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <span style="font-weight:700;color:#4F46E5;">[#E${kf.seq} · ${escapeHtml(kf.eventType)}]</span>
              <span style="margin-left:6px;font-weight:600;">${escapeHtml(kf.summaryText)}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:11.5px;color:#57534E;">
              <span>🗒 桌面落卡: <strong>${artCount}</strong></span>
              <span>🔗 语义连线: <strong>${linkCount}</strong></span>
              <span>🙋 角色举手: <strong>${handCount}</strong></span>
              <span>🔒 人类拍板: <strong>${lockCount}</strong></span>
            </div>
          </div>
        `;
      }
    };

    renderReplayFrameAt(Math.max(0, replay.keyframes.length - 1));

    overlay.querySelector('#replayRangeInput')?.addEventListener('input', (ev) => {
      renderReplayFrameAt(Number(ev.target.value));
    });

    overlay.querySelector('#replayPlayBtn')?.addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      if (state.replayTimer) {
        clearInterval(state.replayTimer);
        state.replayTimer = null;
        btn.textContent = '▶ 继续回放';
        return;
      }
      let cur = state.replayIndex >= replay.keyframes.length - 1 ? 0 : state.replayIndex;
      renderReplayFrameAt(cur);
      btn.textContent = '⏸ 暂停';

      const stepInterval = Math.max(
        260,
        Math.min(1100, Math.round(12_000 / Math.max(1, replay.keyframes.length)))
      );
      state.replayTimer = setInterval(() => {
        cur += 1;
        if (cur >= replay.keyframes.length) {
          clearInterval(state.replayTimer);
          state.replayTimer = null;
          btn.textContent = '▶ 重新回放';
          return;
        }
        renderReplayFrameAt(cur);
      }, stepInterval);
    });

    overlay.querySelector('#copyShareLinkBtn')?.addEventListener('click', () =>
      copyText(shareFullUrl, '🔗 已复制带凭证分享链接！在新桌面按 ⌘V 即可继承前序结论')
    );

    overlay.querySelector('#copyShareMdBtn')?.addEventListener('click', () =>
      copyText(bundle.snapshot.compiledMarkdown, '📄 已复制完整成品 Markdown')
    );

    overlay.querySelector('#copyShareMcpBtn')?.addEventListener('click', () =>
      copyText(mcpPullCmd, '🔌 已复制 MCP 拉取指令，可直接粘贴进 Cursor / Claude')
    );

    overlay.querySelector('#shareRecompileTpl')?.addEventListener('change', async (ev) => {
      const newTpl = ev.target.value;
      showToast('正在按所选模板重新编译快照…');
      const fin = await api.finalizeRoom(bundle.roomMeta.id, {
        templateId: newTpl,
        actorId: getCurrentParticipant().id,
      });
      if (fin.shareToken) saveShareToken(fin.shareId, fin.shareToken);
      openSharePageOverlay(fin.shareId, fin.shareToken, { onCloseShare });
    });

    overlay.querySelector('#closeShareOverlayBtn')?.addEventListener('click', () => {
      if (state.replayTimer) {
        clearInterval(state.replayTimer);
        state.replayTimer = null;
      }
      overlay.classList.add('hidden');
      if (onCloseShare) {
        onCloseShare(hasSameRoomMounted ? bundle.roomMeta?.id : null);
      } else if (hasSameRoomMounted && bundle.roomMeta?.id) {
        history.pushState({}, '', `/room/${encodeURIComponent(bundle.roomMeta.id)}`);
      } else {
        location.href = '/';
      }
    });
  } catch (err) {
    overlay.innerHTML = `
      <div class="overlay-container" style="max-width:520px;margin-top:80px;text-align:center;">
        <div class="glass-panel" style="padding:32px 28px;">
          <img src="/logo.svg" alt="Omind" style="width:40px;height:40px;margin-bottom:12px;" />
          <h2 style="margin:0 0 8px;font-size:18px;">无法读取该定稿分享页</h2>
          <p style="margin:0 0 20px;font-size:13px;color:#57534E;">${escapeHtml(err.message)}</p>
          <button id="errBackHomeBtn" type="button" class="btn btn-primary">← 返回 Omind 首页</button>
        </div>
      </div>
    `;
    overlay.classList.remove('hidden');
    overlay.querySelector('#errBackHomeBtn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
      if (onCloseShare) onCloseShare(null);
      else location.href = '/';
    });
  }
}
