import { z } from 'zod';

/**
 * 兑换码 = 充值渠道「兑换码」（driverCode `redeem_code`）下的卡密。
 *
 * 业务链路：后台按批次生成卡密 → 导出上架到发卡网售卖 → 用户在钱包输入卡密 →
 * 校验通过后生成一笔充值单（provider=redemption）按面值入账。
 *
 * 三层数据：
 * - 批次（Batch）：一次生成的一组同面值卡密，冻结 / 作废 / 导出都以批次为单位留痕；
 * - 卡密（Code）：每张卡一行，兑换后记下兑换账户、时间、IP、设备、充值单号；
 * - 兑换尝试（Attempt）：用户每次提交都记一行，含失败——枚举卡密、二次倒卖都从这里查。
 *
 * 金额为 CNY；时间为 epoch ms；明文卡密只在生成 / 导出的响应里出现一次，列表只给脱敏值。
 */

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'primary';

// ─── 批次 ───────────────────────────────────────────────────────────

export const batchStatusValues = ['active', 'frozen', 'voided'] as const;
export const batchStatusSchema = z.enum(batchStatusValues);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const BatchStatusLabel: Record<BatchStatus, string> = {
  active: '生效中',
  frozen: '已冻结',
  voided: '已作废',
};

/**
 * 形式（入账途径）：批次生成时定下、之后不可改，决定兑换生成的充值单记在哪个来源下。
 * 账户充值记「兑换码」、算充值并按业务计推荐返利；活动奖励、客服补偿是免费发放，不算充值、不返利。
 */
export const redemptionPurposeValues = ['recharge', 'reward', 'compensation'] as const;
export const redemptionPurposeSchema = z.enum(redemptionPurposeValues);
export type RedemptionPurpose = z.infer<typeof redemptionPurposeSchema>;

export const RedemptionPurposeLabel: Record<RedemptionPurpose, string> = {
  recharge: '账户充值',
  reward: '活动奖励',
  compensation: '客服补偿',
};

export const RedemptionPurposeTone: Record<RedemptionPurpose, Tone> = {
  recharge: 'primary',
  reward: 'warning',
  compensation: 'info',
};

export const redemptionBatchSchema = z.object({
  /** 批次号，如 RB20261017001。 */
  id: z.string(),
  name: z.string(),
  /** 渠道：手填的卡密售卖去处（如某个发卡网店铺），按渠道对账、出问题时按渠道冻结。 */
  salesChannel: z.string().nullable(),
  purpose: redemptionPurposeSchema,
  /** 单张面值（CNY）。 */
  faceValue: z.number(),
  quantity: z.number().int().positive(),
  redeemedCount: z.number().int().nonnegative(),
  frozenCount: z.number().int().nonnegative(),
  voidedCount: z.number().int().nonnegative(),
  status: batchStatusSchema,
  /** 卡密格式示意，如 MK-XXXX-XXXX-XXXX-XXXX。 */
  codePattern: z.string(),
  /** 单账户在本批次内最多兑换张数；null = 不限。 */
  perAccountLimit: z.number().int().positive().nullable(),
  createdAtUtc: z.number(),
});
export type RedemptionBatch = z.infer<typeof redemptionBatchSchema>;

export function batchUnusedCount(b: RedemptionBatch): number {
  return Math.max(0, b.quantity - b.redeemedCount - b.frozenCount - b.voidedCount);
}

/** 生效中：可以追加卡密、导出未兑换卡密。兑换码永久有效，没有过期。 */
export function isBatchActive(b: RedemptionBatch): boolean {
  return b.status === 'active';
}

/** 「已兑完」只是生效中的一种展示，不单列状态。 */
export function batchDisplayStatus(b: RedemptionBatch): { label: string; tone: Tone } {
  if (b.status === 'voided') return { label: '已作废', tone: 'info' };
  if (b.status === 'frozen') return { label: '已冻结', tone: 'danger' };
  if (batchUnusedCount(b) === 0) return { label: '已兑完', tone: 'success' };
  return { label: '生效中', tone: 'primary' };
}

// ─── 卡密 ───────────────────────────────────────────────────────────

export const codeStatusValues = ['unused', 'redeemed', 'frozen', 'voided'] as const;
export const codeStatusSchema = z.enum(codeStatusValues);
export type CodeStatus = z.infer<typeof codeStatusSchema>;

export const CodeStatusLabel: Record<CodeStatus, string> = {
  unused: '未兑换',
  redeemed: '已兑换',
  frozen: '已冻结',
  voided: '已作废',
};

export const CodeStatusTone: Record<CodeStatus, Tone> = {
  unused: 'warning',
  redeemed: 'success',
  frozen: 'danger',
  voided: 'info',
};

const accountRefSchema = z.object({
  uid: z.string(),
  email: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});
export type AccountRef = z.infer<typeof accountRefSchema>;

