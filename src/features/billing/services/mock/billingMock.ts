import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { createUidSeq, type Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  billingEntrySchema,
  invoiceDtoSchema,
  orderDtoSchema,
  rechargeIntentSchema,
  rechargeRecordSchema,
  subscriptionDtoSchema,
  type BillingEntry,
  type CreateRechargeInput,
  type CreateInternalRechargeInput,
  type InvoiceDto,
  type ListBillsFilter,
  type ListInvoicesFilter,
  type ListOrdersFilter,
  type OrderDto,
  type PlaceOrderInput,
  type PlaceOrderResult,
  type RechargeIntent,
  type RechargeRecord,
  type SubscriptionDto,
  type WalletSnapshot,
} from '../../model/billing.types';
import {
  businessInstanceSchema,
  type BusinessInstance,
  type ListBusinessesFilter,
} from '../../model/business.types';
import type {
  BillingPort,
  ListBillsPage,
  ListInvoicesPage,
  ListOrdersPage,
  ListRechargesFilter,
  ListRechargesPage,
} from '../ports/billingPort';

interface AccountBilling {
  wallet: WalletSnapshot;
  orders: OrderDto[];
  subscriptions: SubscriptionDto[];
  invoices: InvoiceDto[];
  recharges: RechargeRecord[];
  bills: BillingEntry[];
  businesses: BusinessInstance[];
}

const genOrderUid = createUidSeq(5_000_000);
const genSubUid = createUidSeq(6_000_000);
const genInvUid = createUidSeq(7_000_000);
const genRechargeUid = createUidSeq(8_000_000);
const genBusinessUid = createUidSeq(11_000_000);
const genBillSerialSeq = createUidSeq(1);
const genRechargeSerialSeq = createUidSeq(1);
const genOrderSerialSeq = createUidSeq(1);

