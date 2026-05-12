import { z } from 'zod';

import {
  billingModeSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  orderStatusSchema,
  subscriptionPeriodSchema,
  subscriptionStatusSchema,
} from './billingEnums';
import type { InvoiceKind, OrderStatus } from './billingEnums';

export const rechargeStatusValues = ['pending', 'paid', 'expired', 'cancelled', 'failed'] as const;
export type RechargeStatus = (typeof rechargeStatusValues)[number];

export const RechargeStatusLabel: Readonly<Record<RechargeStatus, string>> = {
  pending: '待支付',
  paid: '已支付',
  expired: '已过期',
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

/**
 * 业务（一级业务条线）。一个业务下可承载多个产品 (productCode)。
 *
 * - `demux`：DemuxAI 业务系列（推理 / 训练 / API 等）
 * - `platform`：平台/账户级（不归属任何具体业务的钱包变动，如手工调账）
 *
 * 未来新增业务（如 storage、cdn）时在此扩展，无需改表结构。
 */
export const businessCodeValues = ['demux', 'platform'] as const;
export type BusinessCode = (typeof businessCodeValues)[number];

export const BusinessCodeLabel: Readonly<Record<BusinessCode, string>> = {
  demux: 'DemuxAI',
  platform: '平台',
};

/** long → string（与仓库其余 UID 约定一致） */
const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const walletSnapshotSchema = z.object({
  accountUid: uidString,
  available: z.number(),
  held: z.number(),
  currency: z.string(),
  updatedAtUtc: z.string(),
});

export type WalletSnapshot = z.infer<typeof walletSnapshotSchema>;

export const rechargeIntentSchema = z.object({
  rechargeUid: uidString,
  outTradeNo: z.string(),
  provider: z.string(),
  scene: z.number().int(),
  amount: z.number(),
  currency: z.string(),
  qrCodeUrl: z.string().nullable().optional(),
  redirectUrl: z.string().nullable().optional(),
  jsApiPayloadJson: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  expiresAtUtc: z.string().nullable().optional(),
});

export type RechargeIntent = z.infer<typeof rechargeIntentSchema>;

export const placeOrderResultSchema = z.object({
  orderUid: uidString,
  status: orderStatusSchema,
  billingMode: billingModeSchema,
  holdUid: uidString.nullable().optional(),
  subscriptionUid: uidString.nullable().optional(),
  invoiceUid: uidString.nullable().optional(),
  amount: z.number(),
});

export type PlaceOrderResult = z.infer<typeof placeOrderResultSchema>;

export const orderDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  productCode: z.string(),
  quantity: z.number().int(),
  billingMode: billingModeSchema,
  unitPriceSnapshot: z.number(),
  status: orderStatusSchema,
  resourceUid: uidString.nullable().optional(),
  metadataJson: z.string().nullable().optional(),
  createdAtUtc: z.string(),
  activatedAtUtc: z.string().nullable().optional(),
  terminatedAtUtc: z.string().nullable().optional(),
});

export type OrderDto = z.infer<typeof orderDtoSchema>;

export const subscriptionDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  orderUid: uidString,
  productCode: z.string(),
  period: subscriptionPeriodSchema,
  currentPeriodStartUtc: z.string(),
  currentPeriodEndUtc: z.string(),
  nextBillingAtUtc: z.string(),
  status: subscriptionStatusSchema,
  autoRenew: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  createdAtUtc: z.string(),
});

export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;

export const invoiceDtoSchema = z.object({
  uid: uidString,
  accountUid: uidString,
  kind: invoiceKindSchema,
  periodStartUtc: z.string().nullable().optional(),
  periodEndUtc: z.string().nullable().optional(),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  currency: z.string(),
  status: invoiceStatusSchema,
  issuedAtUtc: z.string(),
  paidAtUtc: z.string().nullable().optional(),
  subscriptionUid: uidString.nullable().optional(),
  orderUid: uidString.nullable().optional(),
});

export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;

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
 *  - `operatorUid` 是触发该次入账的内部操作人，仅 manual / cs_compensation /
 *    marketing_reward 有值（用户自主充值时为 null）
 *  - 不再保留自由文本"备注"字段——重复内容应通过 provider + refNo 推断
 */
export const rechargeProviderValues = [
  'alipay',
  'wechat_pay',
  'manual',
  'cs_compensation',
  'marketing_reward',
] as const;
export type RechargeProvider = (typeof rechargeProviderValues)[number];

export const RechargeProviderLabel: Readonly<Record<RechargeProvider, string>> = {
  alipay: '支付宝',
  wechat_pay: '微信支付',
  manual: '手工充值',
  cs_compensation: '客服补偿',
  marketing_reward: '营销奖励',
};

/** UI 标签：业务单号在不同 provider 下的展示名 */
export const RechargeRefNoLabel: Readonly<Record<RechargeProvider, string>> = {
  alipay: '支付流水号',
  wechat_pay: '支付流水号',
  manual: '审批单号',
  cs_compensation: '工单号',
  marketing_reward: '活动号',
};

