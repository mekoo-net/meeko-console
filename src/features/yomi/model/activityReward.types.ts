import { z } from 'zod';

import { messageKeys, type LocaleMessages } from './activityMessages';

/**
 * 活动奖励与领取记录（后端 Meeko.Yomi `/yomi/api/admin/activities/{id}/rewards`、`…/claims`）。
 * 奖励参数（spec）、领取结果（delivery）按 `type` 多态，资格条件与条件目录按 `kind` 多态，
 * 与后端的类型一一对应。条件目录由后端下发，新增条件只改后端。
 *
 * 奖励只有结构：名称、兑换说明、条件的自定义提示都在活动语言包里（`reward.{key}.*`），随活动保存；
 * 管理端返回的 `name` 只是库里默认语言的名称（没有就是 key）。
 *
 * 提交时多态对象的判别字段（type / kind）必须排第一个：后端 System.Text.Json 只认排在最前的判别字段。
 */

/** 活动能发的奖励；余额只能靠充值获得，活动不发。 */
export const REWARD_TYPES = ['voucher', 'physical', 'code'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export const rewardTypeLabels: Record<RewardType, string> = {
  voucher: '代金券',
  physical: '实物奖励',
  code: '虚拟奖品',
};

export const REWARD_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** 正文里摆放领取按钮的自定义元素，与官网 ACTIVITY_WIDGET_TAG 一致。 */
export const CLAIM_WIDGET_TAG = 'yomi-claim';

export function claimWidgetSnippet(key: string): string {
  return `<${CLAIM_WIDGET_TAG} reward="${key}"></${CLAIM_WIDGET_TAG}>`;
}

const nullableString = z.string().nullish().transform((v) => v ?? null);
const nullableNumber = z.number().nullish().transform((v) => v ?? null);

// ---------------- 条件目录（kind 多态） ----------------

const factOptionSchema = z.object({ value: z.string(), label: z.string() });
export type FactOption = z.infer<typeof factOptionSchema>;

const FACT_GROUPS = ['account', 'billing', 'yomi', 'activity'] as const;

export const factGroupLabels: Record<(typeof FACT_GROUPS)[number], string> = {
  account: '账户',
  billing: '充值',
  yomi: 'Yomi 消费',
  activity: '本活动',
};

const factBase = {
  key: z.string(),
  group: z.enum(FACT_GROUPS).catch('account'),
  label: z.string(),
  ops: z.array(factOptionSchema),
};

/** 文案已按请求的语言取好（管理台固定要中文）。 */
export const factDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), ...factBase, unit: nullableString }),
  z.object({ kind: z.literal('choice'), ...factBase, options: z.array(factOptionSchema) }),
  z.object({ kind: z.literal('tag'), ...factBase, source: z.enum(['achievement', 'reward']) }),
  z.object({ kind: z.literal('id_list'), ...factBase }),
]);
export type FactDescriptor = z.infer<typeof factDescriptorSchema>;
export type FactKind = FactDescriptor['kind'];

export const rewardFactsSchema = z.object({
  facts: z.array(factDescriptorSchema),
  codeKeyConfigured: z.boolean(),
});
export type RewardFacts = z.infer<typeof rewardFactsSchema>;

// ---------------- 资格条件（kind 多态） ----------------

/** id 在奖励内唯一，自定义提示挂在语言包的 `reward.{key}.rule.{id}`。后端保存时会补齐缺的 id。 */
const ruleBase = { id: z.string().nullish().transform((v) => v ?? ''), fact: z.string() };

const ruleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), ...ruleBase, op: z.enum(['gte', 'gt', 'lte', 'lt', 'eq', 'neq']), value: z.number() }),
  z.object({ kind: z.literal('choice'), ...ruleBase, op: z.enum(['eq', 'neq']), value: z.string() }),
  z.object({ kind: z.literal('tag'), ...ruleBase, op: z.enum(['has', 'not_has']), value: z.string() }),
  z.object({ kind: z.literal('id_list'), ...ruleBase, op: z.enum(['in', 'not_in']), value: z.array(z.coerce.string()) }),
]);
export type RewardRule = z.infer<typeof ruleSchema>;

