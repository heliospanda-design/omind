/**
 * Omind v5.2 — Frontend Reactive State, Token Storage & Rich Cute/Emoji Persona Pool
 */

export const CUTE_EMOJI_POOL = [
  { emoji: '🦊', bg: '#FFEDD5', color: '#EA580C', label: '小狐狸' },
  { emoji: '🐼', bg: '#F1F5F9', color: '#475569', label: '圆滚滚' },
  { emoji: '🦦', bg: '#FEF3C7', color: '#D97706', label: '小海獭' },
  { emoji: '🐰', bg: '#FCE7F3', color: '#DB2777', label: '奶糖兔' },
  { emoji: '🐱', bg: '#FFEDD5', color: '#EA580C', label: '橘猫仔' },
  { emoji: '🐨', bg: '#E0E7FF', color: '#4F46E5', label: '树袋熊' },
  { emoji: '🦉', bg: '#EDE9FE', color: '#7C3AED', label: '猫头鹰' },
  { emoji: '🦄', bg: '#F3E8FF', color: '#9333EA', label: '独角兽' },
  { emoji: '🐸', bg: '#DCFCE7', color: '#059669', label: '开心蛙' },
  { emoji: '🐙', bg: '#FFE4E6', color: '#E11D48', label: '章鱼哥' },
  { emoji: '🦋', bg: '#DBEAFE', color: '#2563EB', label: '蓝闪蝶' },
  { emoji: '🐥', bg: '#FEF9C3', color: '#CA8A04', label: '小黄鸭' },
  { emoji: '🐳', bg: '#E0F2FE', color: '#0284C7', label: '小蓝鲸' },
  { emoji: '🐶', bg: '#FEF3C7', color: '#D97706', label: '柴柴' },
  { emoji: '🍓', bg: '#FFE4E6', color: '#E11D48', label: '草莓果' },
  { emoji: '🥑', bg: '#DCFCE7', color: '#16A34A', label: '牛油果' },
  { emoji: '🍄', bg: '#FFEDD5', color: '#C2410C', label: '小蘑菇' },
  { emoji: '🐧', bg: '#E2E8F0', color: '#334155', label: '小企鹅' },
  { emoji: '🐹', bg: '#FEF3C7', color: '#B45309', label: '仓鼠球' },
  { emoji: '🦖', bg: '#D1FAE5', color: '#059669', label: '小恐龙' },
];

