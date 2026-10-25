import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  REWARD_KEY_PATTERN,
  acceptsForm,
  draftToField,
  fieldToDraft,
  fieldsProblem,
  rewardOwnsMessage,
  type ActivityClaim,
  type ActivityReward,
  type ClaimDelivery,
  type ClaimListQuery,
  type ClaimListResult,
  type CodeImportResult,
  type FactDescriptor,
  type FactOption,
  type RewardFacts,
  type RewardInput,
  type VoucherTemplate,
} from '../../model/activityReward.types';
import { DEFAULT_LOCALE, messageKeys, type MessagesPatch } from '../../model/activityMessages';
import type { YomiActivityRewardPort } from '../ports/yomiActivityRewardPort';
import { mockActivityMessages } from './yomiActivityMessagesMock';

const MIN = 60_000;

const NUMBER_OPS: FactOption[] = ['gte', 'gt', 'lte', 'lt', 'eq', 'neq'].map((value, i) => ({ value, label: ['≥', '>', '≤', '<', '=', '≠'][i]! }));

const tagOps = (has: string, notHas: string): FactOption[] => [
  { value: 'has', label: has },
  { value: 'not_has', label: notHas },
];

/** 与后端 ActivityFactCatalog 的中文目录同步的一份拷贝，只给 mock 用。 */
const FACTS: FactDescriptor[] = [
  { kind: 'number', key: 'account.age_days', group: 'account', label: '注册天数', ops: NUMBER_OPS, unit: '天' },
  { kind: 'choice', key: 'account.type', group: 'account', label: '账户类型', ops: [{ value: 'eq', label: '是' }, { value: 'neq', label: '不是' }], options: [{ value: 'personal', label: '个人' }, { value: 'organization', label: '组织' }] },
  { kind: 'tag', key: 'account.achievement', group: 'account', label: '成就', ops: tagOps('拥有', '未拥有'), source: 'achievement' },
  { kind: 'id_list', key: 'account.uid', group: 'account', label: '指定账户', ops: [{ value: 'in', label: '在名单内' }, { value: 'not_in', label: '不在名单内' }] },
  { kind: 'number', key: 'billing.recharge_total', group: 'billing', label: '累计充值', ops: NUMBER_OPS, unit: '元' },
  { kind: 'number', key: 'billing.recharge_in_activity', group: 'billing', label: '活动期间充值', ops: NUMBER_OPS, unit: '元' },
  { kind: 'number', key: 'billing.recharge_count', group: 'billing', label: '累计充值次数', ops: NUMBER_OPS, unit: '次' },
  { kind: 'number', key: 'yomi.spent_total', group: 'yomi', label: 'Yomi 累计消费', ops: NUMBER_OPS, unit: '元' },
  { kind: 'number', key: 'yomi.spent_in_activity', group: 'yomi', label: '活动期间 Yomi 消费', ops: NUMBER_OPS, unit: '元' },
  { kind: 'tag', key: 'activity.reward_claimed', group: 'activity', label: '本活动奖励', ops: tagOps('已领取', '未领取'), source: 'reward' },
];