const ruleSetSchema = z.object({
  match: z.enum(['all', 'any']).catch('all'),
  rules: z.array(ruleSchema).default([]),
});
export type RewardRuleSet = z.infer<typeof ruleSetSchema>;

/** 编辑中的条件：名单在输入框里是一段文本，提交时再拆成数组；其余与线上一致。 */
export type RuleDraft =
  | Exclude<RewardRule, { kind: 'id_list' }>
  | (Omit<Extract<RewardRule, { kind: 'id_list' }>, 'value'> & { value: string });

export interface RuleSetDraft {
  match: RewardRuleSet['match'];
  rules: RuleDraft[];
}

// ---------------- 代金券模板（Billing 维护，这里只读） ----------------

export const voucherTemplateSchema = z.object({
  id: z.coerce.string(),
  name: z.string(),
  deductKind: z.enum(['no_threshold', 'full_reduction', 'discount']).catch('no_threshold'),
  faceValue: z.number(),
  thresholdAmount: z.number().default(0),
  discountRate: nullableNumber,
  validityKind: z.enum(['absolute', 'relative_days']).catch('relative_days'),
  validFromUtc: nullableNumber,
  validToUtc: nullableNumber,
  validDays: nullableNumber,
  totalQuota: nullableNumber,
  issuedCount: z.number().int().default(0),
  perUserLimit: nullableNumber,
  status: z.enum(['draft', 'active', 'paused', 'archived']).catch('active'),
  allProducts: z.boolean().default(true),
  scopeProductCodes: z.array(z.string()).default([]),
});
export type VoucherTemplate = z.infer<typeof voucherTemplateSchema>;

export const voucherTemplateStatusLabels: Record<VoucherTemplate['status'], string> = {
  draft: '草稿',
  active: '上架中',
  paused: '已暂停',
  archived: '已归档',
};

function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** 一句话说明一张券：「无门槛 20 元 · 领取后 30 天有效 · 剩 80 张」。 */
export function describeVoucherTemplate(t: VoucherTemplate): string {
  const kind = t.deductKind === 'no_threshold'
    ? `无门槛 ${money(t.faceValue)} 元`
    : t.deductKind === 'full_reduction'
      ? `满 ${money(t.thresholdAmount)} 减 ${money(t.faceValue)}`
      : `${money((t.discountRate ?? 1) * 10)} 折（最多抵 ${money(t.faceValue)} 元）`;
  const validity = t.validityKind === 'relative_days'
    ? `领取后 ${t.validDays ?? '?'} 天有效`
    : `有效至 ${t.validToUtc ? new Date(t.validToUtc).toLocaleDateString() : '?'}`;
  const stock = t.totalQuota === null ? '' : ` · 剩 ${Math.max(0, t.totalQuota - t.issuedCount)} 张`;
  return `${kind} · ${validity}${stock}`;
}

// ---------------- 实物奖励的登记表格 ----------------

export const FIELD_KINDS = ['text', 'textarea', 'phone', 'choice', 'multi_choice'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const fieldKindLabels: Record<FieldKind, string> = {
  text: '单行文本',
  textarea: '多行文本',
  phone: '手机号',
  choice: '单选',
  multi_choice: '多选',
};

/** 单选、多选要给选项。 */
export const hasOptions = (kind: FieldKind): boolean => kind === 'choice' || kind === 'multi_choice';

export const FIELD_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,31}$/;
export const FIELD_OPTION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const MAX_FIELDS = 20;
export const MAX_OPTIONS = 20;

/**
 * 登记表格的一项，按 kind 切换：文本类只有 id / 必填，选择类再带选项。与后端 ActivityFormField 的实体一一对应，
 * 收件人、地址也是运营自己加的项；名称和选项文字在语言包的 `reward.{key}.field.{id}[.{选项}]`。
 */
const textFieldSchema = z.object({
  kind: z.enum(['text', 'textarea', 'phone']),
  id: z.string(),
  required: z.boolean().default(false),
});
const choiceFieldSchema = z.object({
  kind: z.enum(['choice', 'multi_choice']),
  id: z.string(),
  required: z.boolean().default(false),
  options: z.array(z.string()).nullish().transform((v) => v ?? []),
});
const registrationFieldSchema = z.union([textFieldSchema, choiceFieldSchema]);
export type RegistrationField = z.infer<typeof registrationFieldSchema>;