function formatSerial(prefix: string, at: Date, seq: number | string): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}${ymd}${String(seq).padStart(9, '0')}`;
}

function genBillSerial(at: Date = new Date()): string {
  return formatSerial('BL', at, genBillSerialSeq());
}

function genRechargeSerial(at: Date = new Date()): string {
  return formatSerial('RC', at, genRechargeSerialSeq());
}

function genOrderSerial(at: Date = new Date()): string {
  return formatSerial('OD', at, genOrderSerialSeq());
}

/** 业务产品名称字典（前后端共识，前端为方便展示常驻一份）。 */
const PRODUCT_NAMES: Readonly<Record<string, string>> = {
  'cdn-accel': 'CDN 加速',
  'obj-storage': '对象存储',
  'ai-inference': 'AI 推理',
  'pro-seat': '团队席位',
  'api-pack': 'API 套餐',
};

const store = new Map<Uid, AccountBilling>();

function epochMs(d: Date): number {
  return d.getTime();
}

function seedForAccount(accountUid: Uid): AccountBilling {
  const now = new Date('2026-05-01T08:00:00Z');
  const wallet: WalletSnapshot = {
    accountUid,
    available: 12880.5,
    held: 200,
    currency: 'CNY',
    updatedAtUtc: epochMs(now),
  };

  const o1: OrderDto = {
    id: genOrderUid(),
    serialNo: genOrderSerial(now),
    accountUid,
    productCode: 'pro-seat',
    quantity: 5,
    billingMode: 1,
    unitPriceSnapshot: 99,
    status: 2,
    resourceId: undefined,
    metadataJson: undefined,
    createdAtUtc: epochMs(now),
    activatedAtUtc: epochMs(now),
    terminatedAtUtc: undefined,
  };

  const o2: OrderDto = {
    id: genOrderUid(),
    serialNo: genOrderSerial(new Date(now.getTime() - 86400000)),
    accountUid,
    productCode: 'api-pack',
    quantity: 1,
    billingMode: 0,
    unitPriceSnapshot: 499,
    status: 3,
    createdAtUtc: epochMs(new Date(now.getTime() - 86400000)),
    activatedAtUtc: epochMs(new Date(now.getTime() - 86400000)),
    terminatedAtUtc: epochMs(now),
  };

  const sub: SubscriptionDto = {
    id: genSubUid(),
    accountUid,
    orderId: o1.id,
    productCode: 'pro-seat',
    period: 0,
    currentPeriodStartUtc: epochMs(new Date(now.getTime() - 7 * 86400000)),
    currentPeriodEndUtc: epochMs(new Date(now.getTime() + 23 * 86400000)),
    nextBillingAtUtc: epochMs(new Date(now.getTime() + 23 * 86400000)),
    status: 0,
    autoRenew: true,
    cancelAtPeriodEnd: false,
    createdAtUtc: epochMs(now),
  };

  const inv1: InvoiceDto = {
    id: genInvUid(),
    accountUid,
    kind: 0,
    periodStartUtc: sub.currentPeriodStartUtc,
    periodEndUtc: sub.currentPeriodEndUtc,
    subtotal: 495,
    tax: 0,
    total: 495,
    currency: 'CNY',
    status: 2,
    issuedAtUtc: epochMs(now),
    paidAtUtc: epochMs(now),
    subscriptionId: sub.id,
    orderId: o1.id,
  };

  const inv2: InvoiceDto = {
    id: genInvUid(),
    accountUid,
    kind: 2,
    periodStartUtc: undefined,
    periodEndUtc: undefined,
    subtotal: 499,
    tax: 0,
    total: 499,
    currency: 'CNY',
    status: 2,
    issuedAtUtc: epochMs(new Date(now.getTime() - 86400000)),
    paidAtUtc: epochMs(new Date(now.getTime() - 86400000)),
    subscriptionId: undefined,
    orderId: o2.id,
  };

  const recharges: RechargeRecord[] = [
    {
      id: genRechargeSerial(new Date(now.getTime() - 30 * 86400000)),
      ownerAccountUid: accountUid,
      provider: 'alipay',
      scene: 0,
      refNo: `2026050100${accountUid}500`,
      amount: 500,
      currency: 'CNY',
      status: 'paid',
      operatorIamId: null,
      createdAtUtc: epochMs(new Date(now.getTime() - 30 * 86400000)),
      paidAtUtc: epochMs(new Date(now.getTime() - 30 * 86400000 + 60000)),
    },
    {
      id: genRechargeSerial(new Date(now.getTime() - 10 * 86400000)),
      ownerAccountUid: accountUid,
      provider: 'wechat_pay',
      scene: 2,
      refNo: `4200002026042100${accountUid}`,
      amount: 12880.5,
      currency: 'CNY',
      status: 'paid',
      operatorIamId: null,
      createdAtUtc: epochMs(new Date(now.getTime() - 10 * 86400000)),
      paidAtUtc: epochMs(new Date(now.getTime() - 10 * 86400000 + 30000)),
    },
    {
      id: genRechargeSerial(new Date(now.getTime() - 3 * 3600000)),
      ownerAccountUid: accountUid,
      provider: 'cs_compensation',
      scene: 99,
      refNo: 'TKT-20260428-018',
      amount: 50,
      currency: 'CNY',
      status: 'paid',
      operatorIamId: '900000001',
      createdAtUtc: epochMs(new Date(now.getTime() - 3 * 3600000)),
      paidAtUtc: epochMs(new Date(now.getTime() - 3 * 3600000)),
    },
    {
      id: genRechargeSerial(new Date(now.getTime() - 20 * 86400000)),
      ownerAccountUid: accountUid,
      provider: 'marketing_reward',
      scene: 99,
      refNo: 'ACT-2026-NEWYEAR',
      amount: 100,
      currency: 'CNY',
      status: 'paid',
      operatorIamId: '900000002',
      createdAtUtc: epochMs(new Date(now.getTime() - 20 * 86400000)),
      paidAtUtc: epochMs(new Date(now.getTime() - 20 * 86400000)),
    },
    {
      id: genRechargeSerial(now),
      ownerAccountUid: accountUid,
      provider: 'alipay',
      scene: 0,
      refNo: `2026051200${accountUid}200`,
      amount: 200,
      currency: 'CNY',
      status: 'pending',
      operatorIamId: null,
      createdAtUtc: epochMs(now),
      paidAtUtc: null,
    },
  ];

  // 主账户和 IAM 子账户都可能触发扣款；这里用一个固定的"子账户"模拟运营/财务/开发的 IAM 子账户
  const iamSubUid = '700000001';

  const bills: BillingEntry[] = [
    {
      id: genBillSerial(new Date(now.getTime() - 7 * 86400000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: accountUid,
      business: 'platform',
      productCode: 'pro-seat',
      subType: 'prepaid',
      status: 'completed',
      failureCode: null,
      originalAmount: 495,
      actualAmount: 495,
      currency: 'CNY',
      balanceAfter: 12880.5,
      refType: 'subscription',
      refId: o1.id,
      reversedAtUtc: null,
      reversedByIamId: null,
      reversedCode: null,
      occurredAtUtc: epochMs(new Date(now.getTime() - 7 * 86400000)),
    },
    {
      id: genBillSerial(new Date(now.getTime() - 86400000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: accountUid,
      business: 'platform',
      productCode: 'api-pack',
      subType: 'prepaid',
      status: 'completed',
      failureCode: null,
      originalAmount: 499,
      actualAmount: 499,
      currency: 'CNY',
      balanceAfter: 12381.5,
      refType: 'order',
      refId: o2.id,
      reversedAtUtc: null,
      reversedByIamId: null,
      reversedCode: null,
      occurredAtUtc: epochMs(new Date(now.getTime() - 86400000)),
    },
    {
      id: genBillSerial(new Date(now.getTime() - 2 * 86400000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: iamSubUid,
      business: 'demux',
      productCode: 'demux-inference',
      subType: 'usage',
      status: 'completed',
      failureCode: null,
      originalAmount: 23,
      actualAmount: 23,
      currency: 'CNY',
      balanceAfter: 12358.5,
      refType: null,
      refId: null,
      reversedAtUtc: null,
      reversedByIamId: null,
      reversedCode: null,
      occurredAtUtc: epochMs(new Date(now.getTime() - 2 * 86400000)),
    },
    {
      id: genBillSerial(new Date(now.getTime() - 5 * 86400000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: iamSubUid,
      business: 'demux',
      productCode: 'demux-inference',
      subType: 'usage',
      status: 'reversed',
      failureCode: null,
      originalAmount: 8.5,
      actualAmount: 0,
      currency: 'CNY',
      balanceAfter: 12358.5,
      refType: null,
      refId: null,
      reversedAtUtc: epochMs(new Date(now.getTime() - 5 * 86400000 + 3600000)),
      reversedByIamId: '900000001',
      reversedCode: 'duplicate_charge',
      occurredAtUtc: epochMs(new Date(now.getTime() - 5 * 86400000)),
    },
    {
      id: genBillSerial(new Date(now.getTime() - 12 * 86400000 - 3600000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: accountUid,
      business: 'demux',
      productCode: 'demux-training',
      subType: 'usage',
      status: 'partial_refunded',
      failureCode: null,
      originalAmount: 200,
      actualAmount: 120,
      currency: 'CNY',
      balanceAfter: null,
      refType: null,
      refId: null,
      reversedAtUtc: epochMs(new Date(now.getTime() - 12 * 86400000)),
      reversedByIamId: '900000001',
      reversedCode: 'service_unavailable',
      occurredAtUtc: epochMs(new Date(now.getTime() - 12 * 86400000 - 3600000)),
    },
    {
      id: genBillSerial(new Date(now.getTime() - 60 * 60 * 1000)),
      ownerAccountUid: accountUid,
      operatorAccountUid: iamSubUid,
      business: 'demux',
      productCode: 'demux-inference',
      subType: 'usage',
      status: 'failed',
      failureCode: 'insufficient_balance',
      originalAmount: 15,
      actualAmount: 0,
      currency: 'CNY',
      balanceAfter: null,
      refType: null,
      refId: null,
      reversedAtUtc: null,
      reversedByIamId: null,
      reversedCode: null,
      occurredAtUtc: epochMs(new Date(now.getTime() - 60 * 60 * 1000)),
    },
  ];

  const businesses: BusinessInstance[] = [
    {
      id: genBusinessUid(),
      accountUid,
      productCode: 'cdn-accel',
      productName: PRODUCT_NAMES['cdn-accel']!,
      status: 'opened',
      openedAtUtc: epochMs(new Date(now.getTime() - 30 * 86400000)),
      currentPeriodEndUtc: epochMs(new Date(now.getTime() + 30 * 86400000)),
    },
    {
      id: genBusinessUid(),
      accountUid,
      productCode: 'obj-storage',
      productName: PRODUCT_NAMES['obj-storage']!,
      status: 'opened',
      openedAtUtc: epochMs(new Date(now.getTime() - 90 * 86400000)),
      currentPeriodEndUtc: epochMs(new Date(now.getTime() + 7 * 86400000)),
    },
    {
      id: genBusinessUid(),
      accountUid,
      productCode: 'ai-inference',
      productName: PRODUCT_NAMES['ai-inference']!,
      status: 'paused',
      openedAtUtc: epochMs(new Date(now.getTime() - 60 * 86400000)),
      pausedAtUtc: epochMs(new Date(now.getTime() - 5 * 86400000)),
      currentPeriodEndUtc: epochMs(new Date(now.getTime() + 15 * 86400000)),
    },
    {
      id: genBusinessUid(),
      accountUid,
      productCode: 'api-pack',
      productName: PRODUCT_NAMES['api-pack']!,
      status: 'stopped',
      openedAtUtc: epochMs(new Date(now.getTime() - 180 * 86400000)),
      stoppedAtUtc: epochMs(new Date(now.getTime() - 20 * 86400000)),
      currentPeriodEndUtc: null,
    },
  ];

  return {
    wallet,
    orders: [o1, o2],
    subscriptions: [sub],
    invoices: [inv1, inv2],
    recharges,
    bills,
    businesses,
  };
}

function ensure(accountUid: Uid): AccountBilling {
  let b = store.get(accountUid);
  if (!b) {
    b = seedForAccount(accountUid);
    store.set(accountUid, b);
  }
  return b;
}

function parseOrder(v: unknown): AppResult<OrderDto> {
  const r = orderDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'OrderDto 格式错误' });
}

function parseRecharge(v: unknown): AppResult<RechargeIntent> {
  const r = rechargeIntentSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'RechargeIntent 格式错误' });
}

function parseInvoice(v: unknown): AppResult<InvoiceDto> {
  const r = invoiceDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'InvoiceDto 格式错误' });
}

function parseSubscription(v: unknown): AppResult<SubscriptionDto> {
  const r = subscriptionDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'SubscriptionDto 格式错误' });
}

function filterOrders(rows: OrderDto[], f: ListOrdersFilter): OrderDto[] {
  if (f.status === 'all') return [...rows];
  return rows.filter((o) => o.status === f.status);
}

function filterInvoices(rows: InvoiceDto[], f: ListInvoicesFilter): InvoiceDto[] {
  let out = [...rows];
  if (f.kind !== 'all') {
    out = out.filter((r) => r.kind === f.kind);
  }
  if (f.fromUtc != null) {
    const from = f.fromUtc;
    out = out.filter((r) => r.issuedAtUtc >= from);
  }
  if (f.toUtc != null) {
    const to = f.toUtc;
    out = out.filter((r) => r.issuedAtUtc <= to);
  }
  return out;
}

export class BillingMock implements BillingPort {
  async createRecharge(accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>> {
    await delay();
    if (input.amount <= 0) {
      return fail({ code: 'validation', message: '充值金额必须大于 0' });
    }
    const b = ensure(accountUid);
    const created = epochMs(new Date());
    const provider = (input.provider ?? 'manual') as RechargeRecord['provider'];
    const intent: RechargeIntent = {
      rechargeId: genRechargeUid(),
      outTradeNo: `MOCK-${Date.now()}`,
      provider,
      scene: input.scene ?? 99,
      amount: input.amount,
      currency: b.wallet.currency,
      qrCodeUrl: null,
      redirectUrl: null,
      jsApiPayloadJson: null,
      createdAtUtc: created,
      expiresAtUtc: null,
    };
    const p = parseRecharge(intent);
    if (!p.success) return p;
    b.wallet = {
      ...b.wallet,
      available: b.wallet.available + input.amount,
      updatedAtUtc: created,
    };
    const record: RechargeRecord = {
      id: genRechargeSerial(new Date()),
      ownerAccountUid: accountUid,
      provider,
      scene: intent.scene,
      refNo: intent.outTradeNo,
      amount: intent.amount,
      currency: intent.currency,
      status: 'paid',
      operatorIamId: null,
      createdAtUtc: created,
      paidAtUtc: created,
    };
    b.recharges.unshift(record);
    return ok(p.data);
  }

  async createInternalRecharge(
    input: CreateInternalRechargeInput,
  ): Promise<AppResult<RechargeRecord>> {
    await delay();
    if (!input.ownerAccountUid.trim()) {
      return fail({ code: 'validation', message: '请选择账户' });
    }
    if (input.amount <= 0) {
      return fail({ code: 'validation', message: '入账金额必须大于 0' });
    }
    const accountUid = input.ownerAccountUid.trim();
    const b = ensure(accountUid);
    const created = epochMs(new Date());
    b.wallet = {
      ...b.wallet,
      available: b.wallet.available + input.amount,
      updatedAtUtc: created,
    };
    const refNo = input.idempotencyKey?.trim() || `MOCK-INT-${Date.now()}`;
    const record: RechargeRecord = {
      id: genRechargeSerial(new Date()),
      ownerAccountUid: accountUid,
      provider: input.source,
      scene: 99,
      refNo,
      amount: input.amount,
      currency: b.wallet.currency,
      status: 'paid',
      operatorIamId: '900001',
      createdAtUtc: created,
      paidAtUtc: created,
    };
    const parsed = rechargeRecordSchema.safeParse(record);
    if (!parsed.success) {
      return fail({ code: 'validation', message: 'RechargeRecord 格式错误' });
    }
    b.recharges.unshift(parsed.data);
    return ok(parsed.data);
  }

  async placeOrder(accountUid: Uid, input: PlaceOrderInput): Promise<AppResult<PlaceOrderResult>> {
    await delay();
    const b = ensure(accountUid);
    const q = input.quantity <= 0 ? 1 : input.quantity;
    const orderId = genOrderUid();
    const created = epochMs(new Date());
    const order: OrderDto = {
      id: orderId,
      accountUid,
      productCode: input.productCode,
      quantity: q,
      billingMode: 0,
      unitPriceSnapshot: 1,
      status: 0,
      metadataJson: input.metadataJson ?? undefined,
      createdAtUtc: created,
      activatedAtUtc: undefined,
      terminatedAtUtc: undefined,
    };
    const po = parseOrder(order);
    if (!po.success) return po;
    b.orders.unshift(po.data);
    const result: PlaceOrderResult = {
      orderId,
      status: 0,
      billingMode: 0,
      amount: q,
      holdId: undefined,
      subscriptionId: undefined,
      invoiceId: undefined,
    };
    return ok(result);
  }

  async getOrder(accountUid: Uid, orderId: Uid): Promise<AppResult<OrderDto>> {
    await delay();
    const b = ensure(accountUid);
    const row = b.orders.find((o) => o.id === orderId);
    if (!row) return fail({ code: 'not_found', message: `订单 ${orderId} 不存在` });
    return parseOrder(row);
  }

  async listOrders(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListOrdersFilter },
  ): Promise<AppResult<ListOrdersPage>> {
    await delay();
    const b = ensure(accountUid);
    const filtered = filterOrders(b.orders, input.filter);
    const items = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: OrderDto[] = [];
    for (const it of items) {
      const r = parseOrder(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async listSubscriptions(accountUid: Uid): Promise<AppResult<SubscriptionDto[]>> {
    await delay();
    const b = ensure(accountUid);
    const out: SubscriptionDto[] = [];
    for (const s of b.subscriptions) {
      const r = parseSubscription(s);
      if (!r.success) return r;
      out.push(r.data);
    }
    return ok(out);
  }

  async setSubscriptionCancelAtPeriodEnd(subscriptionId: Uid, flag: boolean): Promise<AppResult<void>> {
    await delay();
    for (const b of store.values()) {
      const idx = b.subscriptions.findIndex((s) => s.id === subscriptionId);
      if (idx >= 0) {
        const cur = b.subscriptions[idx];
        if (!cur) return fail({ code: 'not_found', message: '订阅不存在' });
        b.subscriptions[idx] = { ...cur, cancelAtPeriodEnd: flag };
        return ok(undefined);
      }
    }
    return fail({ code: 'not_found', message: `订阅 ${subscriptionId} 不存在` });
  }

  async listInvoices(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListInvoicesFilter },
  ): Promise<AppResult<ListInvoicesPage>> {
    await delay();
    const b = ensure(accountUid);
    const filtered = filterInvoices(b.invoices, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: InvoiceDto[] = [];
    for (const it of slice) {
      const r = parseInvoice(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>> {
    await delay();
    let all: RechargeRecord[] = [];
    if (input.filter.accountUid) {
      const b = ensure(input.filter.accountUid);
      all = [...b.recharges];
    } else {
      for (const b of store.values()) {
        all.push(...b.recharges);
      }
      all.sort((a, b) => b.createdAtUtc - a.createdAtUtc);
    }
    if (input.filter.provider !== 'all') {
      all = all.filter((r) => r.provider === input.filter.provider);
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
    }
    if (input.filter.fromUtc != null) {
      const from = input.filter.fromUtc;
      all = all.filter((r) => r.createdAtUtc >= from);
    }
    if (input.filter.toUtc != null) {
      const to = input.filter.toUtc;
      all = all.filter((r) => r.createdAtUtc <= to);
    }
    const slice = clientPaginate(all, input.page, input.pageSize);
    const parsed: RechargeRecord[] = [];
    for (const it of slice) {
      const r = rechargeRecordSchema.safeParse(it);
      if (!r.success) continue;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: all.length });
  }

  async listBusinesses(
    accountUid: Uid,
    filter: ListBusinessesFilter,
  ): Promise<AppResult<BusinessInstance[]>> {
    await delay();
    const b = ensure(accountUid);
    let rows = [...b.businesses];
    if (filter.status !== 'all') {
      rows = rows.filter((r) => r.status === filter.status);
    }
    rows.sort((a, b) => b.openedAtUtc - a.openedAtUtc);
    const parsed: BusinessInstance[] = [];
    for (const it of rows) {
      const r = businessInstanceSchema.safeParse(it);
      if (!r.success) continue;
      parsed.push(r.data);
    }
    return ok(parsed);
  }

  async listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>> {
    await delay();
    let all: BillingEntry[] = [];
    if (input.filter.accountUid) {
      const b = ensure(input.filter.accountUid);
      all = [...b.bills];
    } else {
      for (const b of store.values()) {
        all.push(...b.bills);
      }
      all.sort((a, b) => b.occurredAtUtc - a.occurredAtUtc);
    }
    if (input.filter.business !== 'all') {
      all = all.filter((r) => r.business === input.filter.business);
    }
    if (input.filter.subType !== 'all') {
      all = all.filter((r) => r.subType === input.filter.subType);
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
    }
    if (input.filter.fromUtc != null) {
      const from = input.filter.fromUtc;
      all = all.filter((r) => r.occurredAtUtc >= from);
    }
    if (input.filter.toUtc != null) {
      const to = input.filter.toUtc;
      all = all.filter((r) => r.occurredAtUtc <= to);
    }
    const slice = clientPaginate(all, input.page, input.pageSize);
    const parsed: BillingEntry[] = [];
    for (const it of slice) {
      const r = billingEntrySchema.safeParse(it);
      if (!r.success) continue;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: all.length });
  }
}