/** Billing 里的券模板（mock）：两张可选，一张已暂停、一张只适用于 Tavern，都不该出现在选择列表里。 */
const TEMPLATES: VoucherTemplate[] = [
  { id: '31', name: '无门槛 20 元', deductKind: 'no_threshold', faceValue: 20, thresholdAmount: 0, discountRate: null, validityKind: 'relative_days', validFromUtc: null, validToUtc: null, validDays: 30, totalQuota: 500, issuedCount: 126, perUserLimit: 1, status: 'active', allProducts: true, scopeProductCodes: [] },
  { id: '32', name: '满 100 减 15', deductKind: 'full_reduction', faceValue: 15, thresholdAmount: 100, discountRate: null, validityKind: 'relative_days', validFromUtc: null, validToUtc: null, validDays: 14, totalQuota: null, issuedCount: 40, perUserLimit: null, status: 'active', allProducts: false, scopeProductCodes: ['yomi'] },
  { id: '33', name: '双十一 8 折', deductKind: 'discount', faceValue: 50, thresholdAmount: 0, discountRate: 0.8, validityKind: 'relative_days', validFromUtc: null, validToUtc: null, validDays: 7, totalQuota: 100, issuedCount: 100, perUserLimit: 1, status: 'paused', allProducts: true, scopeProductCodes: [] },
  { id: '34', name: 'Tavern 专享', deductKind: 'no_threshold', faceValue: 10, thresholdAmount: 0, discountRate: null, validityKind: 'relative_days', validFromUtc: null, validToUtc: null, validDays: 30, totalQuota: null, issuedCount: 0, perUserLimit: null, status: 'active', allProducts: false, scopeProductCodes: ['tavern'] },
];

interface MockReward extends Omit<ActivityReward, 'name'> {
  /** 卡密明文只活在 mock 里，不随响应返回（线上管理面也拿不到明文）。 */
  codes: string[];
}

/** 奖励名下的种子文案：{ 语言: { 字段: 文案 } }，字段是 name / usage / rule.{id}。 */
function seedTexts(activityId: string, key: string, texts: Record<string, Record<string, string>>): void {
  const prefix = messageKeys.rewardPrefix(key);
  const patch: MessagesPatch = Object.fromEntries(Object.entries(texts).map(([l, fields]) => [
    l,
    Object.fromEntries(Object.entries(fields).map(([f, v]) => [prefix + f, v])),
  ]));
  mockActivityMessages.apply(activityId, patch);
}

function seedRewards(now: number): MockReward[] {
  const base = { activityId: '1', createdAtUtc: now - 6 * 1440 * MIN, updatedAtUtc: now - 1440 * MIN, updatedBy: '900001', isEnabled: true, perUserLimit: 1, codes: [], form: null, voucherTemplate: null, codePool: null };
  seedTexts('1', 'topup-coupon', { zh: { name: '满 100 减 15 代金券' }, en: { name: '¥15 off ¥100' } });
  seedTexts('1', 'voucher-20', { zh: { name: '20 元无门槛券' }, en: { name: '¥20 voucher' } });
  seedTexts('1', 'jd-50', {
    zh: { name: '京东 E 卡 50 元', usage: '登录京东 App，在「我的 - 礼品卡」里绑定卡密后即可使用。' },
    en: { name: 'JD E-card ¥50', usage: 'Bind the code under My > Gift Cards in the JD app.' },
  });
  // 自定义提示只写了中文：英文访客看到的是自动生成的那句。
  seedTexts('1', 'plush', {
    zh: {
      name: '悠米限定毛绒公仔',
      'rule.r2': '累计充值满 1000 元即可领取公仔',
      'field.name': '收件人',
      'field.phone': '手机号',
      'field.address': '收货地址',
      'field.size': '尺寸',
      'field.size.s': '小号',
      'field.size.l': '大号',
      'field.colors': '喜欢的配色',
      'field.colors.pink': '樱花粉',
      'field.colors.blue': '天空蓝',
      'field.colors.cream': '奶油白',
      'field.note': '备注',
    },
    en: {
      name: 'Limited Yomi plush',
      'field.name': 'Recipient',
      'field.phone': 'Phone',
      'field.address': 'Shipping address',
      'field.size': 'Size',
      'field.size.s': 'Small',
      'field.size.l': 'Large',
      'field.colors': 'Favorite colors',
      'field.colors.pink': 'Sakura pink',
      'field.colors.blue': 'Sky blue',
      'field.colors.cream': 'Cream',
      'field.note': 'Note',
    },
  });
  return [
    {
      ...base,
      id: '11',
      key: 'topup-coupon',
      spec: { type: 'voucher', templateId: '32' },
      voucherTemplate: TEMPLATES[1]!,
      rules: { match: 'all', rules: [{ kind: 'number', id: 'r1', fact: 'billing.recharge_in_activity', op: 'gte', value: 100 }] },
      totalQuota: 1000,
      claimedCount: 312,
      remaining: 688,
      sortOrder: 30,
    },
    {
      ...base,
      id: '14',
      key: 'voucher-20',
      spec: { type: 'voucher', templateId: '31' },
      voucherTemplate: TEMPLATES[0]!,
      rules: { match: 'all', rules: [] },
      totalQuota: 200,
      claimedCount: 57,
      remaining: 143,
      sortOrder: 25,
    },
    {
      ...base,
      id: '12',
      key: 'jd-50',
      spec: { type: 'code' },
      codePool: { available: 37, assigned: 13 },
      rules: {
        match: 'all',
        rules: [
          { kind: 'number', id: 'r1', fact: 'billing.recharge_in_activity', op: 'gte', value: 500 },
          { kind: 'tag', id: 'r2', fact: 'activity.reward_claimed', op: 'has', value: 'topup-coupon' },
        ],
      },
      totalQuota: null,
      claimedCount: 13,
      remaining: null,
      sortOrder: 20,
    },
    {
      ...base,
      id: '13',
      key: 'plush',
      spec: { type: 'physical' },
      form: {
        fields: [
          { kind: 'text', id: 'name', required: true },
          { kind: 'phone', id: 'phone', required: true },
          { kind: 'textarea', id: 'address', required: true },
          { kind: 'choice', id: 'size', required: true, options: ['s', 'l'] },
          { kind: 'multi_choice', id: 'colors', required: false, options: ['pink', 'blue', 'cream'] },
          { kind: 'text', id: 'note', required: false },
        ],
      },
      rules: {
        match: 'any',
        rules: [
          { kind: 'tag', id: 'r1', fact: 'account.achievement', op: 'has', value: 'early-bird' },
          { kind: 'number', id: 'r2', fact: 'billing.recharge_total', op: 'gte', value: 1000 },
        ],
      },
      totalQuota: 50,
      claimedCount: 8,
      remaining: 42,
      sortOrder: 10,
    },
  ];
}