export const SIMULATED_PERSONAS = [
  { name: '林知夏', avatar: '🦊', color: '#EA580C', bg: '#FFEDD5', role: '产品负责人' },
  { name: '顾言', avatar: '🐼', color: '#475569', bg: '#F1F5F9', role: '全栈独立开发者' },
  { name: '沈牧', avatar: '🦦', color: '#D97706', bg: '#FEF3C7', role: 'AI 架构师' },
  { name: '苏晓', avatar: '🐰', color: '#DB2777', bg: '#FCE7F3', role: '增长产品经理' },
  { name: '陈默', avatar: '🐱', color: '#EA580C', bg: '#FFEDD5', role: '边缘系统架构师' },
  { name: '周予', avatar: '🐨', color: '#4F46E5', bg: '#E0E7FF', role: '客户端负责人' },
  { name: '陆鸣', avatar: '🦉', color: '#7C3AED', bg: '#EDE9FE', role: '技术总监 CTO' },
  { name: 'Mia 林', avatar: '🦄', color: '#9333EA', bg: '#F3E8FF', role: '创意总监 CCO' },
  { name: '唐棠', avatar: '🐸', color: '#059669', bg: '#DCFCE7', role: '高级产品经理' },
  { name: 'Alex', avatar: '🐙', color: '#E11D48', bg: '#FFE4E6', role: '交互设计师' },
  { name: '许知微', avatar: '🦋', color: '#2563EB', bg: '#DBEAFE', role: '内容主理人' },
  { name: '宋哲', avatar: '🐥', color: '#CA8A04', bg: '#FEF9C3', role: 'B端产品专家' },
  { name: '赵一鸣', avatar: '🐳', color: '#0284C7', bg: '#E0F2FE', role: '出海技术 VP' },
  { name: '林舒', avatar: '🐶', color: '#D97706', bg: '#FEF3C7', role: '品牌合伙人' },
  { name: '鹿溪', avatar: '🍓', color: '#E11D48', bg: '#FFE4E6', role: '体验研究员' },
  { name: 'Leo 陈', avatar: '🥑', color: '#16A34A', bg: '#DCFCE7', role: '前端主程' },
  { name: '温言', avatar: '🍄', color: '#C2410C', bg: '#FFEDD5', role: '设计系统负责人' },
  { name: '吴昊', avatar: '🐧', color: '#334155', bg: '#E2E8F0', role: '数据平台负责人' },
  { name: '糯米团', avatar: '🐹', color: '#B45309', bg: '#FEF3C7', role: '社区运营负责人' },
  { name: '凯文', avatar: '🦖', color: '#059669', bg: '#D1FAE5', role: 'AI 应用工程师' },
  { name: 'Joy 乔伊', avatar: '🐝', color: '#CA8A04', bg: '#FEF9C3', role: '项目经理 PMO' },
  { name: '程野', avatar: '🦔', color: '#57534E', bg: '#F5F5F4', role: '硬件产品经理' },
  { name: '夏禾', avatar: '🍀', color: '#059669', bg: '#D1FAE5', role: '增长分析师' },
  { name: '江澈', avatar: '🌙', color: '#4338CA', bg: '#E0E7FF', role: '后端主程' },
  { name: '桃夭', avatar: '🍑', color: '#DB2777', bg: '#FCE7F3', role: '视觉设计师' },
  { name: '麦子', avatar: '🥨', color: '#B45309', bg: '#FEF3C7', role: '独立创作者' },
  { name: '白露', avatar: '⛄', color: '#0284C7', bg: '#E0F2FE', role: '解决方案架构师' },
  { name: '砚青', avatar: '🎨', color: '#7C3AED', bg: '#EDE9FE', role: '工业设计总监' },
  { name: 'Chloe', avatar: '🦩', color: '#DB2777', bg: '#FCE7F3', role: '海外增长负责人' },
  { name: '林岚', avatar: '🦊', color: '#4F46E5', bg: '#EEF2FF', role: '产品负责人' },
];

export const PARTNER_COMPANIES = [
  '星澜智造', 'NovaFlow', '矩石科技', 'Looma AI', '青禾互娱',
  '砚山设计', 'CloudPulse', '深蓝动力', '极光工坊', 'Veloce Labs',
  '屿森消费', 'KiteWorks', '白鲸出海', '光年互动', '辰星医疗',
  'MonoStudio', '燧石数据', 'PixelCraft', '远川物流', 'Arcadia',
  '拾光硬件', 'NexusPay', '木棉内容', 'Zephyr Cloud', '澄海游戏',
  'Finch AI', '行云协作', 'Prism Design', '谷雨生物', 'OrbitOps',
];

