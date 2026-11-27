/**
 * Omind v5.2 — Room Presets, Cute/Emoji Simulated Personas, Public Role Agents & Templates
 * Matches PRD v5.2 FR-00, FR-01, FR-05, FR-07
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Last-Event-ID, Mcp-Session-Id, X-Omind-Flush-Triage, X-Share-Token',
};

export const DEFAULT_REDLINE_TOPICS = [
  '排期死线变更',
  '预算报价承诺',
  '核心目标拍板',
  '敏感凭据',
];

export const REDLINE_KEYWORDS = [
  '死线',
  '截止',
  '延期',
  '提前上线',
  '排期变更',
  '上线时间',
  '周五前必须',
  '预算',
  '报价',
  '追加经费',
  '采购成本',
  '万块',
  '万元',
  '核心架构',
  '核心目标',
  '重构底层',
  '密钥',
  '凭据',
  '私钥',
  'secret',
  'password',
  'api_key',
];

export const CUTE_EMOJI_AVATARS = [
  { emoji: '🦊', bg: '#FFEDD5', label: '小狐狸' },
  { emoji: '🐼', bg: '#F1F5F9', label: '圆滚滚' },
  { emoji: '🦦', bg: '#FEF3C7', label: '小海獭' },
  { emoji: '🐰', bg: '#FCE7F3', label: '奶糖兔' },
  { emoji: '🐱', bg: '#FFEDD5', label: '橘猫仔' },
  { emoji: '🐨', bg: '#E0E7FF', label: '树袋熊' },
  { emoji: '🦉', bg: '#EDE9FE', label: '猫头鹰' },
  { emoji: '🦄', bg: '#F3E8FF', label: '独角兽' },
  { emoji: '🐸', bg: '#DCFCE7', label: '开心蛙' },
  { emoji: '🐙', bg: '#FFE4E6', label: '章鱼哥' },
  { emoji: '🦋', bg: '#DBEAFE', label: '蓝闪蝶' },
  { emoji: '🐥', bg: '#FEF9C3', label: '小黄鸭' },
  { emoji: '🐳', bg: '#E0F2FE', label: '小蓝鲸' },
  { emoji: '🐶', bg: '#FEF3C7', label: '柴柴' },
  { emoji: '🍓', bg: '#FFE4E6', label: '草莓果' },
  { emoji: '🥑', bg: '#DCFCE7', label: '牛油果' },
  { emoji: '🍄', bg: '#FFEDD5', label: '小蘑菇' },
  { emoji: '🐧', bg: '#E2E8F0', label: '小企鹅' },
  { emoji: '🐹', bg: '#FEF3C7', label: '仓鼠球' },
  { emoji: '🦖', bg: '#D1FAE5', label: '小恐龙' },
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

export const ROOM_PRESETS = {
  brainstorm_breakthrough: {
    id: 'brainstorm_breakthrough',
    name: '💡 破局脑暴局',
    shortLabel: '💡 脑暴新点子',
    emoji: '💡',
    tagline: '高密度发散碰撞 · 反常识破局 · 收敛创意方案大纲',
    enabledCognitiveRoles: ['host', 'spark', 'linker'],
    recommendedDomainRoles: ['target_user'],
    defaultTemplateId: 'creative_brief',
    starterPrompts: [
      '我们要给新用户首屏留存做一次反常识改版，现在注册转化率卡在 18%',
      '下季度想做一个病毒式传播的 AI 小工具引流，目标零投放获客',
    ],
  },
  decision_review: {
    id: 'decision_review',
    name: '⚖️ 方案拍板局',
    shortLabel: '⚖️ 方案二选一',
    emoji: '⚖️',
    tagline: '摆事实比方案 · 挑刺防盲点 · 锁定决策备忘录 / PRD',
    enabledCognitiveRoles: ['host', 'linker', 'critic'],
    recommendedDomainRoles: ['tech_feasibility', 'cost_risk'],
    defaultTemplateId: 'prd_or_decision_memo',
    starterPrompts: [
      '实时消息网关二选一：继续用 SSE + Last-Event-ID 还是切全双工 WebSocket？',
      '个人 Agent 到底自建记忆库还是走纯 MCP 连接器模式？今天拍板定方案',
    ],
  },
  schedule_align: {
    id: 'schedule_align',
    name: '📋 排期对齐局',
    shortLabel: '📋 对齐排期',
    emoji: '📋',
    tagline: '理清上下游依赖 · 守住成员排期红线 · 生成可执行排期表',
    enabledCognitiveRoles: ['host', 'linker', 'critic'],
    recommendedDomainRoles: ['tech_feasibility'],
    defaultTemplateId: 'task_schedule',
    starterPrompts: [
      '下周三要发正式版，前端画布、MCP 服务端和自动化验收怎么分工对齐？',
      '大促压测与支付风控改造排期对齐，梳理阻塞依赖与里程碑',
    ],
  },
};

export const BUILTIN_ROLE_CATALOG = [
  {
    roleKey: 'host',
    dimension: 'cognitive',
    displayName: 'Host 控场记录',
    badgeEmoji: '🎯',
    color: '#4F46E5',
    behaviorMode: 'silent_board',
    systemInstruction:
      '静默控场与高信噪比记录官：提炼发言中的核心事实、决策草案、待决问题与行动项上墙，协调个人 PA 上下文引用，绝不公屏刷屏或篡改人类已锁定结论。',
  },
  {
    roleKey: 'linker',
    dimension: 'cognitive',
    displayName: 'Linker 逻辑串联',
    badgeEmoji: '🔗',
    color: '#7C3AED',
    behaviorMode: 'silent_board',
    systemInstruction:
      '空间逻辑串联官：识别卡片之间的资料佐证(support)、互补推导(derive)与观点冲突(conflict)，并检测与前序会议锁定结论的冲突拉出橙色预警虚线。',
  },
  {
    roleKey: 'spark',
    dimension: 'cognitive',
    displayName: 'Spark 跳脱者',
    badgeEmoji: '💡',
    color: '#D97706',
    behaviorMode: 'hand_raise_or_spark',
    systemInstruction:
      '第一性原理破局搭档：跳出惯性假设，用反常识逆向提问（如砍掉步骤、反转流程、极简替代）激发灵感；多人局仅用 ≤20 字悬念钩子举手。',
  },
  {
    roleKey: 'critic',
    dimension: 'cognitive',
    displayName: 'Critic 挑刺者',
    badgeEmoji: '🔍',
    color: '#E11D48',
    behaviorMode: 'hand_raise_or_spark',
    systemInstruction:
      '魔鬼代言人与边界审视官：专门寻找方案中的隐含假设、极端故障边界、遗漏迁移成本与自相矛盾处；多人局克制举手，点中要害。',
  },
  {
    roleKey: 'tech_feasibility',
    dimension: 'domain',
    displayName: '技术可行性',
    badgeEmoji: '🛠',
    color: '#0284C7',
    behaviorMode: 'hand_raise_or_spark',
    systemInstruction:
      '架构与工程落地顾问：评估接口复杂度、边缘运行时限制、存储一致性、延迟与技术债风险，给出最小可行工程路径。',
  },
  {
    roleKey: 'cost_risk',
    dimension: 'domain',
    displayName: '成本与风控',
    badgeEmoji: '🛡',
    color: '#059669',
    behaviorMode: 'hand_raise_or_spark',
    systemInstruction:
      'Token 算力成本、ROI 与合规安全风控官：审视大模型调用频次成本、账单放大倍数、权限越界与数据隐私风险。',
  },
  {
    roleKey: 'target_user',
    dimension: 'domain',
    displayName: '挑剔目标用户',
    badgeEmoji: '🧑‍💻',
    color: '#9333EA',
    behaviorMode: 'hand_raise_or_spark',
    systemInstruction:
      '真实一线挑剔用户替身：以“前 15 秒用不明白就关掉”的严苛体感审视交互心智负担、冷启动阻力与实际获得感。',
  },
];

export const DELIVERABLE_TEMPLATES = {
  creative_brief: {
    id: 'creative_brief',
    name: '💡 创意方案大纲',
    subtitle: '核心洞察 · 入选破局方向 · 关键灵感池 · 下一步验证实验',
  },
  prd_or_decision_memo: {
    id: 'prd_or_decision_memo',
    name: '⚖️ PRD / 决策备忘录',
    subtitle: '背景目标 · 已拍板核心决策与原话锚点 · 待决分歧与待签 · 行动项',
  },
  task_schedule: {
    id: 'task_schedule',
    name: '📋 任务排期与依赖表',
    subtitle: '里程碑 · 负责人与截止时间 · 上下游依赖链路 · 已识别风险',
  },
  client_minutes: {
    id: 'client_minutes',
    name: '🤝 客户共创纪要',
    subtitle: '共识边界 · 客户反馈原话锚点 · 双方交付分工与确认项',
  },
  custom_outline: {
    id: 'custom_outline',
    name: '📝 自定义段落大纲',
    subtitle: '按自定义章节骨架 + 人类锁定结论 + 强制避坑附录编译',
  },
};

export const PARTICIPANT_PALETTE = [
  '#4F46E5',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#0284C7',
  '#E11D48',
  '#0D9488',
];

export function pickParticipantColor(indexOrName = 0) {
  if (typeof indexOrName === 'number') {
    return PARTICIPANT_PALETTE[Math.abs(indexOrName) % PARTICIPANT_PALETTE.length];
  }
  const matched = SIMULATED_PERSONAS.find(
    (p) => p.name.toLowerCase() === String(indexOrName || '').trim().toLowerCase()
  );
  if (matched?.color) return matched.color;

  let hash = 0;
  const s = String(indexOrName || 'user');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return PARTICIPANT_PALETTE[Math.abs(hash) % PARTICIPANT_PALETTE.length];
}

export function makeAvatarText(name = '', explicitAvatar = null) {
  if (explicitAvatar && String(explicitAvatar).trim()) {
    return String(explicitAvatar).trim();
  }
  const clean = String(name || '').trim();
  if (!clean) return '🦊';

  // Match known persona first
  const matched = SIMULATED_PERSONAS.find(
    (p) => p.name.toLowerCase() === clean.toLowerCase()
  );
  if (matched?.avatar) return matched.avatar;

  // Deterministic cute emoji assignment based on name hash
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 33 + clean.charCodeAt(i)) | 0;
  }
  return CUTE_EMOJI_AVATARS[Math.abs(hash) % CUTE_EMOJI_AVATARS.length].emoji;
}