/** 登记表格，库里 activity_rewards.form 与线上是同一份 JSON；null 表示不用登记。 */
export const registrationFormSchema = z.object({ fields: z.array(registrationFieldSchema) });
export type RegistrationForm = z.infer<typeof registrationFormSchema>;

/** 与后端 ActivityRewardSpec.AcceptsForm 一致：只有实物奖励能让用户登记。 */
export const acceptsForm = (type: RewardType): boolean => type === 'physical';

/**
 * 编辑中的登记项与选项。saved* 是存库时的 id：运营改了 id，保存时语言包里已写的文字跟着搬（见 fieldRenames）。
 * uid 只在页面里用，给列表当 key，改 id、调顺序时卡片不会重建。
 */
export interface OptionDraft {
  uid: number;
  value: string;
  savedValue: string | null;
}

export interface FieldDraft {
  uid: number;
  id: string;
  kind: FieldKind;
  required: boolean;
  options: OptionDraft[];
  savedId: string | null;
}

let draftSeq = 0;
const nextUid = (): number => ++draftSeq;
const normalizeId = (s: string): string => s.trim().toLowerCase();

export function newOption(value: string): OptionDraft {
  return { uid: nextUid(), value, savedValue: null };
}

/** 下一个没用过的选项值：o1、o2… */
export function nextOptionValue(options: readonly OptionDraft[]): string {
  const taken = new Set(options.map((o) => normalizeId(o.value)));
  let n = options.length + 1;
  while (taken.has(`o${n}`)) n++;
  return `o${n}`;
}

/** 新加一项：id 按类型起一个没用过的（phone、phone_2…），选择类先给两个选项。 */
export function newField(kind: FieldKind, fields: readonly FieldDraft[]): FieldDraft {
  const taken = new Set(fields.map((f) => normalizeId(f.id)));
  const base = kind === 'multi_choice' ? 'multi' : kind;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return { uid: nextUid(), id, kind, required: true, options: hasOptions(kind) ? [newOption('o1'), newOption('o2')] : [], savedId: null };
}

export function fieldToDraft(f: RegistrationField): FieldDraft {
  return {
    uid: nextUid(),
    id: f.id,
    kind: f.kind,
    required: f.required,
    options: ('options' in f ? f.options : []).map((value) => ({ uid: nextUid(), value, savedValue: value })),
    savedId: f.id,
  };
}

/** 判别字段放第一个，后端按它切换实体。 */
export function draftToField(d: FieldDraft): RegistrationField {
  const base = { id: normalizeId(d.id), required: d.required };
  return d.kind === 'choice' || d.kind === 'multi_choice'
    ? { kind: d.kind, ...base, options: d.options.map((o) => normalizeId(o.value)) }
    : { kind: d.kind, ...base };
}

/** 登记表格的第一个问题，与后端 ActivityRegistrationField 的规则一致。 */
export function fieldsProblem(fields: readonly FieldDraft[]): string | null {
  if (fields.length > MAX_FIELDS) return `登记项最多 ${MAX_FIELDS} 个`;
  const ids = new Set<string>();
  for (const d of fields) {
    const id = normalizeId(d.id);
    if (!FIELD_ID_PATTERN.test(id)) return `登记项 id「${d.id}」只能用小写字母、数字和 _，以字母或数字开头`;
    if (ids.has(id)) return `登记项 id「${id}」重复了`;
    ids.add(id);
    if (!hasOptions(d.kind)) continue;
    const options = d.options.map((o) => normalizeId(o.value));
    if (!options.length || options.length > MAX_OPTIONS) return `登记项「${id}」要有 1~${MAX_OPTIONS} 个选项`;
    if (options.some((o) => !o)) return `登记项「${id}」有选项没填值`;
    const bad = options.find((o) => !FIELD_OPTION_PATTERN.test(o));
    if (bad) return `登记项「${id}」的选项「${bad}」只能用小写字母、数字、_ 和 -`;
    if (new Set(options).size !== options.length) return `登记项「${id}」有重复的选项`;
  }
  return null;
}

