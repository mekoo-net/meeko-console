import { describe, expect, it } from 'vitest';

import { buildAiPrompt } from '../model/activity.types';
import {
  activityClaimSchema,
  activityRewardSchema,
  describeRules,
  describeVoucherTemplate,
  draftToField,
  draftToInput,
  fieldRenames,
  fieldToDraft,
  newField,
  newOption,
  renameFieldMessages,
  emptyRewardDraft,
  fieldsProblem,
  rewardOwnsMessage,
  rewardRequiredKeys,
  placedRewardKeys,
  renderClaimPlaceholders,
  rewardFactsSchema,
  rewardToDraft,
  voucherTemplateSchema,
  type FactDescriptor,
  type RegistrationField,
} from '../model/activityReward.types';

/**
 * 活动奖励：线上格式按 Meeko.Yomi 的 ActivityRewardAdminDto / ActivityClaimAdminDto / ActivityRewardFactsDto，
 * 奖励参数与领取结果按 type 多态、条件与条件目录按 kind 多态；文案在语言包里，这里只有默认语言的名称；
 * `<yomi-claim reward="key">` 的识别要与官网的 sanitize + 挂载规则一致。
 */

const facts: FactDescriptor[] = rewardFactsSchema.parse({
  facts: [
    {
      kind: 'number',
      key: 'account.age_days',
      group: 'account',
      label: '注册天数',
      ops: [{ value: 'gte', label: '≥' }],
      unit: '天',
    },
    {
      kind: 'tag',
      key: 'activity.reward_claimed',
      group: 'activity',
      label: '本活动奖励',
      ops: [{ value: 'has', label: '已领取' }],
      source: 'reward',
    },
    {
      kind: 'id_list',
      key: 'account.uid',
      group: 'account',
      label: '指定账户',
      ops: [{ value: 'in', label: '在名单内' }],
    },
  ],
  codeKeyConfigured: true,
}).facts;

const codeReward = {
  id: '11',
  activityId: '1',
  key: 'jd-50',
  name: '京东 E 卡 50 元',
  spec: { type: 'code' },
  codePool: { available: 8, assigned: 2 },
  rules: { match: 'all', rules: [{ kind: 'id_list', id: 'r1', fact: 'account.uid', op: 'in', value: ['100001', '100003'] }] },
  totalQuota: null,
  perUserLimit: 1,
  claimedCount: 2,
  remaining: null,
  isEnabled: true,
  sortOrder: 0,
  createdAtUtc: 1,
  updatedAtUtc: 2,
  updatedBy: null,
};

describe('reward wire contract', () => {
  it('parses a polymorphic spec and kind-tagged rules', () => {
    const r = activityRewardSchema.safeParse(codeReward);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.spec.type).toBe('code');
    expect(r.data.codePool?.available).toBe(8);
    expect(r.data.form).toBeNull();
    expect(r.data.rules.rules[0]!.kind).toBe('id_list');
  });

  it('rejects a spec whose fields do not match its type', () => {
    expect(activityRewardSchema.safeParse({ ...codeReward, spec: { type: 'voucher' } }).success).toBe(false);
    // 余额不是活动奖励。
    expect(activityRewardSchema.safeParse({ ...codeReward, spec: { type: 'balance', amount: 5 } }).success).toBe(false);
  });

  it('round-trips through the editor draft with the discriminator first', () => {
    const draft = rewardToDraft(activityRewardSchema.parse(codeReward));
    // 名单在编辑框里是一段文本。
    expect(draft.rules.rules[0]!.value).toBe('100001\n100003');
    draft.specs.voucher.templateId = '31';
    const input = draftToInput(draft);
    expect(input.spec).toEqual({ type: 'code' });
    expect(Object.keys(input.spec)[0]).toBe('type');
    expect(Object.keys(input.rules.rules[0]!)[0]).toBe('kind');
    expect(input.rules.rules[0]!.id).toBe('r1');
    expect(input.rules.rules[0]!.value).toEqual(['100001', '100003']);
    expect(input).not.toHaveProperty('messages');
  });

  it('gives rules without an id the next free rN so a hint can hang on them', () => {
    const r = activityRewardSchema.parse({
      ...codeReward,
      rules: { match: 'all', rules: [
        { kind: 'number', fact: 'account.age_days', op: 'gte', value: 1 },
        { kind: 'number', id: 'r1', fact: 'account.age_days', op: 'gte', value: 2 },
      ] },
    });
    expect(rewardToDraft(r).rules.rules.map((x) => x.id)).toEqual(['r2', 'r1']);
  });

  it('switching type keeps each type draft and submits only the chosen one', () => {
    const draft = emptyRewardDraft();
    draft.type = 'physical';
    draft.type = 'voucher';
    draft.specs.voucher.templateId = '31';
    expect(draftToInput(draft).spec).toEqual({ type: 'voucher', templateId: '31' });
    draft.type = 'physical';
    expect(draftToInput(draft).spec).toEqual({ type: 'physical' });
    expect(draftToInput(draft).form).toBeNull();
    draft.type = 'voucher';
    expect(draftToInput(draft).spec).toEqual({ type: 'voucher', templateId: '31' });
  });

  it('parses a claim whose delivery is typed', () => {
    const r = activityClaimSchema.safeParse({
      id: '9001',
      rewardId: '13',
      rewardKey: 'plush',
      rewardName: '公仔',
      accountUid: '100001',
      seq: 1,
      status: 'shipped',
      delivery: {
        type: 'physical',
        shipment: { company: '顺丰', trackingNo: 'SF1', shippedAtUtc: 1 },
      },
      answers: { name: '张三', colors: ['red', 'blue'] },
      failureReason: null,
      canRetry: false,
      createdAtUtc: 1,
      updatedAtUtc: 1,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.delivery.type === 'physical') {
      expect(r.data.delivery.shipment?.trackingNo).toBe('SF1');
      expect(r.data.answers?.colors).toEqual(['red', 'blue']);
    }
  });
});