function seedClaims(now: number): ActivityClaim[] {
  const rows: ActivityClaim[] = [];
  let id = 5000;
  const push = (rewardId: string, rewardKey: string, rewardName: string, status: ActivityClaim['status'], minutesAgo: number, delivery: ClaimDelivery, extra: Partial<ActivityClaim> = {}) => {
    const at = now - minutesAgo * MIN;
    rows.push({ id: String(++id), rewardId, rewardKey, rewardName, accountUid: String(100_000 + id), seq: 1, status, delivery, answers: null, failureReason: null, canRetry: false, createdAtUtc: at, updatedAtUtc: at, ...extra });
  };
  const regions = ['上海市 浦东新区', '北京市 朝阳区', '广东省 深圳市 南山区', '浙江省 杭州市 西湖区'];
  ['张三', '李四', '王五', '赵六'].forEach((name, i) => push('13', 'plush', '悠米限定毛绒公仔', i < 3 ? 'awaiting_shipment' : 'shipped', 30 + i * 47, {
    type: 'physical',
    shipment: i === 3 ? { company: '顺丰', trackingNo: 'SF1400228899', shippedAtUtc: now - 10 * MIN } : null,
  }, {
    answers: {
      name,
      phone: `1380013${String(8000 + i)}`,
      address: `${regions[i]!} 幸福路 ${100 + i} 号 ${i + 1}0${i + 1} 室`,
      size: i % 2 ? 'l' : 's',
      colors: i % 2 ? ['pink', 'cream'] : ['blue'],
      ...(i === 1 ? { note: '工作日白天不在家，放驿站' } : {}),
    },
  }));
  for (let i = 0; i < 6; i++) push('12', 'jd-50', '京东 E 卡 50 元', 'granted', 90 + i * 113, { type: 'code', hint: String(4100 + i * 37).slice(-4) });
  for (let i = 0; i < 8; i++) push('11', 'topup-coupon', '满 100 减 15 代金券', 'granted', 20 + i * 71, { type: 'voucher', templateId: '32', userVoucherId: String(71_001 + i) });
  for (let i = 0; i < 3; i++) push('14', 'voucher-20', '20 元无门槛券', 'granted', 50 + i * 90, { type: 'voucher', templateId: '31', userVoucherId: String(70_001 + i) });
  push('11', 'topup-coupon', '满 100 减 15 代金券', 'pending', 6, { type: 'voucher', templateId: '32', userVoucherId: null }, { canRetry: true });
  push('11', 'topup-coupon', '满 100 减 15 代金券', 'failed', 400, { type: 'voucher', templateId: '32', userVoucherId: null }, { canRetry: true, failureReason: '已达该券每人限领上限' });
  return rows.sort((a, b) => b.createdAtUtc - a.createdAtUtc);
}