/** 与后端 ActivityFieldRenames 一致：改了 id 的登记项（旧 → 新）；选项按改名后的登记项 id 归组。 */
export interface FieldRenames {
  fields: Record<string, string>;
  options: Record<string, Record<string, string>>;
}

/** 草稿里改过 id 的登记项和选项；没改返回 null。 */
export function fieldRenames(fields: readonly FieldDraft[]): FieldRenames | null {
  const out: FieldRenames = { fields: {}, options: {} };
  for (const d of fields) {
    const id = normalizeId(d.id);
    if (d.savedId && d.savedId !== id) out.fields[d.savedId] = id;
    if (!hasOptions(d.kind)) continue;
    for (const o of d.options) {
      const value = normalizeId(o.value);
      if (o.savedValue && o.savedValue !== value) (out.options[id] ??= {})[o.savedValue] = value;
    }
  }
  return Object.keys(out.fields).length || Object.keys(out.options).length ? out : null;
}

/** 按改名把语言包里登记项、选项的文字搬到新 key 下，与后端 ActivityLocaleBundle.RenameRewardFields 一致。 */
export function renameFieldMessages(m: LocaleMessages, reward: string, renames: FieldRenames | null | undefined): LocaleMessages {
  if (!renames) return m;
  const prefix = `${messageKeys.rewardPrefix(reward)}field.`;
  const kept: LocaleMessages = {};
  const moved: LocaleMessages = {};
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith(prefix)) {
      kept[k] = v;
      continue;
    }
    const path = k.slice(prefix.length);
    const [field = '', option] = path.split('.');
    const newField = renames.fields[field] ?? field;
    const newOption = option === undefined ? undefined : renames.options[newField]?.[option] ?? option;
    const target = newOption === undefined ? newField : `${newField}.${newOption}`;
    (target === path ? kept : moved)[prefix + target] = v;
  }
  return { ...kept, ...moved };
}

// ---------------- 奖励参数（type 多态） ----------------

const codePoolSchema = z.object({ available: z.number().int(), assigned: z.number().int() });

/** 奖励参数，按 type 切换，与后端 ActivityRewardSpec 的实体一一对应；提交和返回是同一个形状。 */
const rewardSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('voucher'), templateId: z.coerce.string() }),
  z.object({ type: z.literal('code') }),
  z.object({ type: z.literal('physical') }),
]);
export type RewardSpec = z.infer<typeof rewardSpecSchema>;

export const activityRewardSchema = z.object({
  id: z.coerce.string(),
  activityId: z.coerce.string(),
  key: z.string(),
  /** 默认语言的名称（没填时是 key），只读 */
  name: z.string(),
  spec: rewardSpecSchema,
  form: registrationFormSchema.nullish().transform((v) => v ?? null),
  rules: ruleSetSchema,
  /** 代金券用的模板在 Billing 里的现状（只读） */
  voucherTemplate: voucherTemplateSchema.nullish().transform((v) => v ?? null),
  /** 虚拟奖品的卡密池余量（只读） */
  codePool: codePoolSchema.nullish().transform((v) => v ?? null),
  totalQuota: nullableNumber,
  perUserLimit: z.number().int(),
  claimedCount: z.number().int(),
  remaining: nullableNumber,
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAtUtc: z.number(),
  updatedAtUtc: z.number(),
  updatedBy: z.coerce.string().nullish().transform((v) => v ?? null),
});
export type ActivityReward = z.infer<typeof activityRewardSchema>;

export interface RewardInput {
  key: string;
  spec: RewardSpec;
  form: RegistrationForm | null;
  rules: RewardRuleSet;
  totalQuota: number | null;
  perUserLimit: number;
  isEnabled: boolean;
  sortOrder: number;
  /** 实物奖励改了 id 的登记项与选项，后端据此搬语言包里的文字 */
  renames?: FieldRenames | null;
}

/**
 * 编辑中的奖励。每种类型的参数各存一份草稿，切换类型不会丢掉另一种已填的内容，
 * 提交时只取当前类型那一份。
 */
