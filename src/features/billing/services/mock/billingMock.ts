import { ok, fail, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { createUidSeq, type Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  billingEntrySchema,
  rechargeIntentSchema,
  rechargeRecordSchema,
  type BillingEntry,
  type ConfirmManualRechargeInput,
  type CreateRechargeInput,
  type CreateInternalRechargeInput,
  type ListBillsFilter,
  type RechargeIntent,
  type RechargeRecord,
  type WalletSnapshot,
} from '../../model/billing.types';
import { referralRechargesForAccount } from '@/features/accounts/services/mock/referralData';
import { getDemuxaiStore } from '@/features/demux/services/mock/data';

import type {
  BillingPort,
  ListBillsPage,
  ListRechargesFilter,
  ListRechargesPage,
} from '../ports/billingPort';

interface AccountBilling {
  wallet: WalletSnapshot;
  recharges: RechargeRecord[];
  bills: BillingEntry[];
}

const genRechargeUid = createUidSeq(8_000_000);
const genBillSerialSeq = createUidSeq(1);
const genRechargeSerialSeq = createUidSeq(1);

function formatSerial(prefix: string, at: Date, seq: number | string): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}${ymd}${String(seq).padStart(9, '0')}`;
}

/**
 * Mock 里扮演 BFF 的「业务号」组装：据账单号反查发起它的调用日志号（UsageLog.Id）。
 * 真实后端是 BFF 调 Demux 的 resolve-by-bill-serials（依赖 UsageLog.BillSerialNo）。
 * Mock 日志的 `bill.id` 即账单号：优先精确匹配；跨 store 对不上时按账单号稳定哈希挑一条
 * **真实存在**的日志，保证业务号在调用日志页可查到。无产品扣费关联时返回 null。
 */
function resolveOriginLogId(serial: string): string | null {
  const logs = getDemuxaiStore().logs;
  if (logs.length === 0) return null;
  const exact = logs.find((l) => l.bill?.id === serial);
  if (exact) return exact.id;
  let h = 0;
  for (let i = 0; i < serial.length; i += 1) h = (h * 31 + serial.charCodeAt(i)) >>> 0;
  return logs[h % logs.length]?.id ?? null;
}

/** 仅对有产品归属的用量扣费账单回填业务号（mock 端模拟 BFF 组装）。 */
function withOriginLog(bill: BillingEntry): BillingEntry {
  if (!bill.business.productCode) return bill;
  return { ...bill, business: { ...bill.business, originLogId: resolveOriginLogId(bill.id) } };
}

function genBillSerial(at: Date = new Date()): string {
  return formatSerial('BL', at, genBillSerialSeq());
}

function genRechargeSerial(at: Date = new Date()): string {
  return formatSerial('RC', at, genRechargeSerialSeq());
}

const now = Date.now();

/** 待支付超时阈值：与后端 ExpireStalePendingRechargesHandler.PendingTtlMinutes 保持一致。 */
const PENDING_TTL_MS = 15 * 60_000;

/**
 * 关闭超时未支付的充值单（mock 端模拟后端定时任务）：待支付且创建超过 15 分钟的置为「已过期」。
 * 超时只关闭待支付窗口、不代表资金失败；用户若迟到付款，管理员仍可对「已过期」单补录入账。
 */
function sweepStalePending(recharges: RechargeRecord[]): void {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const r of recharges) {
    if (r.status === 'pending' && r.createdAtUtc < cutoff) {
      r.status = 'expired';
      r.audit = { ...(r.audit ?? {}), failureReason: '支付超时未付款，订单已自动关闭' };
    }
  }
}

function seedAccount(uid: string): AccountBilling {
  const recharge: RechargeRecord = {
    id: genRechargeSerial(),
    owner: { accountUid: uid },
    source: {
      provider: 'alipay',
      scene: 0,
      refNo: '202605310001',
      productCode: 'demux',
    },
    amount: { value: 100, currency: 'CNY' },
    status: 'paid',
    createdAtUtc: now - 86_400_000,
    paidAtUtc: now - 86_000_000,
  };

  // 演示数据：一条超过 15 分钟的待支付单（列表会自动关闭为「已过期」，可演示迟到入账），
  // 一条 5 分钟内的待支付单（仍为「待支付」，可直接入账）。
  const stalePending: RechargeRecord = {
    id: genRechargeSerial(),
    owner: { accountUid: uid },
    source: { provider: 'alipay', scene: 0, refNo: `OUT-${uid}-STALE` },
    amount: { value: 50, currency: 'CNY' },
    status: 'pending',
    createdAtUtc: now - 20 * 60_000,
  };

  const freshPending: RechargeRecord = {
    id: genRechargeSerial(),
    owner: { accountUid: uid },
    source: { provider: 'wechat_pay', scene: 0, refNo: `OUT-${uid}-FRESH` },
    amount: { value: 30, currency: 'CNY' },
    status: 'pending',
    createdAtUtc: now - 5 * 60_000,
  };

  const bill: BillingEntry = {
    id: genBillSerial(),
    owner: { accountUid: uid },
    operator: { accountUid: uid },
    business: {
      productCode: 'demux',
      subType: 'usage',
      refType: 'hold',
      refId: 'HD-5000001',
      requestId: 'req-demux-5000001',
      // 账单域不感知产品日志号；详情「业务号」运行时按 requestId 跨域解析回填（见 BillDetailDrawer）。
      originLogId: null,
    },
    status: 'completed',
    amount: {
      original: 0.2,
      actual: 0.12,
      currency: 'CNY',
    },
    occurredAtUtc: now - 3_600_000,
    deduction: {
      total: 0.2,
      voucherDeducted: 0.08,
      balanceDeducted: 0.12,
      voucherItems: [
        {
          userVoucherId: '7000001',
          serialNo: 'VC20260601000000001',
          amountDeducted: 0.08,
          name: '新人体验代金券',
          deductKind: 'noThreshold',
          faceValue: 5,
          remainingValue: 4.92,
          validToUtc: now + 30 * 24 * 3_600_000,
          thresholdAmount: 0,
          discountRate: null,
        },
      ],
    },
  };

  return {
    wallet: {
      accountUid: uid,
      available: 99.88,
      held: 0,
      currency: 'CNY',
      updatedAtUtc: now,
    },
    recharges: [freshPending, stalePending, recharge, ...referralRechargesForAccount(uid)],
    bills: [bill],
  };
}

const store = new Map<string, AccountBilling>([
  ['10001', seedAccount('10001')],
  ['10002', seedAccount('10002')],
]);

function ensure(uid: Uid): AccountBilling {
  const key = String(uid);
  if (!store.has(key)) store.set(key, seedAccount(key));
  return store.get(key)!;
}

export class BillingMock implements BillingPort {
  async createRecharge(_accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>> {
    await delay();
    const intent = rechargeIntentSchema.parse({
      rechargeId: String(genRechargeUid()),
      outTradeNo: `RC-${Date.now()}`,
      provider: input.provider ?? 'manual',
      scene: input.scene ?? 99,
      amount: input.amount,
      currency: 'CNY',
      createdAtUtc: Date.now(),
    });
    return ok(intent);
  }

  async createInternalRecharge(input: CreateInternalRechargeInput): Promise<AppResult<RechargeRecord>> {
    await delay();
    const b = ensure(input.ownerAccountUid);
    const record = rechargeRecordSchema.parse({
      id: genRechargeSerial(),
      owner: { accountUid: input.ownerAccountUid },
      source: {
        provider: input.source,
        scene: 99,
        refNo: input.idempotencyKey ?? `INT-${Date.now()}`,
        productCode: input.productCode ?? null,
      },
      amount: { value: input.amount, currency: 'CNY' },
      status: 'paid',
      operatorIamId: '90001',
      createdAtUtc: Date.now(),
      paidAtUtc: Date.now(),
    });
    b.recharges.unshift(record);
    b.wallet.available += input.amount;
    return ok(record);
  }

  async listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>> {
    await delay();
    let all: RechargeRecord[] = [];
    if (input.filter.accountUid) {
      const acc = ensure(input.filter.accountUid);
      sweepStalePending(acc.recharges);
      all = [...acc.recharges];
    } else {
      for (const b of store.values()) {
        sweepStalePending(b.recharges);
        all.push(...b.recharges);
      }
      all.sort((a, b) => b.createdAtUtc - a.createdAtUtc);
    }
    if (input.filter.provider !== 'all') {
      all = all.filter((r) => r.source.provider === input.filter.provider);
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
    }
    const slice = clientPaginate(all, input.page, input.pageSize);
    const parsed = slice
      .map((it) => rechargeRecordSchema.safeParse(it))
      .filter((r) => r.success)
      .map((r) => r.data);
    return ok({ items: parsed, total: all.length });
  }

  async listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>> {
    await delay();
    let all: BillingEntry[] = [];
    if (input.filter.accountUid) {
      all = [...ensure(input.filter.accountUid).bills];
    } else {
      for (const b of store.values()) all.push(...b.bills);
      all.sort((a, b) => b.occurredAtUtc - a.occurredAtUtc);
    }
    if (input.filter.productCode !== 'all') {
      all = all.filter((r) => r.business.productCode === input.filter.productCode);
    }
    if (input.filter.subType !== 'all') {
      all = all.filter((r) => r.business.subType === input.filter.subType);
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
    }
    const slice = clientPaginate(all, input.page, input.pageSize);
    const parsed = slice
      .map((it) => billingEntrySchema.safeParse(it))
      .filter((r) => r.success)
      .map((r) => withOriginLog(r.data));
    return ok({ items: parsed, total: all.length });
  }

  async getRecharge(serial: string): Promise<AppResult<RechargeRecord>> {
    await delay();
    for (const b of store.values()) {
      sweepStalePending(b.recharges);
      const found = b.recharges.find((x) => x.id === serial);
      if (found) {
        const parsed = rechargeRecordSchema.safeParse(found);
        if (parsed.success) return ok(parsed.data);
      }
    }
    return fail({ code: 'not_found', message: `充值记录 ${serial} 不存在` });
  }

  async confirmRecharge(
    serial: string,
    input: ConfirmManualRechargeInput,
  ): Promise<AppResult<RechargeRecord>> {
    await delay();
    for (const b of store.values()) {
      const idx = b.recharges.findIndex((x) => x.id === serial);
      if (idx === -1) continue;
      const row = b.recharges[idx]!;
      // 允许「待支付」入账，以及「已过期」单的迟到支付补录入账（超时关单后用户又付款成功）。
      if (row.status !== 'pending' && row.status !== 'expired') {
        return fail({ code: 'conflict', message: `充值单 ${serial} 当前状态不可入账` });
      }
      const updated: RechargeRecord = {
        ...row,
        status: 'paid',
        paidAtUtc: Date.now(),
        operator: { iamUserUid: '90001', displayName: 'Mock Admin' },
        payment: {
          outTradeNo: row.source.refNo,
          providerTradeNo: input.providerTradeNo ?? `manual-${serial}`,
          paidAmount: row.amount.value,
          payerAccount: input.payerAccount ?? null,
          payerName: input.payerName ?? null,
          confirmationMode: 'admin_manual',
        },
        audit: {
          remark: input.remark ?? null,
          confirmedByStaffUid: '90001',
          confirmedAtUtc: Date.now(),
          failureReason: null,
        },
      };
      b.recharges[idx] = updated;
      b.wallet.available += row.amount.value;
      return ok(updated);
    }
    return fail({ code: 'not_found', message: `充值记录 ${serial} 不存在` });
  }

  async getBill(serial: string): Promise<AppResult<BillingEntry>> {
    await delay();
    for (const b of store.values()) {
      const found = b.bills.find((x) => x.id === serial);
      if (found) {
        const parsed = billingEntrySchema.safeParse(found);
        if (parsed.success) return ok(withOriginLog(parsed.data));
      }
    }
    return fail({ code: 'not_found', message: `账单 ${serial} 不存在` });
  }
}