export class YomiActivityRewardMock implements YomiActivityRewardPort {
  private rewards: MockReward[] = seedRewards(Date.now());
  private claimRows: ActivityClaim[] = seedClaims(Date.now());
  private nextId = 200;

  constructor() {
    mockActivityMessages.useRewards((activityId) => this.rewards.filter((r) => r.activityId === activityId));
  }

  async facts(): Promise<AppResult<RewardFacts>> {
    await delay(80);
    return ok({ facts: FACTS, codeKeyConfigured: true });
  }

  async voucherTemplates(): Promise<AppResult<VoucherTemplate[]>> {
    await delay(120);
    return ok(TEMPLATES.filter((t) => t.status === 'active'
      && (t.allProducts || t.scopeProductCodes.includes('yomi'))
      && (t.totalQuota === null || t.issuedCount < t.totalQuota)));
  }

  async list(activityId: string): Promise<AppResult<ActivityReward[]>> {
    await delay(120);
    return ok(this.rewards
      .filter((r) => r.activityId === activityId)
      .sort((a, b) => b.sortOrder - a.sortOrder || Number(a.id) - Number(b.id))
      .map((r) => this.view(r)));
  }

  async create(activityId: string, input: RewardInput): Promise<AppResult<ActivityReward>> {
    await delay(150);
    const invalid = this.validate(activityId, null, input);
    if (invalid) return fail({ code: 'validation', message: invalid });
    const now = Date.now();
    const row: MockReward = {
      ...this.apply(input, null),
      id: String(this.nextId++),
      activityId,
      claimedCount: 0,
      remaining: input.totalQuota,
      codes: [],
      createdAtUtc: now,
      updatedAtUtc: now,
      updatedBy: '900001',
    };
    this.rewards.push(row);
    return ok(this.view(row));
  }

  async update(activityId: string, rewardId: string, input: RewardInput): Promise<AppResult<ActivityReward>> {
    await delay(150);
    const row = this.rewards.find((r) => r.id === rewardId && r.activityId === activityId);
    if (!row) return fail({ code: 'not_found', message: `奖励 ${rewardId} 不存在。` });
    const invalid = this.validate(activityId, row, input);
    if (invalid) return fail({ code: 'validation', message: invalid });
    const oldKey = row.key;
    Object.assign(row, this.apply(input, row), {
      remaining: input.totalQuota === null ? null : input.totalQuota - row.claimedCount,
      updatedAtUtc: Date.now(),
    });
    // 与后端一致：改 key、改登记项 id 时文案跟着搬，删掉的条件、登记项，它们的文字也清掉。
    mockActivityMessages.renameReward(activityId, oldKey, row.key);
    mockActivityMessages.renameFields(activityId, row.key, input.renames);
    mockActivityMessages.pruneReward(activityId, row.key, (field) => rewardOwnsMessage(row, field));
    return ok(this.view(row));
  }