export interface RewardDraft {
  key: string;
  type: RewardType;
  specs: {
    voucher: { templateId: string };
  };
  /** 登记表格，只有 acceptsForm 的类型提交 */
  fields: FieldDraft[];
  rules: RuleSetDraft;
  totalQuota: number | null;
  perUserLimit: number;
  isEnabled: boolean;
  sortOrder: number;
}

export const codeImportResultSchema = z.object({
  imported: z.number().int(),
  duplicates: z.number().int(),
  invalid: z.number().int(),
  available: z.number().int(),
});
export type CodeImportResult = z.infer<typeof codeImportResultSchema>;

export function emptyRewardDraft(): RewardDraft {
  return {
    key: '',
    type: 'voucher',
    specs: { voucher: { templateId: '' } },
    fields: [],
    rules: { match: 'all', rules: [] },
    totalQuota: null,
    perUserLimit: 1,
    isEnabled: true,
    sortOrder: 0,
  };
}

export function rewardToDraft(r: ActivityReward): RewardDraft {
  const draft = emptyRewardDraft();
  const s = r.spec;
  if (s.type === 'voucher') draft.specs.voucher = { templateId: s.templateId };
  const rules = r.rules.rules.map(ruleToDraft);
  // 老数据可能没有 id，先补上，自定义提示才有地方挂。
  for (const rule of rules) if (!rule.id) rule.id = nextRuleId(rules);
  return {
    ...draft,
    key: r.key,
    type: s.type,
    fields: (r.form?.fields ?? []).map(fieldToDraft),
    rules: { match: r.rules.match, rules },
    totalQuota: r.totalQuota,
    perUserLimit: r.perUserLimit,
    isEnabled: r.isEnabled,
    sortOrder: r.sortOrder,
  };
}

/** 判别字段放第一个（见文件头注释）。 */
export function draftToSpec(d: RewardDraft): RewardSpec {
  return d.type === 'voucher' ? { type: 'voucher', templateId: d.specs.voucher.templateId } : { type: d.type };
}

export function draftToInput(d: RewardDraft): RewardInput {
  return {
    key: d.key.trim().toLowerCase(),
    spec: draftToSpec(d),
    form: acceptsForm(d.type) && d.fields.length ? { fields: d.fields.map(draftToField) } : null,
    rules: { match: d.rules.match, rules: d.rules.rules.map(draftToRule) },
    totalQuota: d.totalQuota,
    perUserLimit: d.perUserLimit,
    isEnabled: d.isEnabled,
    sortOrder: d.sortOrder,
    renames: acceptsForm(d.type) ? fieldRenames(d.fields) : null,
  };
}

export function ruleToDraft(r: RewardRule): RuleDraft {
  return r.kind === 'id_list' ? { ...r, value: r.value.join('\n') } : { ...r };
}

export function draftToRule(d: RuleDraft): RewardRule {
  switch (d.kind) {
    case 'number':
      return { kind: 'number', id: d.id, fact: d.fact, op: d.op, value: d.value };
    case 'choice':
      return { kind: 'choice', id: d.id, fact: d.fact, op: d.op, value: d.value };
    case 'tag':
      return { kind: 'tag', id: d.id, fact: d.fact, op: d.op, value: d.value };
    case 'id_list':
      return { kind: 'id_list', id: d.id, fact: d.fact, op: d.op, value: parseIdList(d.value) };
  }
}

/** 下一个没用过的 rN，与后端补 id 的规则一致。 */
export function nextRuleId(rules: readonly { id: string }[]): string {
  const taken = new Set(rules.map((r) => r.id));
  for (let i = 1; ; i++) if (!taken.has(`r${i}`)) return `r${i}`;
}

/** 选了一个条件项后，按它的形态给一条初始条件。 */
export function defaultRuleFor(d: FactDescriptor, id: string): RuleDraft {
  switch (d.kind) {
    case 'number':
      return { kind: 'number', id, fact: d.key, op: 'gte', value: 0 };
    case 'choice':
      return { kind: 'choice', id, fact: d.key, op: 'eq', value: d.options[0]?.value ?? '' };
    case 'tag':
      return { kind: 'tag', id, fact: d.key, op: 'has', value: '' };
    case 'id_list':
      return { kind: 'id_list', id, fact: d.key, op: 'in', value: '' };
  }
}