export const rechargeRecordSchema = z.object({
  uid: uidString,
  /** 主账户 UID —— 钱归这个账户 */
  ownerAccountUid: uidString,
  provider: z.enum(rechargeProviderValues),
  scene: z.number().int(),
  /**
   * 业务单号 —— 含义随 provider 变化：
   * alipay/wechat_pay → 第三方流水号；cs_compensation → 工单号；
   * marketing_reward → 活动号；manual → 审批单号。
   * 必填（每种 provider 都应有结构化业务关联）。
   */
  refNo: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(rechargeStatusValues),
  /**
   * 内部操作人 UID，仅 manual / cs_compensation / marketing_reward 有值。
   * 用户自主第三方支付时为 null。
   */
  operatorUid: uidString.nullable().optional(),
  createdAtUtc: z.string(),
  paidAtUtc: z.string().nullable().optional(),
});

export type RechargeRecord = z.infer<typeof rechargeRecordSchema>;

/**
 * 账单条目（钱包扣款流水）。
 *
 * 业务语义：账户钱包"扣款"事件的完整审计流水。承载产品消费类的所有扣费，
 * 包括订阅扣款、用量扣费、一次性订单。**不**承载"加钱"事件（加钱走充值表）。
 *
 * 双账户字段：
 *  - `ownerAccountUid` 永远是主账户（钱归它扣）
 *  - `operatorAccountUid` 是实际触发扣费的账户（可能是主账户本身或 IAM 子账户）
 *  - UI 上：第一行显示 ownerAccountUid；第二行如 operator===owner 显示"主账户"，
 *    否则显示"IAM:{operatorAccountUid}"
 *
 * 错扣回滚 / 部分退款：在原条目上修改 `actualAmount`（实际扣费），
 * 同时把 `status` 置为 `reversed` 或 `partial_refunded`，并记录
 * `reversedAtUtc` / `reversedBy` / `reversedCode`（驳回原因枚举码）。
 * 钱包余额结算 = ∑ actualAmount WHERE status ∈ {completed, partial_refunded}。
 */
/**
 * 计费类型，按"扣款时机"分两种：
 *  - `prepaid`：预付费。用户先付钱再使用——订阅扣款、一次性订单都属于这类。
 *    具体是订阅还是单次购买，由 `refType` ('subscription' / 'order') 表达，不在此重复。
 *  - `usage`：用量扣费。后付费按实际用量结算。
 *
 * 不再细分订阅/一次性：它们在"扣款"这件事上没有差异，只是关联实体不同。
 */
export const billSubTypeValues = ['prepaid', 'usage'] as const;
export type BillSubType = (typeof billSubTypeValues)[number];

export const BillSubTypeLabel: Readonly<Record<BillSubType, string>> = {
  prepaid: '预付费',
  usage: '用量扣费',
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

export const billRefTypeValues = ['order', 'subscription', 'invoice'] as const;
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

export const billingEntrySchema = z.object({
  /** 雪花 ID，单调递增、按时间有序 */
  uid: uidString,
  /** 主账户 UID（钱归它） */
  ownerAccountUid: uidString,
  /** 实操账户 UID（主账户本身 or IAM 子账户） */
  operatorAccountUid: uidString,
  business: z.enum(businessCodeValues),
  /** 产品代码，扣款类必有 */
  productCode: z.string().nullable().optional(),
  subType: z.enum(billSubTypeValues),
  status: z.enum(billStatusValues),
  /** 失败码（枚举，仅当 status='failed' 时有值） */
  failureCode: z.enum(billFailureCodeValues).nullable().optional(),
  /** 原始扣费金额（系统首次计算的值） */
  originalAmount: z.number(),
  /** 实际扣费金额（被驳回 → 0；部分退还 → 原值的一部分） */
  actualAmount: z.number(),
  currency: z.string(),
  /** 扣费后钱包余额快照，便于对账 */
  balanceAfter: z.number().nullable().optional(),
  /** 关联业务实体类型（订阅 / 订单 / 发票），定位上下文用 */
  refType: z.enum(billRefTypeValues).nullable().optional(),
  refUid: uidString.nullable().optional(),
  /** 驳回时间 */
  reversedAtUtc: z.string().nullable().optional(),
  /** 驳回操作人 UID */
  reversedBy: uidString.nullable().optional(),
  /** 驳回原因码（枚举，仅当 status∈{reversed, partial_refunded} 时有值） */
  reversedCode: z.enum(billReversedCodeValues).nullable().optional(),
  occurredAtUtc: z.string(),
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
}

export interface PlaceOrderInput {
  productCode: string;
  quantity: number;
  currency?: string | undefined;
  metadataJson?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ListOrdersFilter {
  status: OrderStatus | 'all';
}

export interface ListInvoicesFilter {
  kind: InvoiceKind | 'all';
  fromUtc?: string | undefined;
  toUtc?: string | undefined;
}

export interface ListBillsFilter {
  /** 主账户 UID（精确匹配） */
  accountUid?: string | undefined;
  business: BusinessCode | 'all';
  subType: BillSubType | 'all';
  status: BillStatus | 'all';
  fromUtc?: string | undefined;
  toUtc?: string | undefined;
}