export const EXEC_QUOTES = [
  { avatar: '🦉', bg: '#EDE9FE', name: '周凛', role: '矩石科技 · CTO', text: '以前评审架构光拉锯就两小时，现在各人把 Cursor 里的压测数据往桌上一贴，20 分钟拍板收工。' },
  { avatar: '🐶', bg: '#FEF3C7', name: '林舒', role: '屿森消费 · CCO', text: '最打动我的是 AI 不会在群里乱抢话，只在右上角举手提示一句，点开真有惊喜。' },
  { avatar: '🐥', bg: '#FEF9C3', name: '宋哲', role: 'NovaFlow · 产品总监 (PM)', text: '散会直接出带避坑记录的 PRD，研发拉进编辑器就能写代码，再也不用会后补两小时纪要。' },
  { avatar: '🦊', bg: '#FFEDD5', name: '陈予安', role: '砚山设计 · 设计合伙人', text: '终于有个白板不像飞机仪表盘了，客户点开链接就能指着草图说话，干净又舒服。' },
  { avatar: '🐳', bg: '#E0F2FE', name: '赵一鸣', role: '白鲸出海 · 技术 VP', text: '我在高铁上没空参会，我的 AI 先帮我同步了接口进度，改排期还自动留了签字卡等我确认。' },
  { avatar: '🐸', bg: '#DCFCE7', name: '唐棠', role: '青禾互娱 · 高级 PM', text: '30 秒过程回放简直救命，没参会的同事拖一下进度条，10 秒就看懂为什么放弃了 B 方案。' },
  { avatar: '🐧', bg: '#E2E8F0', name: '吴昊', role: '燧石数据 · CTO', text: '把上一场的定稿链接往新桌面一粘就能接着聊，前后结论冲突还会自动拉橙线提醒。' },
  { avatar: '🦋', bg: '#DBEAFE', name: '许知微', role: '木棉内容 · CCO', text: '界面温润安静，没有一点压迫感，我们团队现在每天早会都在上面定选题。' },
  { avatar: '🥑', bg: '#DCFCE7', name: 'Leo 陈', role: 'Veloce Labs · 前端主程', text: '聚光灯引导对新同事太友好了，第一次进来点 5 下就把空间语音和合成结论全学会了。' },
  { avatar: '🦄', bg: '#F3E8FF', name: 'Mia 林', role: 'Prism Design · CCO', text: '带分享凭证的定稿页对外给客户看刚刚好，内部讨论原话又完全隔离不会外泄。' },
];

