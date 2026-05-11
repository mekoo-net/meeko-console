import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { createUidSeq, type Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  invoiceDtoSchema,
  orderDtoSchema,
  rechargeIntentSchema,
  rechargeRecordSchema,
  subscriptionDtoSchema,
  walletSnapshotSchema,
  type CreateRechargeInput,
  type InvoiceDto,
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
import type {
  BillingPort,
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
}

const genOrderUid = createUidSeq(5_000_000);
const genSubUid = createUidSeq(6_000_000);
const genInvUid = createUidSeq(7_000_000);
const genRechargeUid = createUidSeq(8_000_000);
const genRechargeRecordUid = createUidSeq(9_000_000);

const store = new Map<Uid, AccountBilling>();

function iso(d: Date): string {
  return d.toISOString();
}

function seedForAccount(accountUid: Uid): AccountBilling {
  const now = new Date('2026-05-01T08:00:00Z');
  const wallet: WalletSnapshot = {
    accountUid,
    available: 12880.5,
    held: 200,
    currency: 'CNY',
    updatedAtUtc: iso(now),
  };

  const o1: OrderDto = {
    uid: genOrderUid(),
    accountUid,
    productCode: 'pro-seat',
    quantity: 5,
    billingMode: 1,
    unitPriceSnapshot: 99,
    status: 2,
    resourceUid: undefined,
    metadataJson: undefined,
    createdAtUtc: iso(now),
    activatedAtUtc: iso(now),
    terminatedAtUtc: undefined,
  };

  const o2: OrderDto = {
    uid: genOrderUid(),
    accountUid,
    productCode: 'api-pack',
    quantity: 1,
    billingMode: 0,
    unitPriceSnapshot: 499,
    status: 3,
    createdAtUtc: iso(new Date(now.getTime() - 86400000)),
    activatedAtUtc: iso(new Date(now.getTime() - 86400000)),
    terminatedAtUtc: iso(now),
  };

  const sub: SubscriptionDto = {
    uid: genSubUid(),
    accountUid,
    orderUid: o1.uid,
    productCode: 'pro-seat',
    period: 0,
    currentPeriodStartUtc: iso(new Date(now.getTime() - 7 * 86400000)),
    currentPeriodEndUtc: iso(new Date(now.getTime() + 23 * 86400000)),
    nextBillingAtUtc: iso(new Date(now.getTime() + 23 * 86400000)),
    status: 0,
    autoRenew: true,
    cancelAtPeriodEnd: false,
    createdAtUtc: iso(now),
  };

  const inv1: InvoiceDto = {
    uid: genInvUid(),
    accountUid,
    kind: 0,
    periodStartUtc: sub.currentPeriodStartUtc,
    periodEndUtc: sub.currentPeriodEndUtc,
    subtotal: 495,
    tax: 0,
    total: 495,
    currency: 'CNY',
    status: 2,
    issuedAtUtc: iso(now),
    paidAtUtc: iso(now),
    subscriptionUid: sub.uid,
    orderUid: o1.uid,
  };

  const inv2: InvoiceDto = {
    uid: genInvUid(),
    accountUid,
    kind: 2,
    periodStartUtc: undefined,
    periodEndUtc: undefined,
    subtotal: 499,
    tax: 0,
    total: 499,
    currency: 'CNY',
    status: 2,
    issuedAtUtc: iso(new Date(now.getTime() - 86400000)),
    paidAtUtc: iso(new Date(now.getTime() - 86400000)),
    subscriptionUid: undefined,
    orderUid: o2.uid,
  };

  const recharges: RechargeRecord[] = [
    {
      uid: genRechargeRecordUid(),
      accountUid,
      outTradeNo: `TRADE-SEED-001-${accountUid}`,
      provider: 'alipay',
      scene: 0,
      amount: 500,
      currency: 'CNY',
      status: 'paid',
      createdAtUtc: iso(new Date(now.getTime() - 30 * 86400000)),
      paidAtUtc: iso(new Date(now.getTime() - 30 * 86400000 + 60000)),
    },
    {
      uid: genRechargeRecordUid(),
      accountUid,
      outTradeNo: `TRADE-SEED-002-${accountUid}`,
      provider: 'wechat_pay',
      scene: 2,
      amount: 12880.5,
      currency: 'CNY',
      status: 'paid',
      createdAtUtc: iso(new Date(now.getTime() - 10 * 86400000)),
      paidAtUtc: iso(new Date(now.getTime() - 10 * 86400000 + 30000)),
    },
    {
      uid: genRechargeRecordUid(),
      accountUid,
      outTradeNo: `TRADE-SEED-003-${accountUid}`,
      provider: 'manual',
      scene: 99,
      amount: 200,
      currency: 'CNY',
      status: 'pending',
      createdAtUtc: iso(now),
      paidAtUtc: null,
    },
  ];

  return {
    wallet,
    orders: [o1, o2],
    subscriptions: [sub],
    invoices: [inv1, inv2],
    recharges,
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

function parseWallet(v: unknown): AppResult<WalletSnapshot> {
  const r = walletSnapshotSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'WalletSnapshot 格式错误' });
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
  if (f.fromUtc) {
    const from = Date.parse(f.fromUtc);
    out = out.filter((r) => Date.parse(r.issuedAtUtc) >= from);
  }
  if (f.toUtc) {
    const to = Date.parse(f.toUtc);
    out = out.filter((r) => Date.parse(r.issuedAtUtc) <= to);
  }
  return out;
}

export class BillingMock implements BillingPort {
  async getWallet(accountUid: Uid): Promise<AppResult<WalletSnapshot | null>> {
    await delay();
    const b = ensure(accountUid);
    return parseWallet(b.wallet);
  }

  async createRecharge(accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>> {
    await delay();
    if (input.amount <= 0) {
      return fail({ code: 'validation', message: '充值金额必须大于 0' });
    }
    const b = ensure(accountUid);
    const created = iso(new Date());
    const intent: RechargeIntent = {
      rechargeUid: genRechargeUid(),
      outTradeNo: `MOCK-${Date.now()}`,
      provider: input.provider ?? 'manual',
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
      uid: genRechargeRecordUid(),
      accountUid,
      outTradeNo: intent.outTradeNo,
      provider: intent.provider,
      scene: intent.scene,
      amount: intent.amount,
      currency: intent.currency,
      status: 'paid',
      createdAtUtc: created,
      paidAtUtc: created,
    };
    b.recharges.unshift(record);
    return ok(p.data);
  }

  async placeOrder(accountUid: Uid, input: PlaceOrderInput): Promise<AppResult<PlaceOrderResult>> {
    await delay();
    const b = ensure(accountUid);
    const q = input.quantity <= 0 ? 1 : input.quantity;
    const orderUid = genOrderUid();
    const created = iso(new Date());
    const order: OrderDto = {
      uid: orderUid,
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
      orderUid,
      status: 0,
      billingMode: 0,
      amount: q,
      holdUid: undefined,
      subscriptionUid: undefined,
      invoiceUid: undefined,
    };
    return ok(result);
  }

  async getOrder(accountUid: Uid, orderUid: Uid): Promise<AppResult<OrderDto>> {
    await delay();
    const b = ensure(accountUid);
    const row = b.orders.find((o) => o.uid === orderUid);
    if (!row) return fail({ code: 'not_found', message: `订单 ${orderUid} 不存在` });
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

  async setSubscriptionCancelAtPeriodEnd(subscriptionUid: Uid, flag: boolean): Promise<AppResult<void>> {
    await delay();
    for (const b of store.values()) {
      const idx = b.subscriptions.findIndex((s) => s.uid === subscriptionUid);
      if (idx >= 0) {
        const cur = b.subscriptions[idx];
        if (!cur) return fail({ code: 'not_found', message: '订阅不存在' });
        b.subscriptions[idx] = { ...cur, cancelAtPeriodEnd: flag };
        return ok(undefined);
      }
    }
    return fail({ code: 'not_found', message: `订阅 ${subscriptionUid} 不存在` });
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
      all.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
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
}