/** 兑换现场：风控与客诉排查都靠这几项。 */
const redeemContextSchema = z.object({
  account: accountRefSchema,
  atUtc: z.number(),
  ip: z.string(),
  userAgent: z.string().nullable(),
  /** 入账生成的充值单号。 */
  rechargeId: z.string(),
  /** 在哪个业务里兑换（如 yomi）；未指定业务为 null。 */
  productCode: z.string().nullable().optional(),
});
export type RedeemContext = z.infer<typeof redeemContextSchema>;

export const redemptionCodeSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  batchName: z.string(),
  /** 脱敏卡密：保留首末段，如 MK-7Q2D-****-9F2A。 */
  codeMasked: z.string(),
  faceValue: z.number(),
  status: codeStatusSchema,
  redeemed: redeemContextSchema.nullable(),
  /**
   * 该卡密上的失败尝试次数。已兑换的卡又被别的账户输入，
   * 通常意味着卡密被转卖或泄露，客诉时要优先看这一项。
   */
  failedAttempts: z.number().int().nonnegative(),
  createdAtUtc: z.number(),
});
export type RedemptionCode = z.infer<typeof redemptionCodeSchema>;

// ─── 兑换尝试 ────────────────────────────────────────────────────────

export const attemptResultValues = [
  'success',
  'not_found',
  'already_redeemed',
  'frozen',
  'voided',
  'limit_exceeded',
  'rate_limited',
] as const;
export const attemptResultSchema = z.enum(attemptResultValues);
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const AttemptResultLabel: Record<AttemptResult, string> = {
  success: '兑换成功',
  not_found: '卡密不存在',
  already_redeemed: '已被兑换',
  frozen: '卡密已冻结',
  voided: '卡密已作废',
  limit_exceeded: '超出账户限兑',
  rate_limited: '触发频控',
};

export const AttemptResultTone: Record<AttemptResult, Tone> = {
  success: 'success',
  not_found: 'danger',
  already_redeemed: 'danger',
  frozen: 'warning',
  voided: 'info',
  limit_exceeded: 'warning',
  rate_limited: 'danger',
};

export const redemptionAttemptSchema = z.object({
  id: z.string(),
  atUtc: z.number(),
  account: accountRefSchema,
  /** 用户输入的卡密（脱敏）；不存在的卡密也照样记录，用于识别枚举。 */
  inputMasked: z.string(),
  /** 命中的卡密；not_found 时为 null。 */
  codeId: z.string().nullable(),
  batchId: z.string().nullable(),
  batchName: z.string().nullable(),
  result: attemptResultSchema,
  /** 成功时的入账金额。 */
  amount: z.number().nullable(),
  ip: z.string(),
  userAgent: z.string().nullable(),
  rechargeId: z.string().nullable(),
  /** 在哪个业务里提交的；未指定业务为 null。 */
  productCode: z.string().nullable().optional(),
});
export type RedemptionAttempt = z.infer<typeof redemptionAttemptSchema>;

// ─── 概览 ───────────────────────────────────────────────────────────

export const redemptionOverviewSchema = z.object({
  batchCount: z.number().int(),
  issuedCount: z.number().int(),
  issuedValue: z.number(),
  redeemedCount: z.number().int(),
  redeemedValue: z.number(),
  /** 未兑换且仍可兑的卡密：已卖出未兑即平台预收负债。 */
  outstandingCount: z.number().int(),
  outstandingValue: z.number(),
  todayRedeemedCount: z.number().int(),
  todayRedeemedValue: z.number(),
  failedAttempts24h: z.number().int(),
  /** 24h 内失败次数超过阈值的 IP 数。 */
  suspiciousIps24h: z.number().int(),
});
export type RedemptionOverview = z.infer<typeof redemptionOverviewSchema>;

// ─── 查询与命令 ──────────────────────────────────────────────────────

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface PageQuery<F> {
  page: number;
  pageSize: number;
  filter: F;
}

export interface BatchFilter {
  batchId?: string;
  /** 名称、渠道为模糊匹配。 */
  name?: string;
  salesChannel?: string;
  status?: BatchStatus | 'all';
  purpose?: RedemptionPurpose | 'all';
  /** 创建时间范围（epoch ms）。 */
  fromUtc?: number;
  toUtc?: number;
}

export interface CodeFilter {
  /** 完整卡密精确匹配，或末 4 位后缀匹配。 */
  code?: string;
  batchId?: string;
  status?: CodeStatus | 'all';
  accountUid?: string;
  /** 兑换账户邮箱，模糊匹配。 */
  accountEmail?: string;
  ip?: string;
  /** 兑换时间范围（epoch ms）。 */
  fromUtc?: number;
  toUtc?: number;
}

/** `failed` 是除 success 外全部结果的快捷筛选。 */
export type AttemptResultFilter = AttemptResult | 'all' | 'failed';