  async remove(activityId: string, rewardId: string): Promise<AppResult<void>> {
    await delay(100);
    const row = this.rewards.find((r) => r.id === rewardId && r.activityId === activityId);
    if (!row) return fail({ code: 'not_found', message: `奖励 ${rewardId} 不存在。` });
    const pool = row.codePool;
    if (row.claimedCount > 0 || (pool && pool.available + pool.assigned > 0))
      return fail({ code: 'conflict', message: '已有领取记录或卡密的奖励不能删除，请改为停用。' });
    this.rewards = this.rewards.filter((r) => r !== row);
    mockActivityMessages.pruneReward(activityId, row.key);
    return ok(undefined);
  }

  async importCodes(activityId: string, rewardId: string, codes: string): Promise<AppResult<CodeImportResult>> {
    await delay(300);
    const row = this.rewards.find((r) => r.id === rewardId && r.activityId === activityId);
    if (!row) return fail({ code: 'not_found', message: `奖励 ${rewardId} 不存在。` });
    if (row.spec.type !== 'code') return fail({ code: 'validation', message: '只有虚拟奖品可以导入卡密。' });
    const lines = codes.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return fail({ code: 'validation', message: '没有可导入的卡密（每行一张）。' });
    const invalid = lines.filter((l) => l.length > 500).length;
    const seen = new Set(row.codes);
    let imported = 0;
    for (const l of lines) {
      if (l.length > 500 || seen.has(l)) continue;
      seen.add(l);
      row.codes.push(l);
      imported++;
    }
    const pool = { available: (row.codePool?.available ?? 0) + imported, assigned: row.codePool?.assigned ?? 0 };
    row.codePool = pool;
    return ok({ imported, duplicates: lines.length - invalid - imported, invalid, available: pool.available });
  }

  async claims(activityId: string, query: ClaimListQuery): Promise<AppResult<ClaimListResult>> {
    await delay(150);
    const rewardIds = new Set(this.rewards.filter((r) => r.activityId === activityId).map((r) => r.id));
    const filtered = this.claimRows
      .filter((c) => rewardIds.has(c.rewardId))
      .filter((c) => !query.rewardId || c.rewardId === query.rewardId)
      .filter((c) => !query.status || c.status === query.status)
      .filter((c) => !query.accountUid || c.accountUid === query.accountUid.trim())
      .filter((c) => query.fromUtc === null || c.createdAtUtc >= query.fromUtc)
      .filter((c) => query.toUtc === null || c.createdAtUtc <= query.toUtc);
    const start = (query.page - 1) * query.pageSize;
    return ok({ items: filtered.slice(start, start + query.pageSize), total: filtered.length });
  }

  async ship(claimId: string, company: string, trackingNo: string): Promise<AppResult<ActivityClaim>> {
    await delay(150);
    const c = this.claimRows.find((x) => x.id === claimId);
    if (!c) return fail({ code: 'not_found', message: `领取记录 ${claimId} 不存在。` });
    if (c.delivery.type !== 'physical') return fail({ code: 'validation', message: '只有实物奖励需要发货。' });
    if (!company.trim() || !trackingNo.trim()) return fail({ code: 'validation', message: '快递公司和单号都要填。' });
    const now = Date.now();
    Object.assign(c, {
      status: 'shipped',
      delivery: { ...c.delivery, shipment: { company: company.trim(), trackingNo: trackingNo.trim(), shippedAtUtc: now } },
      updatedAtUtc: now,
    });
    return ok({ ...c });
  }

  async retry(claimId: string): Promise<AppResult<ActivityClaim>> {
    await delay(400);
    const c = this.claimRows.find((x) => x.id === claimId);
    if (!c) return fail({ code: 'not_found', message: `领取记录 ${claimId} 不存在。` });
    if (!c.canRetry) return fail({ code: 'validation', message: '只有发放中或发放失败的代金券可以重试。' });
    Object.assign(c, { status: 'granted', canRetry: false, failureReason: null, updatedAtUtc: Date.now() });
    return ok({ ...c });
  }