describe('voucher templates', () => {
  it('parses the Billing template view with string ids and ms times', () => {
    const t = voucherTemplateSchema.parse({
      id: '31',
      name: '满 100 减 15',
      deductKind: 'full_reduction',
      faceValue: 15,
      thresholdAmount: 100,
      validityKind: 'relative_days',
      validDays: 14,
      totalQuota: 50,
      issuedCount: 20,
      status: 'paused',
      allProducts: false,
      scopeProductCodes: ['yomi'],
    });
    expect(t.validToUtc).toBeNull();
    expect(describeVoucherTemplate(t)).toBe('满 100 减 15 · 领取后 14 天有效 · 剩 30 张');
  });

  it('reads the template status beside a voucher spec', () => {
    const r = activityRewardSchema.parse({
      ...codeReward,
      spec: { type: 'voucher', templateId: 31 },
      voucherTemplate: { id: '31', name: '无门槛 20', deductKind: 'no_threshold', faceValue: 20, validityKind: 'relative_days', validDays: 30, status: 'active' },
      codePool: null,
      rules: { match: 'all', rules: [] },
    });
    expect(r.spec.type === 'voucher' && r.spec.templateId).toBe('31');
    expect(describeVoucherTemplate(r.voucherTemplate!)).toBe('无门槛 20 元 · 领取后 30 天有效');
  });
});

describe('describeRules', () => {
  const names = new Map([['topup-coupon', '满 100 减 15']]);

  it('reads like a sentence', () => {
    expect(describeRules({ match: 'all', rules: [] }, facts, names)).toBe('所有登录用户');
    expect(describeRules({
      match: 'any',
      rules: [
        { kind: 'number', id: 'r1', fact: 'account.age_days', op: 'gte', value: 7 },
        { kind: 'tag', id: 'r2', fact: 'activity.reward_claimed', op: 'has', value: 'topup-coupon' },
        { kind: 'id_list', id: 'r3', fact: 'account.uid', op: 'in', value: ['1', '2', '3'] },
      ],
    }, facts, names)).toBe('注册天数 ≥ 7 天 或 已领取「满 100 减 15」 或 在名单内（3 个账户）');
  });
});

describe('claim widget placeholders', () => {
  const names = new Map([['jd-50', 'JD card']]);

  it('finds placed keys in either quoting style', () => {
    const html = `<yomi-claim reward="jd-50"></yomi-claim><YOMI-CLAIM reward='Plush'/><yomi-claim reward=coupon>x</yomi-claim>`;
    expect([...placedRewardKeys(html)]).toEqual(['jd-50', 'plush', 'coupon']);
  });

  it('renders static buttons and flags unknown keys', () => {
    const out = renderClaimPlaceholders('<p>a</p><yomi-claim reward="jd-50"></yomi-claim><yomi-claim reward="nope"></yomi-claim>', names, 'Claim');
    expect(out).toContain('<span class="yc-pv">Claim JD card</span>');
    expect(out).toContain('yc-pv--missing');
    expect(out).not.toContain('<yomi-claim');
  });

  it('leaves html without widgets untouched', () => {
    expect(renderClaimPlaceholders('<p>a</p>', names, '领取')).toBe('<p>a</p>');
  });
});

