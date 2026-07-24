import { z } from 'zod';

import {
  epochMillisNullableSchema,
  epochMillisSchema,
} from '@/shared/lib/epoch';

import { paymentSceneSchema } from './billingEnums';
export { paymentSceneSchema };

export const rechargeStatusValues = ['pending', 'paid', 'expired', 'cancelled', 'failed'] as const;
export type RechargeStatus = (typeof rechargeStatusValues)[number];

export const RechargeStatusLabel: Readonly<Record<RechargeStatus, string>> = {
  pending: '待支付',
  paid: '已支付',
  // 支付超时未付款 → 关闭废单（与大厂「交易关闭」一致）。后端枚举仍为 expired。
  expired: '已关闭',
  cancelled: '已取消',
  failed: '已失败',
};

export const RechargeStatusTone: Readonly<Record<RechargeStatus, 'success' | 'warning' | 'danger' | 'info'>> = {
  pending: 'warning',
  paid: 'success',
  expired: 'info',
  cancelled: 'danger',
  failed: 'danger',
};

/** long / 雪花 ID → string；用于 `id` 与 `*AccountUid` / `*IamId` 字段 */
const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 账户方信息（账单 owner/operator、充值 owner 等共用）：uid + BFF 按 uid 补全的联系信息。
 */
export const accountPartySchema = z.object({
  accountUid: idString,
  displayName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export type AccountParty = z.infer<typeof accountPartySchema>;

export const walletSnapshotSchema = z.object({
  accountUid: idString,
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  updatedAtUtc: epochMillisSchema,
});

export type WalletSnapshot = z.infer<typeof walletSnapshotSchema>;

export const rechargeIntentSchema = z.object({
  rechargeId: idString,
  outTradeNo: z.string(),
  provider: z.string(),
  scene: z.number().int(),
  amount: z.number(),
  currency: z.string(),
  qrCodeUrl: z.string().nullable().optional(),
  redirectUrl: z.string().nullable().optional(),
  jsApiPayloadJson: z.string().nullable().optional(),
  createdAtUtc: epochMillisSchema,
  expiresAtUtc: epochMillisNullableSchema.optional(),
});

export type RechargeIntent = z.infer<typeof rechargeIntentSchema>;

/**
 * 充值记录。
 *
 * 业务语义：账户余额"增加"事件。来源包括：
 *  - 用户付费充值（alipay / wechat_pay 等第三方支付）
 *  - 客服补偿（公司送钱给用户，相当于客服代为充值）
 *  - 营销奖励（运营活动赠送额度）
 *  - 手工充值（财务/管理员直接入账）
 *
 * 关键规则：
 *  - **只有主账户能发起充值**（IAM 子账户无此权限），故无 operatorAccountUid
 *  - `refNo` 是业务单号，含义随 `provider` 变化：
 *      alipay / wechat_pay → 第三方支付流水号
 *      cs_compensation     → 客服工单号
 *      marketing_reward    → 营销活动号（多笔充值可共享同一活动号）
 *      manual              → 内部审批单号
   *  - `operatorIamId` 是触发该次入账的 IAM 操作人 userId，仅 manual / cs_compensation /
   *    marketing_reward 有值（用户自主充值时为 null）
 *  - 不再保留自由文本"备注"字段——重复内容应通过 provider + refNo 推断
 */
export const rechargeProviderValues = [
  'alipay',
  'wechat_pay',
  'manual',
  'cs_compensation',
  'marketing_reward',
  'referral_rebate',
] as const;
export type RechargeProvider = (typeof rechargeProviderValues)[number];

export const RechargeProviderLabel: Readonly<Record<RechargeProvider, string>> = {
  alipay: '支付宝',
  wechat_pay: '微信支付',
  manual: '手工充值',
  cs_compensation: '客服补偿',
  marketing_reward: '营销奖励',
  referral_rebate: '邀请返利',
};

/** UI 标签：业务单号在不同 provider 下的展示名 */
export const RechargeRefNoLabel: Readonly<Record<RechargeProvider, string>> = {
  alipay: '支付流水号',
  wechat_pay: '支付流水号',
  manual: '审批单号',
  cs_compensation: '工单号',
  marketing_reward: '活动号',
  referral_rebate: '返利单号',
};

/**
 * 充值来源块：渠道 / 场景 / 业务单号（与后端 RechargeDto.source 对应）。
 */
export const rechargeSourceSchema = z.object({
  provider: z.enum(rechargeProviderValues),
  scene: z.number().int(),
  /**
   * 业务单号 —— 含义随 provider 变化：
   * alipay/wechat_pay → 第三方流水号；cs_compensation → 工单号；
   * marketing_reward → 活动号；manual → 审批单号。
   * 必填（每种 provider 都应有结构化业务关联）。
   */
  refNo: z.string(),
  /** 充值归属产品代码（如 demux）；用户自助充值未指定业务时为空。 */
  productCode: z.string().nullable().optional(),
});

export type RechargeSource = z.infer<typeof rechargeSourceSchema>;

/** 充值金额块：到账金额 + 币种。 */
export const rechargeAmountSchema = z.object({
  value: z.number(),
  currency: z.string(),
});

export type RechargeAmount = z.infer<typeof rechargeAmountSchema>;

/** 入账确认方式（详情接口返回）。 */
export const rechargeConfirmationModeValues = ['auto_notify', 'admin_manual', 'internal'] as const;
export type RechargeConfirmationMode = (typeof rechargeConfirmationModeValues)[number];

export const RechargeConfirmationModeLabel: Readonly<Record<RechargeConfirmationMode, string>> = {
  auto_notify: '渠道回调',
  admin_manual: '管理员手工确认',
  internal: '内部入账',
};

export const rechargePaymentSchema = z.object({
  outTradeNo: z.string(),
  providerTradeNo: z.string().nullable().optional(),
  paidAmount: z.number().nullable().optional(),
  payerAccount: z.string().nullable().optional(),
  payerName: z.string().nullable().optional(),
  confirmationMode: z.enum(rechargeConfirmationModeValues).nullable().optional(),
});

export type RechargePayment = z.infer<typeof rechargePaymentSchema>;

export const rechargeAuditSchema = z.object({
  remark: z.string().nullable().optional(),
  expiresAtUtc: epochMillisNullableSchema.optional(),
  failureReason: z.string().nullable().optional(),
  confirmedByStaffUid: idString.nullable().optional(),
  confirmedAtUtc: epochMillisNullableSchema.optional(),
});

export type RechargeAudit = z.infer<typeof rechargeAuditSchema>;

export const rechargeOperatorSchema = z.object({
  iamUserUid: idString,
  displayName: z.string().nullable().optional(),
});

export type RechargeOperator = z.infer<typeof rechargeOperatorSchema>;

export const rechargeRecordSchema = z.object({
  /** 充值记录主键（RC + 日期 + 9 位序列，如 RC20260531000001234） */
  id: idString,
  /** 主账户（钱归它），含 BFF 补全的联系信息 */
  owner: accountPartySchema,
  /** 来源（渠道 / 场景 / 业务单号） */
  source: rechargeSourceSchema,
  /** 金额块 */
  amount: rechargeAmountSchema,
  status: z.enum(rechargeStatusValues),
  /**
   * 内部操作人 Staff userId，仅 manual / cs_compensation / marketing_reward 或手工确认入账时有值。
   */
  operator: rechargeOperatorSchema.nullable().optional(),
  /** @deprecated 使用 operator.iamUserUid */
  operatorIamId: idString.nullable().optional(),
  createdAtUtc: epochMillisSchema,
  paidAtUtc: epochMillisNullableSchema.optional(),
  /** 支付凭证；详情接口返回。 */
  payment: rechargePaymentSchema.nullable().optional(),
  /** 审计信息；详情接口返回。 */
  audit: rechargeAuditSchema.nullable().optional(),
});

export type RechargeRecord = z.infer<typeof rechargeRecordSchema>;

export interface ConfirmManualRechargeInput {
  providerTradeNo?: string | undefined;
  payerAccount?: string | undefined;
  payerName?: string | undefined;
  remark?: string | undefined;
}

/**
 * 账单条目（钱包扣款流水）。
 *
 * 业务语义：账户钱包"扣款"事件的完整审计流水。承载产品消费扣费（Hold Commit 等）。
 * **不**承载"加钱"事件（加钱走充值表）。
 *
 * 双账户字段：
 *  - `ownerAccountUid` 永远是主账户（钱归它扣）
 *  - `operatorAccountUid` 是实际触发扣费的账户（可能是主账户本身或 IAM 子账户）
 *  - UI 上：第一行显示 ownerAccountUid；第二行如 operator===owner 显示"主账户"，
 *    否则显示"IAM:{operatorAccountUid}"
 *
 * 错扣回滚 / 部分退款：在原条目上修改 `actualAmount`（实际扣费），
 * 同时把 `status` 置为 `reversed` 或 `partial_refunded`，并记录
 * `reversedAtUtc` / `reversedByIamId` / `reversedCode`（驳回原因枚举码）。
 * 钱包余额结算 = ∑ actualAmount WHERE status ∈ {completed, partial_refunded}。
 */
/**
 * 计费类型，按"扣款时机"分两种：
 *  - `prepaid`：预付费扣款。
 *  - `usage`：用量扣费（Hold Commit）。
 */
export const billSubTypeValues = ['prepaid', 'usage'] as const;
export type BillSubType = (typeof billSubTypeValues)[number];

export const BillSubTypeLabel: Readonly<Record<BillSubType, string>> = {
  prepaid: '预付费',
  usage: '按量付费',
};

export const billStatusValues = [
  'pending',
  'completed',
  'failed',
  'reversed',
  'partial_refunded',
] as const;
export type BillStatus = (typeof billStatusValues)[number];

export const BillStatusLabel: Readonly<Record<BillStatus, string>> = {
  pending: '处理中',
  completed: '已完成',
  failed: '失败',
  reversed: '已驳回',
  partial_refunded: '部分退还',
};

export const BillStatusTone: Readonly<
  Record<BillStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  pending: 'warning',
  completed: 'success',
  failed: 'danger',
  reversed: 'info',
  partial_refunded: 'warning',
};

export const billRefTypeValues = ['recharge', 'hold', 'manual'] as const;
export type BillRefType = (typeof billRefTypeValues)[number];

/**
 * 扣款失败码（枚举，绝不存自由文本）。
 * 后端只回写其中之一，前端做 i18n 映射。
 */
export const billFailureCodeValues = [
  'insufficient_balance',
  'wallet_frozen',
  'sub_account_limit_exceeded',
  'risk_blocked',
  'amount_exceeded',
  'system_error',
] as const;
export type BillFailureCode = (typeof billFailureCodeValues)[number];

export const BillFailureCodeLabel: Readonly<Record<BillFailureCode, string>> = {
  insufficient_balance: '余额不足',
  wallet_frozen: '钱包已冻结',
  sub_account_limit_exceeded: '子账户额度超限',
  risk_blocked: '风控拦截',
  amount_exceeded: '单笔金额超限',
  system_error: '系统异常',
};

/**
 * 驳回原因码（枚举）。
 * 驳回是有限的几种业务场景，后端落库统一码值，便于聚合统计/客诉分类。
 */
export const billReversedCodeValues = [
  'duplicate_charge',
  'metering_error',
  'service_unavailable',
  'customer_compensation',
  'manual_correction',
] as const;
export type BillReversedCode = (typeof billReversedCodeValues)[number];

export const BillReversedCodeLabel: Readonly<Record<BillReversedCode, string>> = {
  duplicate_charge: '重复计费',
  metering_error: '计量错误',
  service_unavailable: '服务不可用',
  customer_compensation: '客诉补偿',
  manual_correction: '人工调账',
};

/** 券抵扣类型：无门槛代金券 / 满减券 / 折扣券。 */
export const voucherDeductKindValues = ['noThreshold', 'fullReduction', 'discount'] as const;
export type VoucherDeductKind = (typeof voucherDeductKindValues)[number];

export const VoucherDeductKindLabel: Readonly<Record<VoucherDeductKind, string>> = {
  noThreshold: '代金券',
  fullReduction: '满减券',
  discount: '折扣券',
};

/** 单张代金券在账单上的抵扣明细。 */
export const billVoucherDeductionSchema = z.object({
  userVoucherId: idString,
  /** 券面序列号（可空），便于对账定位 */
  serialNo: z.string().nullish(),
  amountDeducted: z.number(),
  /** 券名称（取自模板），便于一眼看出用的是哪张券 */
  name: z.string().nullish(),
  /** 券抵扣类型 */
  deductKind: z.enum(voucherDeductKindValues).nullish(),
  /** 券面额（发放时初始可抵扣额） */
  faceValue: z.number().nullish(),
  /** 该券当前剩余可抵扣额（查询时刻快照） */
  remainingValue: z.number().nullish(),
  /** 券有效期截止（epoch millis） */
  validToUtc: epochMillisNullableSchema.optional(),
  /** 使用门槛金额（满减/折扣券） */
  thresholdAmount: z.number().nullish(),
  /** 折扣率（仅折扣券，区间 (0,1)） */
  discountRate: z.number().nullish(),
});

export type BillVoucherDeduction = z.infer<typeof billVoucherDeductionSchema>;

/**
 * 账单扣费聚合对象：一笔用量扣费"钱从哪来"的拆分（先券抵扣，余额补足）。
 * 仅用量扣费类账单有值，充值等加钱类为 null。
 */
export const billDeductionSchema = z.object({
  /** 应扣总额（= 代金券抵扣 + 余额扣除） */
  total: z.number(),
  /** 代金券抵扣合计 */
  voucherDeducted: z.number(),
  /** 钱包余额实际扣除额 */
  balanceDeducted: z.number(),
  /** 各张券的抵扣明细 */
  voucherItems: z.array(billVoucherDeductionSchema).default([]),
});

export type BillDeduction = z.infer<typeof billDeductionSchema>;

/**
 * 账单的业务归属与溯源：产品 / 计费类型 / 关联业务实体 / 发起调用日志。
 */
export const billBusinessSchema = z.object({
  /** 产品代码；扣款/充值归属产品时有值 */
  productCode: z.string().nullable().optional(),
  /** 计费类型（prepaid / usage） */
  subType: z.enum(billSubTypeValues).nullable().optional(),
  /** 关联业务实体类型（充值 / 预占 / 手工），定位上下文用 */
  refType: z.enum(billRefTypeValues).nullable().optional(),
  refId: idString.nullable().optional(),
  /**
   * 产品域请求幂等键（= commit idempotencyKey，等于 Demux UsageLog.RequestId）。
   * 用于跨域把账单流水反查回发起它的调用日志。
   */
  requestId: z.string().nullable().optional(),
  /**
   * 发起本次扣费的调用日志号（产品域 UsageLog.Id）。由 requestId 跨域解析得到；
   * 历史数据 / 未关联 / 非用量扣费时为 null。
   */
  originLogId: idString.nullable().optional(),
});

export type BillBusiness = z.infer<typeof billBusinessSchema>;

/**
 * 账单金额块：原始扣费 / 实际扣费 + 币种 + 扣后余额快照。
 */
export const billAmountSchema = z.object({
  /** 原始扣费金额（系统首次计算的值） */
  original: z.number(),
  /** 实际扣费金额（被驳回 → 0；部分退还 → 原值的一部分） */
  actual: z.number(),
  currency: z.string(),
  /** 扣费后钱包余额快照，便于对账 */
  balanceAfter: z.number().nullable().optional(),
});

export type BillAmount = z.infer<typeof billAmountSchema>;

/**
 * 驳回 / 部分退还信息；仅 status∈{reversed, partial_refunded} 时有值。
 */
export const billReversalSchema = z.object({
  /** 驳回时间 */
  atUtc: epochMillisNullableSchema.optional(),
  /** 驳回操作人 IAM userId */
  byIamId: idString.nullable().optional(),
  /** 驳回原因码（枚举） */
  code: z.enum(billReversedCodeValues).nullable().optional(),
});

export type BillReversal = z.infer<typeof billReversalSchema>;

export const billingEntrySchema = z.object({
  /** 账单主键（BL + UTC 日期 + 9 位序列，如 BL20260531000001234），按时间有序 */
  id: idString,
  /** 主账户（钱归它） */
  owner: accountPartySchema,
  /** 实操账户（主账户本身 or IAM 子账户） */
  operator: accountPartySchema,
  /** 业务归属与溯源 */
  business: billBusinessSchema,
  status: z.enum(billStatusValues),
  /** 失败码（枚举，仅当 status='failed' 时有值） */
  failureCode: z.enum(billFailureCodeValues).nullable().optional(),
  /** 金额块 */
  amount: billAmountSchema,
  /** 驳回 / 退还 */
  reversal: billReversalSchema.nullable().optional(),
  occurredAtUtc: epochMillisSchema,
  /** 扣费明细（代金券抵扣 / 余额扣除拆分）；仅用量扣费账单有值 */
  deduction: billDeductionSchema.nullable().optional(),
});

export type BillingEntry = z.infer<typeof billingEntrySchema>;

export interface CreateRechargeInput {
  amount: number;
  provider?: string | undefined;
  scene?: number | undefined;
  subject?: string | undefined;
  clientIp?: string | undefined;
  returnUrl?: string | undefined;
  openId?: string | undefined;
  productCode?: string | undefined;
}

/** Admin 后台人工入账（不经第三方支付）。 */
export interface CreateInternalRechargeInput {
  ownerAccountUid: string;
  amount: number;
  source: RechargeProvider;
  note?: string | undefined;
  idempotencyKey?: string | undefined;
  productCode?: string | undefined;
}

export interface ListBillsFilter {
  /** 主账户 UID（精确匹配） */
  accountUid?: string | undefined;
  productCode: string | 'all';
  subType: BillSubType | 'all';
  status: BillStatus | 'all';
  fromUtc?: number | undefined;
  toUtc?: number | undefined;
}