  /** 名称取默认语言的，没填就显示 key，与后端一致。 */
  private view(r: MockReward): ActivityReward {
    const name = mockActivityMessages.text(r.activityId, DEFAULT_LOCALE, messageKeys.rewardName(r.key)) ?? r.key;
    const copy: Partial<MockReward> & { name: string } = { ...structuredClone(r), name };
    delete copy.codes;
    return copy as ActivityReward;
  }

  /** 后端存提交的参数与表格，返回时补上只读部分（模板现状、卡池余量）。 */
  private apply(input: RewardInput, prev: MockReward | null) {
    const spec = input.spec;
    return {
      key: input.key,
      spec,
      form: input.form?.fields.length ? { fields: input.form.fields.map((f) => draftToField(fieldToDraft(f))) } : null,
      voucherTemplate: spec.type === 'voucher' ? TEMPLATES.find((t) => t.id === spec.templateId) ?? null : null,
      codePool: spec.type === 'code' ? prev?.codePool ?? { available: 0, assigned: 0 } : null,
      rules: { match: input.rules.match, rules: input.rules.rules.map((x) => ({ ...x })) },
      totalQuota: input.totalQuota,
      perUserLimit: input.perUserLimit,
      isEnabled: input.isEnabled,
      sortOrder: input.sortOrder,
    };
  }

  private validate(activityId: string, self: MockReward | null, input: RewardInput): string | null {
    const key = input.key;
    if (!REWARD_KEY_PATTERN.test(key)) return '奖励 key 只能用小写字母、数字和 -，以字母或数字开头，最长 48。';
    const siblings = this.rewards.filter((r) => r.activityId === activityId && r !== self);
    if (siblings.some((r) => r.key === key)) return `本活动已有 key 为「${key}」的奖励。`;
    if (self && self.claimedCount > 0 && self.spec.type !== input.spec.type) return '已有人领取的奖励不能更换类型，请新建一个奖励。';
    if (self && self.claimedCount > 0 && input.renames) return '已有人领取，登记项和选项的 id 不能再改。';
    if (input.spec.type === 'voucher') {
      const id = input.spec.templateId;
      const t = TEMPLATES.find((x) => x.id === id);
      if (!t) return `券模板 ${id || '（未选）'} 不存在。`;
      if (!t.allProducts && !t.scopeProductCodes.includes('yomi')) return `券模板「${t.name}」的适用范围不包含 Yomi。`;
      const previous = self?.spec.type === 'voucher' ? self.spec.templateId : null;
      if (id !== previous && t.status !== 'active') return `券模板「${t.name}」没有上架，不能选。`;
    }
    if (input.form) {
      if (!acceptsForm(input.spec.type)) return '这类奖励不能设置登记表格。';
      const fields = fieldsProblem(input.form.fields.map(fieldToDraft));
      if (fields) return `${fields}。`;
    }
    if (input.totalQuota !== null && self && input.totalQuota < self.claimedCount) return `总量不能小于已领取的 ${self.claimedCount} 份。`;
    for (const [i, r] of input.rules.rules.entries()) {
      const d = FACTS.find((f) => f.key === r.fact);
      if (!d) return `第 ${i + 1} 条条件：未知的条件项。`;
      if (d.kind !== r.kind) return `第 ${i + 1} 条条件：「${d.label}」不是这种条件。`;
      if (r.kind === 'tag' && d.kind === 'tag' && d.source === 'reward') {
        if (r.value === key) return `第 ${i + 1} 条条件：不能引用奖励自己。`;
        if (!siblings.some((s) => s.key === r.value)) return `第 ${i + 1} 条条件：本活动没有 key 为「${r.value}」的奖励。`;
      }
      if (r.kind === 'id_list' && !r.value.length) return `第 ${i + 1} 条条件：账户名单要填 1~1000 个有效 UID。`;
    }
    return null;
  }
}