// ---------------- 奖励名下的语言包 key ----------------

/** 启用的奖励上架前默认语言必须有的文案：名称，有登记表格的再加每个登记项的名称。与后端 ActivityReward.RequiredMessages 一致。 */
export function rewardRequiredKeys(rewards: readonly Pick<ActivityReward, 'key' | 'isEnabled' | 'form'>[]): string[] {
  return rewards.filter((r) => r.isEnabled).flatMap((r) => [
    messageKeys.rewardName(r.key),
    ...(r.form?.fields ?? []).map((f) => messageKeys.registrationField(r.key, f.id)),
  ]);
}

/**
 * 语言包里 `reward.{key}.{field}` 这条还用不用得上，与后端 ActivityReward.OwnsMessage 一致：
 * 名称、兑换说明一直留着；条件提示、登记项、选项的文字在对应的东西删掉后就没用了。
 */
export function rewardOwnsMessage(reward: Pick<ActivityReward, 'form' | 'rules'>, field: string): boolean {
  const [head, id, option, ...rest] = field.split('.');
  if (rest.length) return false;
  if (head === 'rule') return option === undefined && reward.rules.rules.some((r) => r.id === id);
  if (head === 'field') {
    const f = reward.form?.fields.find((x) => x.id === id);
    return !!f && (option === undefined || ('options' in f && f.options.includes(option)));
  }
  return true;
}

/** 列表里给运营看的一句话条件，如「注册天数 ≥ 7 天」。 */
export function describeRule(rule: RewardRule | RuleDraft, facts: readonly FactDescriptor[], rewardNames: ReadonlyMap<string, string>): string {
  const d = facts.find((f) => f.key === rule.fact);
  if (!d) return `未知条件 ${rule.fact}`;
  const op = d.ops.find((o) => o.value === rule.op)?.label ?? rule.op;
  if (rule.kind === 'number' && d.kind === 'number') return `${d.label} ${op} ${rule.value}${d.unit ? ` ${d.unit}` : ''}`;
  if (rule.kind === 'choice' && d.kind === 'choice') return `${d.label}${op}${d.options.find((o) => o.value === rule.value)?.label ?? rule.value}`;
  if (rule.kind === 'tag' && d.kind === 'tag') {
    return d.source === 'reward' ? `${op}「${rewardNames.get(rule.value) ?? rule.value}」` : `${op}${d.label}「${rule.value}」`;
  }
  if (rule.kind === 'id_list') return `${op}（${parseIdList(rule.value).length} 个账户）`;
  return `${d.label}（条件形态不符）`;
}

export function describeRules(rules: RewardRuleSet | RuleSetDraft, facts: readonly FactDescriptor[], rewardNames: ReadonlyMap<string, string>): string {
  if (!rules.rules.length) return '所有登录用户';
  const parts = rules.rules.map((r) => describeRule(r, facts, rewardNames));
  return parts.join(rules.match === 'any' ? ' 或 ' : '，且 ');
}

/** 名单：数组原样，文本按逗号 / 空白拆开。 */
export function parseIdList(value: string | readonly string[]): string[] {
  if (Array.isArray(value)) return value.map(String);
  return (value as string).split(/[\s,，;]+/).filter(Boolean);
}

// ---------------- 预览里的领取按钮 ----------------

const WIDGET = /<yomi-claim\b([^>]*?)(?:\/>|>([\s\S]*?)<\/yomi-claim\s*>)/gi;
const REWARD_ATTR = /\breward\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

function widgetKey(attrs: string): string {
  const m = attrs.match(REWARD_ATTR);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim().toLowerCase();
}

/** 正文里摆放了按钮的奖励 key。 */
export function placedRewardKeys(html: string): Set<string> {
  const keys = new Set<string>();
  for (const m of html.matchAll(WIDGET)) {
    const key = widgetKey(m[1] ?? '');
    if (key) keys.add(key);
  }
  return keys;
}