export interface AttemptFilter {
  result?: AttemptResultFilter;
  accountUid?: string;
  /** 提交账户邮箱，模糊匹配。 */
  accountEmail?: string;
  /** 前缀匹配。 */
  ip?: string;
  codeId?: string;
  batchId?: string;
  /** 提交时所在的业务，精确匹配。 */
  productCode?: string;
  fromUtc?: number;
  toUtc?: number;
}

export interface CreateBatchInput {
  name: string;
  salesChannel: string | null;
  purpose: RedemptionPurpose;
  faceValue: number;
  quantity: number;
  /** 2–6 位大写字母数字，空串 = 无前缀。 */
  prefix: string;
  perAccountLimit: number | null;
}

/** 编辑批次：面值与卡密格式不可改；数量只增不减，多出的部分由服务端生成新卡密。 */
export interface UpdateBatchInput {
  name: string;
  salesChannel: string | null;
  quantity: number;
  perAccountLimit: number | null;
}

/** 明文卡密只在这里和导出响应里出现；关闭对话框后只能通过「导出」再取，且每次导出都会记审计。 */
export interface PlainCodes {
  batch: RedemptionBatch;
  codes: string[];
}

/** 明文从哪个动作来：生成、追加、导出。 */
export type PlainMode = 'created' | 'appended' | 'exported';

// ─── 导出 ───────────────────────────────────────────────────────────

/**
 * 导出范围。未兑换是给发卡网补货上架；已兑换 / 全部是给财务对账、客诉核对，
 * 所以后两者带状态与兑换方，且不提供「一行一张」的 TXT，免得混进已兑换的卡被当库存导入售卖。
 */
export const exportScopeValues = ['unused', 'redeemed', 'all'] as const;
export type ExportScope = (typeof exportScopeValues)[number];

export const ExportScopeLabel: Record<ExportScope, string> = {
  unused: '未兑换',
  redeemed: '已兑换',
  all: '全部',
};

export function batchExportCount(b: RedemptionBatch, scope: ExportScope): number {
  if (scope === 'redeemed') return b.redeemedCount;
  if (scope === 'all') return b.quantity;
  return batchUnusedCount(b);
}

/** 未兑换卡密只在批次生效中时可导出：冻结 / 作废的卡上架出去也兑不了。已兑换与全部任何状态都能导，对账不挑时候。 */
export function canExportScope(b: RedemptionBatch, scope: ExportScope): boolean {
  if (batchExportCount(b, scope) === 0) return false;
  return scope !== 'unused' || isBatchActive(b);
}

export function canExportBatch(b: RedemptionBatch): boolean {
  return exportScopeValues.some((s) => canExportScope(b, s));
}

export const exportedCodeSchema = z.object({
  code: z.string(),
  status: codeStatusSchema,
  redeemedAtUtc: z.number().nullable(),
  /** 兑换账户；未兑换为 null。 */
  redeemedBy: accountRefSchema.nullable(),
});
export type ExportedCode = z.infer<typeof exportedCodeSchema>;

export interface ExportedCodes {
  batch: RedemptionBatch;
  scope: ExportScope;
  items: ExportedCode[];
}

/** 明文对话框的入参：生成 / 追加给纯卡密列表，导出给带状态的明细。 */
export type KeysPayload = PlainCodes | ExportedCodes;

// ─── 卡密格式 ────────────────────────────────────────────────────────

/**
 * 卡密：16 位 Crockford Base32（去掉 I、L、O、U），4 位一组，前面加批次前缀，如 MK-7Q2D-H8KX-PM3R-W4NT。
 * 前缀只标识售卖批次，兑换时可以不写。规则与后端 RedemptionCodeFormat 一致。
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16;

function groupBody(body: string): string {
  return (body.match(/.{1,4}/g) ?? []).join('-');
}

export function codePattern(prefix: string): string {
  return [prefix, groupBody('X'.repeat(CODE_LENGTH))].filter(Boolean).join('-');
}

/** 从 codePattern（如 MK-XXXX-…）取前缀，编辑批次时回填表单。 */
export function codePrefixOf(pattern: string): string {
  const first = pattern.split('-')[0] ?? '';
  return /^X+$/.test(first) ? '' : first;
}

export function formatCode(prefix: string, body: string): string {
  return [prefix, groupBody(body)].filter(Boolean).join('-');
}

/** 随机卡密正文。字母表恰好 32 个字符，取随机字节低 5 位即均匀分布。 */
export function randomCodeBody(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join('');
}

/** 保留前缀与首末两组，中间合成一个 ****：客服能对上用户截图又不泄露可用卡密。规则与后端一致。 */
export function maskCode(code: string, prefix: string): string {
  const body = prefix && code.startsWith(`${prefix}-`) ? code.slice(prefix.length + 1) : code;
  const plain = body.replace(/-/g, '').toUpperCase();
  return [prefix, `${plain.slice(0, 4)}-****-${plain.slice(-4)}`].filter(Boolean).join('-');
}
