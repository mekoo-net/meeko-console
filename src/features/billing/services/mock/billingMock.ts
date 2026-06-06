import { ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { createUidSeq, type Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  billingEntrySchema,
  rechargeIntentSchema,
  rechargeRecordSchema,
  type BillingEntry,
  type CreateRechargeInput,
  type CreateInternalRechargeInput,
  type ListBillsFilter,
  type RechargeIntent,
  type RechargeRecord,
  type WalletSnapshot,
} from '../../model/billing.types';
import { referralRechargesForAccount } from '@/features/accounts/services/mock/referralData';

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

function genBillSerial(at: Date = new Date()): string {
  return formatSerial('BL', at, genBillSerialSeq());
}

function genRechargeSerial(at: Date = new Date()): string {
  return formatSerial('RC', at, genRechargeSerialSeq());
}

const now = Date.now();

function seedAccount(uid: string): AccountBilling {
  const recharge: RechargeRecord = {
    id: genRechargeSerial(),
    ownerAccountUid: uid,
    provider: 'alipay',
    scene: 0,
    refNo: '202605310001',
    amount: 100,
    currency: 'CNY',
    status: 'paid',
    createdAtUtc: now - 86_400_000,
    paidAtUtc: now - 86_000_000,
  };

  const bill: BillingEntry = {
    id: genBillSerial(),
    ownerAccountUid: uid,
    operatorAccountUid: uid,
    business: 'demux',
    productCode: 'demux',
    subType: 'usage',
    status: 'completed',
    originalAmount: 0.12,
    actualAmount: 0.12,
    currency: 'CNY',
    refType: 'hold',
    refId: 'HD-5000001',
    occurredAtUtc: now - 3_600_000,
  };

  return {
    wallet: {
      accountUid: uid,
      available: 99.88,
      held: 0,
      currency: 'CNY',
      updatedAtUtc: now,
    },
    recharges: [recharge, ...referralRechargesForAccount(uid)],
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
      ownerAccountUid: input.ownerAccountUid,
      provider: input.source,
      scene: 99,
      refNo: input.idempotencyKey ?? `INT-${Date.now()}`,
      amount: input.amount,
      currency: 'CNY',
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
      all = [...ensure(input.filter.accountUid).recharges];
    } else {
      for (const b of store.values()) all.push(...b.recharges);
      all.sort((a, b) => b.createdAtUtc - a.createdAtUtc);
    }
    if (input.filter.provider !== 'all') {
      all = all.filter((r) => r.provider === input.filter.provider);
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
    if (input.filter.business !== 'all') {
      all = all.filter((r) => r.business === input.filter.business);
    }
    if (input.filter.subType !== 'all') {
      all = all.filter((r) => r.subType === input.filter.subType);
    }
    if (input.filter.status !== 'all') {
      all = all.filter((r) => r.status === input.filter.status);
    }
    const slice = clientPaginate(all, input.page, input.pageSize);
    const parsed = slice
      .map((it) => billingEntrySchema.safeParse(it))
      .filter((r) => r.success)
      .map((r) => r.data);
    return ok({ items: parsed, total: all.length });
  }
}