export const state = {
  roomId: null,
  roomMeta: null,
  participants: [],
  roles: [],
  paBriefs: [],
  artifacts: [],
  links: [],
  messages: [],
  handRaises: [],
  consensusItems: [],
  proposals: [],
  latestSnapshot: null,
  latestShareToken: null,
  demoSeatTokens: null,
  presets: [],
  templates: [],
  mcpConnectInfo: null,
  knownRooms: [],

  currentParticipantId: null,
  currentParticipantToken: null,
  lastEventSeq: 0,
  sseSource: null,

  // Canvas & View Controls
  viewMode: 'freeform', // 'freeform' | 'cluster' | 'causal'
  starLayoutOn: false,
  starSubStyle: 'orbit', // 'orbit' (Mode 2+3 Concentric Gravity Orbits) | 'freecloud' (Mode 2 Free Cloud)
  starHoveredId: null,
  starPinnedId: null,
  starDraggingId: null,
  savedFreeformCoords: {},
  showMicroCursors: true,
  panX: 54,
  panY: 76,
  scale: 0.94,

  // Collapsible Top-Right Lists (Fixed Left-End Uncircled Chevron!) & Top-Left Host Digest Island
  usersListCollapsed: false,
  agentsListCollapsed: false,
  digestExpanded: false,
  highlightedArtifactIds: new Set(),

  // Interactive Selection, Inline Editing, Card Agent Summon & Elastic Linking
  hoveredArtifactId: null,
  selectedArtifactIds: new Set(),
  editingArtifactId: null,
  editingLinkId: null,
  activeAgentPickerCardId: null,
  linkingFromId: null,
  pointerCanvasX: 420,
  pointerCanvasY: 280,

  // Spotlight Onboarding State
  tourActive: false,
  tourStep: 0,
  completedSteps: new Set(),
  proactiveSuggestion: null,

  // Air Stream Chat
  airCollapsed: false,
  unreadAirCount: 0,

  // Active Share View & Replay
  activeShareBundle: null,
  activeShareToken: null,
  replayData: null,
  replayPlaying: false,
  replayTimer: null,
  replayIndex: 0,
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getCurrentParticipant() {
  return (
    state.participants.find((p) => p.id === state.currentParticipantId) ||
    state.participants[0] || {
      id: 'u_guest',
      name: '林知夏',
      avatar: '🦊',
      color: '#4F46E5',
      roleTitle: '协作者',
    }
  );
}

export function saveRoomParticipantChoice(roomId, participantId, participantToken = null) {
  try {
    const raw = JSON.parse(localStorage.getItem('omind_v5_seats') || '{}');
    raw[roomId] = participantId;
    localStorage.setItem('omind_v5_seats', JSON.stringify(raw));

    if (participantToken) {
      const tokMap = JSON.parse(localStorage.getItem('omind_v5_tokens') || '{}');
      tokMap[`${roomId}:${participantId}`] = participantToken;
      localStorage.setItem('omind_v5_tokens', JSON.stringify(tokMap));
      if (state.roomId === roomId && state.currentParticipantId === participantId) {
        state.currentParticipantToken = participantToken;
      }
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadRoomParticipantChoice(roomId) {
  try {
    const raw = JSON.parse(localStorage.getItem('omind_v5_seats') || '{}');
    return raw[roomId] || null;
  } catch {
    return null;
  }
}

export function loadRoomParticipantToken(roomId, participantId) {
  if (!roomId || !participantId) return null;
  try {
    const tokMap = JSON.parse(localStorage.getItem('omind_v5_tokens') || '{}');
    return tokMap[`${roomId}:${participantId}`] || null;
  } catch {
    return null;
  }
}

export function saveShareToken(shareId, shareToken) {
  if (!shareId || !shareToken) return;
  try {
    const map = JSON.parse(localStorage.getItem('omind_v5_share_tokens') || '{}');
    map[shareId] = shareToken;
    localStorage.setItem('omind_v5_share_tokens', JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function loadShareToken(shareId) {
  if (!shareId) return null;
  try {
    const map = JSON.parse(localStorage.getItem('omind_v5_share_tokens') || '{}');
    return map[shareId] || null;
  } catch {
    return null;
  }
}

export function rememberRecentRoom(summary) {
  if (!summary?.roomId) return;
  try {
    const list = JSON.parse(localStorage.getItem('omind_v5_rooms') || '[]');
    const filtered = list.filter((r) => r.roomId !== summary.roomId);
    filtered.unshift(summary);
    localStorage.setItem('omind_v5_rooms', JSON.stringify(filtered.slice(0, 20)));
  } catch {
    // ignore
  }
}

export function getLocalRecentRooms() {
  try {
    return JSON.parse(localStorage.getItem('omind_v5_rooms') || '[]');
  } catch {
    return [];
  }
}

export function showToast(message, durationMs = 2400) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, durationMs);
}

export async function copyText(text, successMsg = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(successMsg);
    return true;
  }
}

export function renderMarkdownHtml(md) {
  const lines = String(md || '').split('\n');
  const html = [];
  let inList = false;
  let inTable = false;

  const formatInline = (s) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const closeBlocks = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (inTable) {
      html.push('</tbody></table>');
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      closeBlocks();
      continue;
    }

    if (trimmed.startsWith('# ')) {
      closeBlocks();
      html.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeBlocks();
      html.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      closeBlocks();
      html.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      closeBlocks();
      html.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) {
        inTable = true;
        html.push(
          `<table><thead><tr>${cells.map((c) => `<th>${formatInline(c)}</th>`).join('')}</tr></thead><tbody>`
        );
      } else {
        html.push(`<tr>${cells.map((c) => `<td>${formatInline(c)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    if (/^(\s*)-\s+/.test(line)) {
      if (inTable) {
        html.push('</tbody></table>');
        inTable = false;
      }
      if (!inList) {
        inList = true;
        html.push('<ul>');
      }
      html.push(`<li>${formatInline(trimmed.replace(/^-\s+/, ''))}</li>`);
      continue;
    }

    closeBlocks();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeBlocks();
  return html.join('\n');
}