const PREVIEW_BUTTON_CSS
  = '.yc-pv{display:inline-flex;align-items:center;gap:6px;padding:10px 22px;border-radius:999px;'
  + 'background:var(--activity-button,linear-gradient(135deg,#9b7bd8,#f4a8c0));color:#fff;font-size:14px;font-weight:600;line-height:1.2;'
  + 'box-shadow:0 10px 24px -14px var(--activity-orb,rgba(155,123,216,.9))}'
  + '.yc-pv--missing{background:#fff;color:#d03050;border:1px dashed #d03050;box-shadow:none}';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * 预览沙箱里不跑脚本，官网的领取按钮组件出不来；这里把占位元素换成样子相近的静态按钮，
 * 写错 key 的标红，免得上线后才发现按钮不见了。names 是 key → 当前预览语言的奖励名。
 */
export function renderClaimPlaceholders(html: string, names: ReadonlyMap<string, string>, claimLabel: string): string {
  if (!html.toLowerCase().includes(`<${CLAIM_WIDGET_TAG}`)) return html;
  const replaced = html.replace(WIDGET, (_whole, attrs: string) => {
    const key = widgetKey(attrs ?? '');
    const name = names.get(key);
    if (name === undefined) return `<span class="yc-pv yc-pv--missing">没有 key 为「${escapeHtml(key)}」的奖励</span>`;
    return `<span class="yc-pv">${escapeHtml(claimLabel)} ${escapeHtml(name)}</span>`;
  });
  return `<style>${PREVIEW_BUTTON_CSS}</style>${replaced}`;
}

// ---------------- 领取记录（delivery 按 type 多态） ----------------

export const CLAIM_STATUSES = ['pending', 'granted', 'awaiting_shipment', 'shipped', 'failed'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const claimStatusLabels: Record<ClaimStatus, string> = {
  pending: '发放中',
  granted: '已发放',
  awaiting_shipment: '待发货',
  shipped: '已发货',
  failed: '发放失败',
};

export const claimStatusTagType: Record<ClaimStatus, 'success' | 'primary' | 'warning' | 'info' | 'danger'> = {
  pending: 'warning',
  granted: 'success',
  awaiting_shipment: 'primary',
  shipped: 'success',
  failed: 'danger',
};

export const SHIPPING_COMPANIES = ['顺丰', '京东物流', '中通', '圆通', '韵达', '申通', 'EMS'] as const;

const shipmentSchema = z.object({ company: z.string(), trackingNo: z.string(), shippedAtUtc: z.number() });

/** 发放结果，按 type 切换，与后端 ActivityClaimDelivery 的实体一一对应。 */
const deliverySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('voucher'), templateId: z.coerce.string(), userVoucherId: z.coerce.string().nullish().transform((v) => v ?? null) }),
  z.object({ type: z.literal('code'), hint: nullableString }),
  z.object({ type: z.literal('physical'), shipment: shipmentSchema.nullish().transform((v) => v ?? null) }),
]);
export type ClaimDelivery = z.infer<typeof deliverySchema>;

/** 用户按登记表格填的内容：登记项 id → 文本、选项值，多选是选项值数组 */
export const claimAnswersSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
export type ClaimAnswers = z.infer<typeof claimAnswersSchema>;

export const activityClaimSchema = z.object({
  id: z.coerce.string(),
  rewardId: z.coerce.string(),
  rewardKey: z.string(),
  /** 默认语言的奖励名 */
  rewardName: z.string(),
  accountUid: z.coerce.string(),
  seq: z.number().int(),
  status: z.enum(CLAIM_STATUSES),
  delivery: deliverySchema,
  /** 奖励没有登记表格时为 null */
  answers: claimAnswersSchema.nullish().transform((v) => v ?? null),
  failureReason: nullableString,
  canRetry: z.boolean(),
  createdAtUtc: z.number(),
  updatedAtUtc: z.number(),
});
export type ActivityClaim = z.infer<typeof activityClaimSchema>;

export const claimListSchema = z.object({
  items: z.array(activityClaimSchema),
  total: z.number().int(),
});
export type ClaimListResult = z.infer<typeof claimListSchema>;

export interface ClaimListQuery {
  page: number;
  pageSize: number;
  rewardId: string | null;
  status: ClaimStatus | null;
  accountUid: string | null;
  /** 领取时间，Unix 毫秒 */
  fromUtc: number | null;
  toUtc: number | null;
}