describe('physical registration fields', () => {
  const tee = activityRewardSchema.parse({
    ...codeReward,
    key: 'tee',
    spec: { type: 'physical' },
    codePool: null,
    form: { fields: [{ kind: 'choice', id: 'size', required: true, options: ['s', 'm'] }, { kind: 'text', id: 'note', required: false }] },
  });

  it('parses fields and round-trips them through the draft with options as a list', () => {
    expect(tee.form?.fields[1]).toEqual({ kind: 'text', id: 'note', required: false });
    const draft = rewardToDraft(tee);
    const size = draft.fields[0]!;
    expect(size.options.map((o) => o.value)).toEqual(['s', 'm']);
    size.options.push(newOption(' L '));
    const input = draftToInput(draft);
    expect(input.spec).toEqual({ type: 'physical' });
    // 判别字段 kind 排第一个，文本类不带选项。
    expect(input.form).toEqual({
      fields: [{ kind: 'choice', id: 'size', required: true, options: ['s', 'm', 'l'] }, { kind: 'text', id: 'note', required: false }],
    });
    expect(Object.keys(input.form!.fields[0]!)[0]).toBe('kind');
    // 换成不能登记的类型，表格不提交。
    expect(draftToInput({ ...draft, type: 'code' }).form).toBeNull();
    // 没改 id 就不带改名。
    expect(draftToInput(draft).renames).toBeNull();
  });

  it('checks ids and choice options like the backend', () => {
    const draft = (f: Partial<{ id: string; kind: RegistrationField['kind']; options: string[] }>) =>
      fieldToDraft({ kind: 'choice', id: 'size', required: true, options: ['s', 'm'], ...f } as RegistrationField);
    expect(fieldsProblem([draft({ options: [] })])).toContain('选项');
    expect(fieldsProblem([draft({ options: ['s', ''] })])).toContain('没填值');
    expect(fieldsProblem([draft({ options: ['s', 'S'] })])).toContain('重复');
    expect(fieldsProblem([draft({ id: 'a', kind: 'text' }), draft({ id: 'A', kind: 'text' })])).toContain('重复');
    expect(fieldsProblem([draft({ id: 'size!', kind: 'text' })])).toContain('size!');
    expect(fieldsProblem([draft({}), draft({ id: 'colors', kind: 'multi_choice', options: ['red', 'blue'] })])).toBeNull();
    // 收件人、手机号、地址只是普通的项，非选择类不带选项。
    expect(draftToField(draft({ id: 'address', kind: 'textarea' }))).toEqual({ kind: 'textarea', id: 'address', required: true });
  });

  it('names new fields by kind and starts choices with two options', () => {
    const fields = [newField('phone', [])];
    fields.push(newField('phone', fields), newField('multi_choice', fields));
    expect(fields.map((f) => f.id)).toEqual(['phone', 'phone_2', 'multi']);
    expect(fields[2]!.options.map((o) => o.value)).toEqual(['o1', 'o2']);
    expect(fields[0]!.options).toEqual([]);
  });

  it('collects id renames and carries pack texts along like the backend', () => {
    const draft = rewardToDraft(tee);
    const [size, note] = draft.fields;
    note!.id = 'Remark';
    size!.options[0]!.value = 'small';
    const renames = fieldRenames(draft.fields);
    expect(renames).toEqual({ fields: { note: 'remark' }, options: { size: { s: 'small' } } });
    expect(draftToInput(draft).renames).toEqual(renames);

    const pack = { 'reward.tee.name': 'T 恤', 'reward.tee.field.note': '备注', 'reward.tee.field.size.s': '小号', 'reward.tee.field.size.m': '中号' };
    expect(renameFieldMessages(pack, 'tee', renames)).toEqual({
      'reward.tee.name': 'T 恤',
      'reward.tee.field.remark': '备注',
      'reward.tee.field.size.small': '小号',
      'reward.tee.field.size.m': '中号',
    });
    expect(renameFieldMessages(pack, 'tee', null)).toBe(pack);
  });

  it('needs field labels before publishing and owns field keys only while the field exists', () => {
    expect(rewardRequiredKeys([tee, { ...codeReward, key: 'off', isEnabled: false } as never])).toEqual(['reward.tee.name', 'reward.tee.field.size', 'reward.tee.field.note']);
    expect(rewardOwnsMessage(tee, 'field.size')).toBe(true);
    expect(rewardOwnsMessage(tee, 'field.size.m')).toBe(true);
    expect(rewardOwnsMessage(tee, 'field.size.xl')).toBe(false);
    expect(rewardOwnsMessage(tee, 'field.color')).toBe(false);
    expect(rewardOwnsMessage(tee, 'rule.r1')).toBe(true);
    expect(rewardOwnsMessage(tee, 'rule.r9')).toBe(false);
    expect(rewardOwnsMessage(tee, 'usage')).toBe(true);
  });
});

describe('buildAiPrompt with rewards', () => {
  it('lists rewards with their widget usage and forbids emoji', () => {
    const prompt = buildAiPrompt([], [{ key: 'jd-50', name: '京东 E 卡' }]);
    expect(prompt).toContain('<yomi-claim reward="key"></yomi-claim>');
    expect(prompt).toContain('jd-50：京东 E 卡');
    expect(prompt).toContain('reward.{奖励 key}.name');
    expect(prompt).toContain('不要使用 emoji');
  });
});
