/**
 * Omind v5.2 — Mandatory 20-Case E2E Acceptance Test Matrix (PRD v5.2 Section 7: T01 - T20)
 * Covers all v5.0 Core Specs + v5.1 Auth/Claim/ShareToken/RAW Isolation + v5.2 Starter Case & Cute Personas.
 * Runs 100% deterministically with zero external LLM API keys required (`local_fallback`).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createNodeHttpHandler, createNodeRoomCluster } from '../src/router.mjs';

let handler;
const baseUrl = 'https://kokowork.top';
let cluster;
let simulatedNowMs = Date.parse('2026-11-26T02:00:00.000Z');

async function apiReq(method, path, body = undefined, headers = {}) {
  let status = 200;
  const resHeaders = {};
  let rawBody = '';

  const normalizedHeaders = { host: 'kokowork.top', 'x-forwarded-proto': 'https' };
  for (const [k, v] of Object.entries(headers || {})) {
    normalizedHeaders[k.toLowerCase()] = v;
  }

  const mockReq = {
    method,
    url: path,
    headers: normalizedHeaders,
    _parsedBody: body ?? {},
    on() {},
  };

  const mockRes = {
    writeHead(code, hdrs = {}) {
      status = code;
      Object.assign(resHeaders, hdrs);
    },
    write(chunk = '') {
      rawBody += chunk;
    },
    end(chunk = '') {
      rawBody += chunk;
    },
  };

  await handler(mockReq, mockRes);
  let json = null;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    json = { raw: rawBody };
  }
  return { status, data: json, headers: resHeaders };
}

async function mcpCall(toolName, args, bearerToken = null) {
  const headers = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await apiReq(
    'POST',
    '/mcp',
    {
      jsonrpc: '2.0',
      id: `rpc_${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    },
    headers
  );
  return res;
}

describe('Omind v5.2 — Full PRD Acceptance Matrix (T01 ~ T20)', () => {
  before(async () => {
    cluster = createNodeRoomCluster({
      dataDir: null,
      triageDebounceMs: 0,
      fastDebounceMs: 0,
      handRaiseFoldMs: 30_000,
      roleCooldownMs: 60_000,
      nowFn: () => simulatedNowMs,
      seedShowcase: true,
    });

    handler = createNodeHttpHandler(cluster);
  });

  after(async () => {
    cluster.closeAll();
  });

  it('T01: 1-Room-1-DO 物理隔离 — 并发创建 Room A 与 Room B，互相读写零串数据、事件序号各自从 1 递增', async () => {
    const [resA, resB] = await Promise.all([
      apiReq('POST', '/api/rooms', {
        title: 'Room Alpha 独立测试房',
        presetId: 'brainstorm_breakthrough',
        creatorName: 'Alice',
      }),
      apiReq('POST', '/api/rooms', {
        title: 'Room Beta 独立测试房',
        presetId: 'schedule_align',
        creatorName: 'Bob',
      }),
    ]);

    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);
    assert.ok(resA.data.participantToken?.startsWith('ptk_'));
    assert.ok(resB.data.participantToken?.startsWith('ptk_'));

    const roomAId = resA.data.roomMeta.id;
    const roomBId = resB.data.roomMeta.id;
    assert.notEqual(roomAId, roomBId);
    assert.equal(resA.data.roomMeta.lastEventSeq, 1);
    assert.equal(resB.data.roomMeta.lastEventSeq, 1);

    await apiReq('POST', `/api/rooms/${roomAId}/artifacts`, {
      type: 'sticky',
      title: 'Alpha 专属机密卡片',
      content: '仅存在于 Room A SQLite 实例中',
      x: 150,
      y: 160,
      authorId: resA.data.creator.id,
    });

    const [stateA, stateB] = await Promise.all([
      apiReq('GET', `/api/rooms/${roomAId}`),
      apiReq('GET', `/api/rooms/${roomBId}`),
    ]);

    assert.ok(stateA.data.artifacts.some((a) => a.title === 'Alpha 专属机密卡片'));
    assert.equal(stateB.data.artifacts.length, 0, 'Room B must have zero leaked artifacts');
    assert.equal(stateB.data.roomMeta.lastEventSeq, 1, 'Room B seq remains untouched at 1');
  });

  it('T02: 3 套预设局初始化 — 分别用 3 个 presetId 建房，验证 room_roles、default_template_id 与凭证签发', async () => {
    const cases = [
      {
        presetId: 'brainstorm_breakthrough',
        expectedEnabled: ['host', 'spark', 'linker'],
        expectedTemplate: 'creative_brief',
      },
      {
        presetId: 'decision_review',
        expectedEnabled: ['host', 'linker', 'critic'],
        expectedTemplate: 'prd_or_decision_memo',
      },
      {
        presetId: 'schedule_align',
        expectedEnabled: ['host', 'linker', 'critic'],
        expectedTemplate: 'task_schedule',
      },
    ];

    for (const c of cases) {
      const res = await apiReq('POST', '/api/rooms', {
        title: `预设测试-${c.presetId}`,
        presetId: c.presetId,
        creatorName: '林知夏',
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.roomMeta.defaultTemplateId, c.expectedTemplate);
      assert.ok(res.data.participantToken?.startsWith('ptk_'));
      assert.ok(res.data.mcpToken?.startsWith('omind_mcp_'));
      assert.equal(res.data.creator.avatar, '🦊');

      const enabledKeys = res.data.roles
        .filter((r) => r.enabled)
        .map((r) => r.roleKey)
        .sort();
      assert.deepEqual(enabledKeys, [...c.expectedEnabled].sort());
    }
  });

  it('T03: 15 秒冷启动自动破冰 — 空房收到首条语音/链接后，自动生成 >=2 张初始锚点卡并解除空态', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '冷启动破冰验证房',
      presetId: 'brainstorm_breakthrough',
      creatorName: '岚姐',
    });
    const roomId = roomRes.data.roomMeta.id;
    const creatorId = roomRes.data.creator.id;
    assert.equal(roomRes.data.artifacts.length, 0);

    const msgRes = await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: creatorId,
      inputModality: 'voice_ptt',
      voiceDurationMs: 5200,
      content: '今天想解决新用户进房后不知道怎么开口的问题，目前首屏流失率高达 45%，希望 15 秒内完成破冰。',
    });

    assert.equal(msgRes.status, 201);
    assert.ok(msgRes.data.coldStartCards.length >= 2);

    const state = await apiReq('GET', `/api/rooms/${roomId}`);
    const contextAnchors = state.data.artifacts.filter((a) => a.metadata?.coldStartAnchor);
    assert.ok(contextAnchors.length >= 2);
  });

  it('T04: 空间锚定语音绑定 — 带 anchorArtifactIds 提交语音条，验证消息保存锚点且 Triage Router 针对该卡输出动作', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '空间锚定语音测试房',
      presetId: 'decision_review',
      creatorName: '陈默',
    });
    const roomId = roomRes.data.roomMeta.id;
    const uid = roomRes.data.creator.id;

    const artRes = await apiReq('POST', `/api/rooms/${roomId}/artifacts`, {
      type: 'sticky',
      title: '网关限流策略 v1',
      content: '每 IP 每分钟限制 60 次请求',
      x: 200,
      y: 180,
      authorId: uid,
    });
    const targetCardId = artRes.data.artifact.id;

    const voiceRes = await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: uid,
      inputModality: 'spatial_voice',
      voiceDurationMs: 3600,
      anchorArtifactIds: [targetCardId],
      content: '这张限流卡有个隐患：企业 NAT 出口共享同个 IP 会误伤正常团队，需要按 roomId + token 限流。',
    });

    assert.equal(voiceRes.status, 201);
    assert.deepEqual(voiceRes.data.message.anchorArtifactIds, [targetCardId]);

    const state = await apiReq('GET', `/api/rooms/${roomId}`);
    const linkedToTarget = state.data.links.filter(
      (l) => l.toArtifactId === targetCardId || l.fromArtifactId === targetCardId
    );
    assert.ok(linkedToTarget.length >= 1);
  });

  it('T05: 单人局自动落火花区 — activeHumanCount = 1 时触发新观点，spark 自动在 spark_zone 生成卡片', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '单人智囊模式测试',
      presetId: 'brainstorm_breakthrough',
      creatorName: 'SoloFounder',
    });
    const roomId = roomRes.data.roomMeta.id;
    const uid = roomRes.data.creator.id;
    assert.equal(roomRes.data.roomMeta.pacingMode, 'solo');

    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: uid,
      content: '我们准备做一个四步向导表单让用户配置 AI 角色参数，转化率怎么提升？',
    });

    const state = await apiReq('GET', `/api/rooms/${roomId}`);
    const sparkZoneCards = state.data.artifacts.filter((a) => a.zone === 'spark_zone');
    assert.ok(sparkZoneCards.length >= 1);
  });

  it('T06: 多人局防刷屏举手约束 — activeHumanCount = 3 时，spark/critic 仅生成 <=20 字举手气泡且单次 <=1 个、冷却 60s 内不重复举手', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '多人防刷屏举手测试',
      presetId: 'decision_review',
      creatorName: 'User1',
    });
    const roomId = roomRes.data.roomMeta.id;
    const u1 = roomRes.data.creator.id;

    await apiReq('PATCH', `/api/rooms/${roomId}/roles/spark`, { enabled: true });

    const join2 = await apiReq('POST', `/api/rooms/${roomId}/join`, {
      name: 'User2',
      roleTitle: '研发',
    });
    assert.ok(join2.data.participantToken?.startsWith('ptk_'));

    const join3 = await apiReq('POST', `/api/rooms/${roomId}/join`, {
      name: 'User3',
      roleTitle: '设计',
    });
    assert.equal(join3.data.pacingMode, 'multiplayer');
    assert.equal(join3.data.activeHumanCount, 3);

    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: u1,
      content: '我提议直接把全部前端状态都实时双写进浏览器 IndexedDB 并且重构全部接口！',
    });

    const state1 = await apiReq('GET', `/api/rooms/${roomId}`);
    const sparkZoneAuto = state1.data.artifacts.filter(
      (a) => a.zone === 'spark_zone' && a.metadata?.autoDroppedInSolo
    );
    assert.equal(sparkZoneAuto.length, 0);
    assert.equal(state1.data.handRaises.length, 1);
    const firstHr = state1.data.handRaises[0];
    assert.ok(Array.from(firstHr.teaser).length <= 20);
    assert.equal(firstHr.status, 'raised_teaser');

    for (const r of state1.data.roles) {
      if (r.behaviorMode === 'hand_raise_or_spark' && r.roleKey !== firstHr.roleKey && r.enabled) {
        await apiReq('PATCH', `/api/rooms/${roomId}/roles/${r.roleKey}`, { enabled: false });
      }
    }

    simulatedNowMs += 15_000;
    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: u1,
      content: '再补充一点：这个重构方案绝对没任何边界问题，明天就能全量切流！',
    });

    const state2 = await apiReq('GET', `/api/rooms/${roomId}`);
    assert.equal(state2.data.handRaises.length, 1);
  });

  it('T07: 举手懒展开与 30s 折叠 — 点击举手气泡后经 expanding -> expanded 落卡；未点击超 30s 自动转为 folded', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '举手展开与超时折叠测试',
      presetId: 'decision_review',
      creatorName: 'HostUser',
    });
    const roomId = roomRes.data.roomMeta.id;
    const u1 = roomRes.data.creator.id;
    await apiReq('POST', `/api/rooms/${roomId}/join`, { name: 'PeerUser', roleTitle: 'PM' });
    await apiReq('PATCH', `/api/rooms/${roomId}/roles/spark`, { enabled: true });

    simulatedNowMs += 70_000;
    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: u1,
      content: '讨论一下新版本转化方案，大家觉得怎么改最稳妥？',
    });

    let state = await apiReq('GET', `/api/rooms/${roomId}`);
    assert.equal(state.data.handRaises.length, 1);
    const hr1 = state.data.handRaises[0];
    assert.equal(hr1.status, 'raised_teaser');

    const expRes = await apiReq('POST', `/api/rooms/${roomId}/hand-raises/${hr1.id}/expand`, {
      actorId: u1,
    });
    assert.equal(expRes.status, 200);
    assert.equal(expRes.data.handRaise.status, 'expanded');
    assert.equal(expRes.data.artifact.zone, 'spark_zone');

    simulatedNowMs += 70_000;
    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: u1,
      content: '第二个议题：所有数据全部走同步阻塞写盘绝对不会超时吧？',
    });

    state = await apiReq('GET', `/api/rooms/${roomId}`);
    const hr2 = state.data.handRaises.find((h) => h.id !== hr1.id);
    assert.ok(hr2);
    assert.equal(hr2.status, 'raised_teaser');

    simulatedNowMs += 31_000;
    const stateAfter31s = await apiReq('GET', `/api/rooms/${roomId}`);
    const hr2After = stateAfter31s.data.handRaises.find((h) => h.id === hr2.id);
    assert.equal(hr2After.status, 'folded');
  });

  it('T08: MCP 会前读议题与投递 PA — 携带 roomToken 调 omind_get_room_topic 与 omind_submit_pa_brief，返回 claimCode 与 pending_claim', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: 'Q4 支付网关升级评审',
      topicSummary: '评估 Stripe 与本地渠道双活路由改造范围',
      presetId: 'decision_review',
      creatorName: '林岚',
    });
    const roomId = roomRes.data.roomMeta.id;
    const roomToken = roomRes.data.mcpToken;
    const roomUrl = `${baseUrl}/?room=${roomId}`;

    const listRes = await apiReq('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.result.tools.length, 4);

    // Without token -> must fail with -32001!
    const unauthTopic = await mcpCall('omind_get_room_topic', { roomUrl });
    assert.equal(unauthTopic.data.error.code, -32001);

    // With roomToken -> succeeds!
    const topicRes = await mcpCall('omind_get_room_topic', { roomUrl, roomToken });
    assert.equal(topicRes.status, 200);
    const topicOut = topicRes.data.result.structuredContent;
    assert.equal(topicOut.roomId, roomId);
    assert.equal(topicOut.title, 'Q4 支付网关升级评审');

    const briefRes = await mcpCall('omind_submit_pa_brief', {
      roomUrl,
      roomToken,
      participantName: '赵工',
      sourceClient: 'cursor',
      mode: 'context_only',
      summaryMarkdown: '支付清结算服务已完成幂等键改造，单机压测 QPS 达 3200。',
      facts: ['清结算服务幂等改造 PR #88 已合并主干，压测 3200 QPS 零差错'],
      stances: [{ topic: '双活切换方式', position: '先按 5% 灰度切流', rationale: '降低账务对账风险' }],
    });
    assert.equal(briefRes.status, 200);
    const briefOut = briefRes.data.result.structuredContent;
    assert.equal(briefOut.ok, true);
    assert.equal(briefOut.seatStatus, 'pending_claim');
    assert.ok(briefOut.claimCode?.startsWith('claim_'));
    assert.ok(briefOut.claimExpiresAt);

    const state = await apiReq('GET', `/api/rooms/${roomId}`);
    assert.equal(state.data.paBriefs.length, 1);
    assert.equal(state.data.paBriefs[0].pendingClaim, true);
  });

  it('T09: PA 仅上下文模式静默引用 — mode = context_only 时 PA 不公屏发言，仅由 Host 触发 pa.referenced 引用事实', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: 'PA 仅上下文静默核实测试',
      presetId: 'decision_review',
      creatorName: '林岚',
    });
    const roomId = roomRes.data.roomMeta.id;
    const creatorId = roomRes.data.creator.id;
    const roomToken = roomRes.data.mcpToken;

    const sub = await mcpCall('omind_submit_pa_brief', {
      roomUrl: roomId,
      roomToken,
      participantName: '苏架构',
      sourceClient: 'claude_code',
      mode: 'context_only',
      summaryMarkdown: 'Redis 缓存集群当前水位仅 22%，支持新会话索引。',
      facts: ['Redis 集群当前内存水位 22%，P99 延迟 1.4ms'],
    });
    const suId = sub.data.result.structuredContent.participantId;

    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: creatorId,
      content: '@苏架构 请核实一下目前 Redis 缓存集群的内存水位和延迟能不能扛住？',
    });

    const state = await apiReq('GET', `/api/rooms/${roomId}`);
    const paChatMsgs = state.data.messages.filter((m) => m.senderType === 'pa_proxy');
    assert.equal(paChatMsgs.length, 0);

    const briefAfter = state.data.paBriefs.find((b) => b.participantId === suId);
    assert.ok(briefAfter.referenceCount >= 1);

    const hostQuoteCards = state.data.artifacts.filter(
      (a) => a.type === 'pa_quote_card' && a.authorId === 'host'
    );
    assert.ok(hostQuoteCards.length >= 1);
  });

  it('T10, T11 & T18: PA 分级代答 + 红线硬拦截 + claimCode 认领防冒领 + Bearer Token 待签专属权限', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: 'PA 分级代答与红线认领签字测试',
      presetId: 'schedule_align',
      creatorName: '林岚',
    });
    const roomId = roomRes.data.roomMeta.id;
    const linId = roomRes.data.creator.id;
    const linToken = roomRes.data.participantToken;
    const roomToken = roomRes.data.mcpToken;

    // 1. Pre-meeting PA submission returns one-time `claimCode`
    const sub = await mcpCall('omind_submit_pa_brief', {
      roomUrl: roomId,
      roomToken,
      participantName: '周予',
      sourceClient: 'cursor',
      mode: 'proxy_tiered',
      summaryMarkdown: '客户端常规联调本周五可提测；排期死线变更或预算追加需本人签字。',
      facts: ['iOS 与 Web EventSource 联调进度已完成 85%'],
      stances: [{ topic: '联调提测进度', position: '常规联调周五准时提测' }],
      allowedAutoTopics: ['联调进度'],
      redlineTopics: ['排期死线变更', '预算报价承诺'],
    });
    const pendingZhouId = sub.data.result.structuredContent.participantId;
    const claimCode = sub.data.result.structuredContent.claimCode;
    assert.ok(claimCode?.startsWith('claim_'));

    // 2. Regular progress question while Zhou is offline -> concise PA proxy card
    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: linId,
      content: '@周予 客户端常规联调进度目前怎么样？',
    });

    let state = await apiReq('GET', `/api/rooms/${roomId}`);
    const proxyCard = state.data.artifacts.find(
      (a) => a.type === 'pa_quote_card' && a.authorType === 'pa_proxy'
    );
    assert.ok(proxyCard);
    assert.ok(proxyCard.title.includes('🤖 周予的 PA 代言'));

    // 3. Redline trigger -> forces `pending_human_signoff`!
    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: linId,
      content: '@周予 客户要求把上线排期死线提前到明早 9 点，并追加 15 万元外包预算！',
    });

    state = await apiReq('GET', `/api/rooms/${roomId}`);
    const pendingItem = state.data.consensusItems.find(
      (c) => c.signoffStatus === 'pending_human_signoff' && c.ownerParticipantId === pendingZhouId
    );
    assert.ok(pendingItem);

    // T18a: Impostor joins with the SAME name `'周予'` WITHOUT `claimCode` -> gets separate seat & CANNOT hijack!
    const impostorJoin = await apiReq('POST', `/api/rooms/${roomId}/join`, {
      name: '周予',
      roleTitle: '冒名访客',
    });
    const impostorToken = impostorJoin.data.participantToken;
    assert.notEqual(impostorJoin.data.participantId, pendingZhouId);

    const impostorSign = await apiReq(
      'POST',
      `/api/rooms/${roomId}/consensus/${pendingItem.id}/signoff`,
      { decision: 'signed' },
      { Authorization: `Bearer ${impostorToken}` }
    );
    assert.equal(impostorSign.status, 403, 'Same-name impostor without claimCode MUST get 403');

    // T11a: Unauthenticated signoff -> 401; Lin (non-owner) signoff -> 403
    const noTokenSign = await apiReq(
      'POST',
      `/api/rooms/${roomId}/consensus/${pendingItem.id}/signoff`,
      { decision: 'signed' }
    );
    assert.equal(noTokenSign.status, 401);

    const linIllegalSign = await apiReq(
      'POST',
      `/api/rooms/${roomId}/consensus/${pendingItem.id}/signoff`,
      { decision: 'signed' },
      { Authorization: `Bearer ${linToken}` }
    );
    assert.equal(linIllegalSign.status, 403);

    // T18b: Real Zhou joins & claims PA brief with `claimCode` -> binds PA + migrates pending signoffs to realZhouId!
    const realZhouJoin = await apiReq('POST', `/api/rooms/${roomId}/join`, {
      name: '周予',
      roleTitle: '客户端负责人',
    });
    const zhouToken = realZhouJoin.data.participantToken;
    const realZhouId = realZhouJoin.data.participantId;

    const claimRes = await apiReq(
      'POST',
      `/api/rooms/${roomId}/pa-briefs/claim`,
      { claimCode },
      { Authorization: `Bearer ${zhouToken}` }
    );
    assert.equal(claimRes.status, 200);
    assert.equal(claimRes.data.brief.participantId, realZhouId);
    assert.equal(claimRes.data.brief.pendingClaim, false);

    // Re-using the consumed one-time `claimCode` MUST fail with 403!
    const replayClaim = await apiReq(
      'POST',
      `/api/rooms/${roomId}/pa-briefs/claim`,
      { claimCode },
      { Authorization: `Bearer ${impostorToken}` }
    );
    assert.equal(replayClaim.status, 403, 'One-time claimCode must be invalidated after claim');

    // Lin trying to PATCH Zhou's PA brief -> 403; Zhou PATCHing his own PA brief -> 200!
    const linPatchBrief = await apiReq(
      'PATCH',
      `/api/rooms/${roomId}/pa-briefs/${realZhouId}`,
      { mode: 'context_only' },
      { Authorization: `Bearer ${linToken}` }
    );
    assert.equal(linPatchBrief.status, 403);

    const zhouPatchBrief = await apiReq(
      'PATCH',
      `/api/rooms/${roomId}/pa-briefs/${realZhouId}`,
      { mode: 'proxy_tiered' },
      { Authorization: `Bearer ${zhouToken}` }
    );
    assert.equal(zhouPatchBrief.status, 200);

    // T11b: Real Zhou signs off with `Bearer <zhouToken>` -> 200 `signed` + `locked`!
    const validSign = await apiReq(
      'POST',
      `/api/rooms/${roomId}/consensus/${pendingItem.id}/signoff`,
      {
        decision: 'signed',
        editedContent: '经周予本人确认：仅核心链路周四晚灰度，不追加外部预算。',
      },
      { Authorization: `Bearer ${zhouToken}` }
    );
    assert.equal(validSign.status, 200);
    assert.equal(validSign.data.item.signoffStatus, 'signed');
    assert.equal(validSign.data.item.status, 'locked');
  });

  it('T12: 人类锁定防覆写与过期传导 — 修改已锁定上游决策后，下游自动标 stale_upstream 并挂载 revision_proposals，AI 严禁直接覆写锁定项', async () => {
    const roomRes = await apiReq('POST', '/api/rooms', {
      title: '因果依赖与锁定防覆写测试',
      presetId: 'decision_review',
      creatorName: '架构负责人',
    });
    const roomId = roomRes.data.roomMeta.id;
    const uid = roomRes.data.creator.id;

    const upRes = await apiReq('POST', `/api/rooms/${roomId}/consensus`, {
      section: 'decision',
      content: '实时网关统一采用 SSE + Last-Event-ID 协议',
      status: 'locked',
      actorId: uid,
    });
    const upstreamId = upRes.data.item.id;

    const downRes = await apiReq('POST', `/api/rooms/${roomId}/consensus`, {
      section: 'action_item',
      content: '前端完成基于 SSE EventSource 的断线重连封装',
      dependsOnIds: [upstreamId],
      status: 'locked',
      actorId: uid,
    });
    const downstreamId = downRes.data.item.id;

    await apiReq('POST', `/api/rooms/${roomId}/messages`, {
      senderId: uid,
      content: 'AI提议修改锁定结论：建议把结论改为轮询方案',
    });

    let state = await apiReq('GET', `/api/rooms/${roomId}`);
    const upAfterAi = state.data.consensusItems.find((c) => c.id === upstreamId);
    assert.equal(upAfterAi.content, '实时网关统一采用 SSE + Last-Event-ID 协议');
    assert.ok(state.data.proposals.some((p) => p.targetItemId === upstreamId));

    const modRes = await apiReq('POST', `/api/rooms/${roomId}/consensus/${upstreamId}/lock`, {
      actorId: uid,
      content: '实时网关统一改用全双工 WebSocket 二进制协议',
    });
    assert.equal(modRes.status, 200);
    assert.ok(modRes.data.staleItems.some((s) => s.id === downstreamId));
    assert.ok(modRes.data.generatedProposals.some((p) => p.targetItemId === downstreamId));

    state = await apiReq('GET', `/api/rooms/${roomId}`);
    const downAfterMod = state.data.consensusItems.find((c) => c.id === downstreamId);
    assert.equal(downAfterMod.status, 'stale_upstream');
  });

  it('T13, T14, T15, T16, T19 & T20: 成品编译 + shareToken 校验与脱敏 + RAW 权限严格隔离 + 贴前序链接冲突预警 + 30s 过程回放', async () => {
    const r1 = await apiReq('POST', '/api/rooms', {
      title: '第一场：连接层技术选型定稿会',
      presetId: 'decision_review',
      creatorName: '林岚',
    });
    const room1Id = r1.data.roomMeta.id;
    const linId = r1.data.creator.id;
    const linParticipantToken = r1.data.participantToken;

    await apiReq('POST', `/api/rooms/${room1Id}/messages`, {
      senderId: linId,
      content: '内部讨论机密原话：旧版网关每年多花 48 万服务器预算，切勿外传原始记录。',
    });

    await apiReq('POST', `/api/rooms/${room1Id}/artifacts`, {
      type: 'sticky',
      title: '采用原生 SSE 推送',
      content: '复用 HTTP/2 流与 Last-Event-ID 序号补发，零双栈维护负担',
      x: 140,
      y: 140,
      authorId: linId,
    });

    const rejectedArtRes = await apiReq('POST', `/api/rooms/${room1Id}/artifacts`, {
      type: 'sticky',
      title: '自研 WebSocket 网关集群',
      content: '需要单独维护有状态长连接路由表与自定义心跳重传协议，成本过高决定放弃 WebSocket',
      x: 440,
      y: 140,
      authorId: linId,
    });
    await apiReq('PATCH', `/api/rooms/${room1Id}/artifacts/${rejectedArtRes.data.artifact.id}`, {
      isRejected: true,
      actorId: linId,
    });

    await apiReq('POST', `/api/rooms/${room1Id}/consensus`, {
      section: 'decision',
      content: '正式拍板采用 SSE + Last-Event-ID，明确放弃 WebSocket 自建网关',
      status: 'locked',
      actorId: linId,
    });

    await apiReq('POST', `/api/rooms/${room1Id}/consensus`, {
      section: 'action_item',
      content: '林岚输出 v5.2 接口契约文档并归档压测报告',
      ownerParticipantId: linId,
      dueDate: '周五 17:00',
      status: 'locked',
      actorId: linId,
    });

    // T13: Finalize Deliverable -> issues `shareToken` & embeds `?share=...&t=...`
    const finRes = await apiReq('POST', `/api/rooms/${room1Id}/finalize`, {
      templateId: 'prd_or_decision_memo',
      actorId: linId,
    });
    assert.equal(finRes.status, 201);
    const { shareId, shareToken, shareUrl, snapshot } = finRes.data;
    assert.ok(shareId.startsWith('shr_'));
    assert.ok(shareToken.startsWith('st_'));
    assert.ok(shareUrl.includes(`t=${shareToken}`));
    assert.ok(snapshot.compiledMarkdown.includes('正式拍板采用 SSE + Last-Event-ID'));
    assert.ok(snapshot.compiledMarkdown.includes('## 附：已排除方案与核心争论边界'));
    assert.ok(snapshot.compiledMarkdown.includes('自研 WebSocket 网关集群'));

    // T19: `GET /api/shares/:shareId` without `shareToken` -> 401; wrong `shareToken` -> 403; valid `shareToken` -> 200 sanitized!
    const noTokShare = await apiReq('GET', `/api/shares/${shareId}`);
    assert.equal(noTokShare.status, 401);

    const badTokShare = await apiReq('GET', `/api/shares/${shareId}?t=st_wrong_token`);
    assert.equal(badTokShare.status, 403);

    const okShare = await apiReq('GET', `/api/shares/${shareId}?t=${shareToken}`);
    assert.equal(okShare.status, 200);
    assert.equal(okShare.data.messages, undefined, 'Public share response must NEVER leak raw messages');
    assert.equal(okShare.data.paBriefs, undefined, 'Public share response must NEVER leak PA briefs');
    assert.equal(okShare.data.mcpConnectInfo, undefined, 'Public share response must NEVER leak room MCP token');

    // T20: Share vs RAW strict isolation — `shareToken` MUST be rejected on `omind_query_room_raw` & `omind_pull_deliverable`!
    const rawWithShareTok = await mcpCall('omind_query_room_raw', {
      roomOrShareUrl: shareUrl,
      token: shareToken,
      query: '为什么放弃 WebSocket',
    });
    assert.equal(
      rawWithShareTok.data.error.code,
      -32001,
      'shareToken MUST NOT be allowed to penetrate omind_query_room_raw'
    );

    const pullWithShareTok = await mcpCall('omind_pull_deliverable', {
      roomOrShareUrl: shareUrl,
      token: shareToken,
    });
    assert.equal(pullWithShareTok.data.error.code, -32001);

    // T14: Authorized `participantToken` succeeds on `omind_pull_deliverable` & `omind_query_room_raw`!
    const pullRes = await mcpCall('omind_pull_deliverable', {
      roomOrShareUrl: shareUrl,
      token: linParticipantToken,
      ownerFilter: '林岚',
    });
    assert.equal(pullRes.status, 200);
    const pulled = pullRes.data.result.structuredContent;
    assert.equal(pulled.shareId, shareId);
    assert.ok(pulled.myActionItems.some((a) => a.content.includes('接口契约文档')));

    const rawRes = await mcpCall('omind_query_room_raw', {
      roomOrShareUrl: shareUrl,
      token: linParticipantToken,
      query: '为什么放弃 WebSocket',
      topK: 5,
    });
    assert.equal(rawRes.status, 200);
    const rawOut = rawRes.data.result.structuredContent;
    assert.ok(rawOut.totalMatched >= 1);
    assert.ok(rawOut.snippets.some((s) => s.content.toLowerCase().includes('websocket')));

    // T15: Paste `shareUrl` (carrying `shareToken`) into Room 2 -> `prior_room_card` + automatic orange `conflict` link!
    const r2 = await apiReq('POST', '/api/rooms', {
      title: '第二场：客户端二期扩展评审',
      presetId: 'decision_review',
      creatorName: '新成员小王',
    });
    const room2Id = r2.data.roomMeta.id;
    const wangId = r2.data.creator.id;

    const impRes = await apiReq('POST', `/api/rooms/${room2Id}/artifacts/import-share`, {
      shareUrl,
      x: 120,
      y: 120,
      authorId: wangId,
    });
    assert.equal(impRes.status, 201);
    assert.equal(impRes.data.artifact.type, 'prior_room_card');
    const priorCardId = impRes.data.artifact.id;

    await apiReq('POST', `/api/rooms/${room2Id}/messages`, {
      senderId: wangId,
      content: '这期通知模块我们还是改用自研 WebSocket 网关集群吧！',
    });

    const r2State = await apiReq('GET', `/api/rooms/${room2Id}`);
    const priorConflictLink = r2State.data.links.find(
      (l) =>
        l.kind === 'conflict' &&
        (l.toArtifactId === priorCardId || l.fromArtifactId === priorCardId)
    );
    assert.ok(priorConflictLink);

    // T16: 30-Second Process Replay Keyframes (`GET /api/shares/:shareId/replay?t=shareToken`)
    const replayNoTok = await apiReq('GET', `/api/shares/${shareId}/replay`);
    assert.equal(replayNoTok.status, 401);

    const replayRes = await apiReq('GET', `/api/shares/${shareId}/replay?t=${shareToken}`);
    assert.equal(replayRes.status, 200);
    const keyframes = replayRes.data.keyframes;
    assert.ok(keyframes.length >= 4);
    for (let i = 1; i < keyframes.length; i += 1) {
      assert.ok(keyframes[i].seq > keyframes[i - 1].seq);
    }
  });

  it('T17: 自由桌面新手引导案例局 & 可爱风 Emoji 头像池 — 验证 seedStarterCase、30+ 模拟身份池与 reset-starter', async () => {
    const health = await apiReq('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.version, '5.2.0');
    assert.ok(health.data.personas.length >= 25, 'Should expose >= 25 diverse simulated personas');

    const defaultStarter = await apiReq('GET', '/api/rooms/room_starter_v5');
    assert.equal(defaultStarter.status, 200);
    assert.ok(
      defaultStarter.data.artifacts.some((a) => a.type === 'image' && a.metadata?.stepBadge === 1)
    );
    assert.ok(defaultStarter.data.handRaises.some((h) => h.status === 'raised_teaser'));

    const userStarter = await apiReq('POST', '/api/rooms', {
      title: '🌟 新手上手案例：首屏免注册体验改版共创',
      creatorName: '苏晓',
      creatorAvatar: '🐰',
      creatorColor: '#DB2777',
      allowTableSpeak: true,
      seedStarterCase: true,
    });
    assert.equal(userStarter.status, 201);
    const sid = userStarter.data.roomMeta.id;
    assert.equal(userStarter.data.creator.avatar, '🐰');
    assert.ok(userStarter.data.participantToken?.startsWith('ptk_'));
    assert.ok(userStarter.data.artifacts.length >= 5);

    const firstArtId = userStarter.data.artifacts[0].id;
    await apiReq('DELETE', `/api/rooms/${sid}/artifacts/${firstArtId}`);
    const resetRes = await apiReq('POST', `/api/rooms/${sid}/reset-starter`, {
      creatorName: '苏晓',
      creatorAvatar: '🐰',
      creatorColor: '#DB2777',
    });
    assert.equal(resetRes.status, 200);
    assert.ok(resetRes.data.artifacts.some((a) => a.id === 'art_guide_sketch'));
  });

  it('T21: 自由桌面卡片直接召唤 Agent (Role + PA 红线拦截) 与弹性连线原地改原因/删除', async () => {
    const created = await apiReq('POST', '/api/rooms', {
      title: '卡片召唤与弹性连线编辑测试',
      presetId: 'brainstorm_breakthrough',
      creatorName: '林溪',
      creatorAvatar: '🦊',
    });
    const rid = created.data.roomMeta.id;
    const linId = created.data.creator.id;
    const roomToken = created.data.mcpToken;

    const artRes = await apiReq('POST', `/api/rooms/${rid}/artifacts`, {
      type: 'sticky',
      title: '免注册首屏提案',
      content: '访客直接进入互动桌面体验，但如果把排期死线提前到明天上线会怎样？',
      x: 180,
      y: 160,
      authorId: linId,
    });
    const baseArtId = artRes.data.artifact.id;

    // 1. Summon Role Agent (`spark`) directly onto `baseArtId`
    const roleSummon = await apiReq(
      'POST',
      `/api/rooms/${rid}/artifacts/${baseArtId}/summon-agent`,
      {
        targetType: 'role',
        roleKey: 'spark',
        actorId: linId,
      }
    );
    assert.equal(roleSummon.status, 201);
    assert.ok(roleSummon.data.artifact?.id);
    assert.ok(roleSummon.data.link?.id);
    assert.equal(roleSummon.data.link.fromArtifactId, baseArtId);

    // 2. Patch link reason inline & delete test
    const linkId = roleSummon.data.link.id;
    const patchLnk = await apiReq('PATCH', `/api/rooms/${rid}/links/${linkId}`, {
      reason: '双击胶囊修改后的关联原因',
      actorId: linId,
    });
    assert.equal(patchLnk.status, 200);
    assert.equal(patchLnk.data.link.reason, '双击胶囊修改后的关联原因');

    // 3. Submit PA brief with redline & summon PA onto the card touching redline -> triggers signoff_card!
    const paSub = await mcpCall('omind_submit_pa_brief', {
      roomUrl: rid,
      roomToken,
      participantName: '周予',
      sourceClient: 'cursor',
      mode: 'proxy_tiered',
      summaryMarkdown: '常规接口已就绪，但排期死线变更必须本人签字。',
      redlineTopics: ['排期死线变更'],
    });
    const zhouSeatId = paSub.data.result.structuredContent.participantId;

    const paSummon = await apiReq(
      'POST',
      `/api/rooms/${rid}/artifacts/${baseArtId}/summon-agent`,
      {
        targetType: 'pa',
        participantId: zhouSeatId,
        actorId: linId,
      }
    );
    assert.equal(paSummon.status, 201);
    assert.equal(paSummon.data.redlineTriggered, true);
    assert.equal(paSummon.data.artifact.type, 'signoff_card');

    const delLnk = await apiReq('DELETE', `/api/rooms/${rid}/links/${linkId}`, {
      actorId: linId,
    });
    assert.equal(delLnk.status, 200);
    assert.equal(delLnk.data.deleted, true);
  });
});
