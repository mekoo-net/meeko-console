import type {
  FilterChannel,
  FilterClassifier,
  FilterDoc,
  FilterProblem,
  FilterRule,
  FilterVendor,
} from './filter.types';

/**
 * 过滤器的纯逻辑，页面只管摆。两样东西，像防火墙：
 * - 分类器：什么样的请求算哪一类（文件前半）；
 * - 过滤器：一个 Vendor 一张规则表，条件 → 放行 / 拒绝（文件后半）。
 * 中间是两者共用的条件：表单编得出来的形状、和文档里的写法互相转换、说成人话。
 *
 * 两条规矩贯穿这里：
 * - **顺序是规则的一部分**。过滤规则从上往下，第一条成立的说了算；分类器的先后决定一个请求「是哪一类」。
 * - **不认识的东西照搬**。改一项只动表单管的那几个键，文档里别的键原样留着。
 */

/** 分类器的 id：`类别.名称`，小写字母、数字、下划线，至少两级。和网关的校验是同一条。 */
export const CLASSIFIER_ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

/** 过滤规则的 id：会进错误码，只用小写字母、数字、下划线、横线和点。`default` 留给「都没匹配上」。 */
export const RULE_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;
export const RESERVED_RULE_ID = 'default';

/** vendor 名不分大小写（网关也不分）。 */
const sameVendor = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** 只取表单管的那几个键以外的，改一项时原样留下。 */
function untouched(item: Record<string, unknown>, formKeys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !formKeys.includes(key)));
}

function move<T>(items: readonly T[], index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return null;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

// ---------- 分类器 ----------

export const classifiersOf = (doc: FilterDoc): FilterClassifier[] => doc.classifiers ?? [];

const CLASSIFIER_FORM_KEYS = ['id', 'name', 'when'];

/** 写进一个分类器。`originalId` 给了就是改那一个（位置不动，表单不管的键照留），没给就加在最后。 */
export function upsertClassifier(doc: FilterDoc, classifier: FilterClassifier, originalId?: string): FilterDoc {
  const list = classifiersOf(doc);
  if (originalId === undefined) return { ...doc, classifiers: [...list, classifier] };
  return {
    ...doc,
    classifiers: list.map((c) => (c.id === originalId ? { ...classifier, ...untouched(c, CLASSIFIER_FORM_KEYS) } : c)),
  };
}

export function removeClassifier(doc: FilterDoc, id: string): FilterDoc {
  return { ...doc, classifiers: classifiersOf(doc).filter((c) => c.id !== id) };
}

export function moveClassifier(doc: FilterDoc, id: string, direction: -1 | 1): FilterDoc {
  const list = classifiersOf(doc);
  const next = move(list, list.findIndex((c) => c.id === id), direction);
  return next ? { ...doc, classifiers: next } : doc;
}

export interface ClassifierUse {
  vendor: string;
  ruleId: string;
}

/** 哪些过滤规则引用了这个分类器。删它之前得先改掉这些规则，否则那几个 Vendor 的过滤器网关读不懂。 */
export function classifierUses(doc: FilterDoc, id: string): ClassifierUse[] {
  const uses: ClassifierUse[] = [];
  for (const [vendor, channel] of Object.entries(doc.filters ?? {})) {
    for (const rule of channel.rules ?? []) {
      if (referencedClassifiers(rule.when).includes(id)) uses.push({ vendor, ruleId: rule.id });
    }
  }
  return uses;
}

// ---------- 条件 ----------

/** 条件里的一行：引用分类器，或者比一个请求头。 */
export type ConditionRow =
  | {
      kind: 'classifier';
      /** 取反：这一行不成立才算。 */
      negate: boolean;
      /** 引用哪几个分类器，任一成立就算。 */
      classifiers: string[];
    }
  | {
      kind: 'field';
      negate: boolean;
      field: string;
      op: string;
      /** 比的值。`exists` 没有值；别的可以有多个，命中任一个就算。 */
      values: string[];
      ignoreCase: boolean;
    };

/** 表单编得出来的条件：一组行，全部成立或者任一成立。 */
export interface FlatCondition {
  mode: 'all' | 'any';
  rows: ConditionRow[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const keysOf = (v: Record<string, unknown>): string[] => Object.keys(v).sort();

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function readPlainRow(node: unknown): ConditionRow | null {
  if (!isObject(node)) return null;

  if (keysOf(node).join() === 'classifier') {
    const value = node.classifier;
    if (typeof value === 'string') return { kind: 'classifier', negate: false, classifiers: [value] };
    if (isStringList(value) && value.length > 0) return { kind: 'classifier', negate: false, classifiers: [...value] };
    return null;
  }

  if (typeof node.field !== 'string' || typeof node.op !== 'string') return null;
  if (keysOf(node).some((k) => !['field', 'op', 'value', 'ignoreCase'].includes(k))) return null;

  let values: string[];
  if (node.value === undefined) values = [];
  else if (typeof node.value === 'string') values = [node.value];
  else if (isStringList(node.value)) values = [...node.value];
  else return null;

  if (node.ignoreCase !== undefined && typeof node.ignoreCase !== 'boolean') return null;
  return { kind: 'field', negate: false, field: node.field, op: node.op, values, ignoreCase: node.ignoreCase === true };
}

function readRow(node: unknown): ConditionRow | null {
  if (isObject(node) && keysOf(node).join() === 'not') {
    const inner = readPlainRow(node.not);
    return inner ? { ...inner, negate: true } : null;
  }
  return readPlainRow(node);
}

/**
 * 把条件树读成表单编得出来的样子；读不成（套了好几层的、写法这一页不认识的）回 null，页面改用 JSON 编辑。
 * 读得成的保证 `buildCondition` 写回去意思不变。
 */
export function flattenCondition(when: unknown): FlatCondition | null {
  if (isObject(when)) {
    for (const mode of ['all', 'any'] as const) {
      if (keysOf(when).join() !== mode) continue;
      const list = when[mode];
      if (!Array.isArray(list) || list.length === 0) return null;
      const rows = list.map(readRow);
      return rows.every((r) => r !== null) ? { mode, rows } : null;
    }
  }
  const single = readRow(when);
  return single ? { mode: 'all', rows: [single] } : null;
}

/** `exists` 不比值，别的都要。 */
export const opNeedsValue = (op: string): boolean => op !== 'exists';

/** 正则只写一个模式；别的可以给好几个值，命中任一个就算。 */
export const opTakesMany = (op: string): boolean => op !== 'regex' && op !== 'exists';

function writeRow(row: ConditionRow): Record<string, unknown> {
  let node: Record<string, unknown>;
  if (row.kind === 'classifier') {
    node = { classifier: row.classifiers.length === 1 ? row.classifiers[0] : [...row.classifiers] };
  } else {
    node = { field: row.field, op: row.op };
    if (opNeedsValue(row.op)) node.value = row.values.length === 1 ? row.values[0] : [...row.values];
    if (row.ignoreCase && opNeedsValue(row.op)) node.ignoreCase = true;
  }
  return row.negate ? { not: node } : node;
}

/** 表单 → 条件树。只有一行时不套 `all`。 */
export function buildCondition(flat: FlatCondition): Record<string, unknown> {
  const rows = flat.rows.map(writeRow);
  return rows.length === 1 ? rows[0]! : { [flat.mode]: rows };
}

/** 表单里的条件哪里还没填好；null = 可以存了（剩下的交给号池后台用网关的编译器查）。 */
export function flatConditionError(flat: FlatCondition): string | null {
  if (flat.rows.length === 0) return '至少要有一个条件';
  for (const [i, row] of flat.rows.entries()) {
    const which = flat.rows.length > 1 ? `第 ${i + 1} 个条件` : '条件';
    if (row.kind === 'classifier') {
      if (row.classifiers.length === 0) return `${which}没选分类器`;
      continue;
    }
    if (!row.field) return `${which}没选字段`;
    if (!row.op) return `${which}没选比法`;
    if (opNeedsValue(row.op) && row.values.every((v) => v === '')) return `${which}没填值`;
  }
  return null;
}

/** 条件树里引用了哪些分类器（不管套了几层）。 */
export function referencedClassifiers(when: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) {
      if (typeof node.classifier === 'string') found.add(node.classifier);
      else if (isStringList(node.classifier)) node.classifier.forEach((c) => found.add(c));
      for (const [key, value] of Object.entries(node)) if (key !== 'classifier') walk(value);
    }
  };
  walk(when);
  return [...found];
}

// ---------- 说成人话 ----------

const HEADER_PREFIX = 'header.';
const SOURCE_HEADER = 'header';

/** 字段在页面上叫什么：请求头就是头名本身（`user-agent`），系统提示词叫「系统提示词」；网关以后多报的字段这里还不认识，原样显示。 */
export function fieldLabel(name: string): string {
  if (name.startsWith(HEADER_PREFIX)) return name.slice(HEADER_PREFIX.length);
  if (name === 'system') return '系统提示词';
  return name;
}

/** 条件从哪儿取值：请求头（再选是哪个头），或者某个单独的字段（系统提示词……）。 */
export interface ConditionSource {
  key: string;
  label: string;
}

/** 一个字段属于哪个来源：所有请求头算一个来源，其余字段各自一个。 */
export const sourceOf = (field: string): string => (field.startsWith(HEADER_PREFIX) ? SOURCE_HEADER : field);

/** 网关报的字段整理成来源，按第一次出现的顺序。 */
export function conditionSources(fields: readonly { name: string }[]): ConditionSource[] {
  const sources: ConditionSource[] = [];
  for (const f of fields) {
    const key = sourceOf(f.name);
    if (sources.some((s) => s.key === key)) continue;
    sources.push({ key, label: key === SOURCE_HEADER ? '请求头' : fieldLabel(f.name) });
  }
  return sources;
}

const OP_LABELS: Record<string, string> = {
  eq: '等于',
  in: '是其中之一',
  prefix: '开头是',
  contains: '包含',
  regex: '匹配正则',
  exists: '有值',
};

export const opLabel = (op: string): string => OP_LABELS[op] ?? op;

function describeRow(row: ConditionRow): string {
  if (row.kind === 'classifier') {
    const text = `分类器是 ${row.classifiers.join(' 或 ')}`;
    return row.negate ? `分类器不是 ${row.classifiers.join(' 也不是 ')}` : text;
  }
  const field = fieldLabel(row.field);
  if (row.op === 'exists') return row.negate ? `${field} 没有值` : `${field} 有值`;

  const values = row.values.map((v) => `"${v}"`).join(' 或 ');
  const text = `${field} ${opLabel(row.op)} ${values}${row.ignoreCase ? '（不分大小写）' : ''}`;
  return row.negate ? `不满足：${text}` : text;
}

/** 列表里那一格：这个条件说的是什么。表单读不成的条件只说它是手写的。 */
export function describeCondition(when: unknown): string {
  const flat = flattenCondition(when);
  if (!flat) return '自定义条件（JSON）';
  return flat.rows.map(describeRow).join(flat.mode === 'all' ? ' 且 ' : ' 或 ');
}

// ---------- 过滤器 ----------

export type FilterAction = 'allow' | 'deny';

export const actionOf = (rule: FilterRule): FilterAction => (rule.action === 'deny' ? 'deny' : 'allow');

export const isEnabled = (rule: FilterRule): boolean => rule.enabled !== false;

/** 文档里这个 Vendor 的那个键（键不分大小写，文档里写成什么样就认什么样）。 */
function channelKeyOf(doc: FilterDoc, vendor: string): string | undefined {
  return Object.keys(doc.filters ?? {}).find((k) => sameVendor(k, vendor));
}

export interface ChannelView {
  vendor: string;
  /** 文档里写成的那个键（大小写可能和 vendor 不同）；没有过滤器时就是 vendor。 */
  key: string;
  /** 有没有这个 Vendor 的过滤器。没有 = 什么都收。 */
  exists: boolean;
  defaultAction: FilterAction;
  /** true = 判了拒绝的请求真的被拒；false = 只标记。文档里不写算 true。 */
  enforce: boolean;
  rules: FilterRule[];
}

/** 一个 Vendor 的过滤器，缺的按网关的缺省补上（默认放行；不写 enforce 算执行）。 */
export function channelOf(doc: FilterDoc, vendor: string): ChannelView {
  const key = channelKeyOf(doc, vendor);
  const channel = key === undefined ? undefined : doc.filters![key];
  return {
    vendor,
    key: key ?? vendor,
    exists: channel !== undefined,
    defaultAction: channel?.default === 'deny' ? 'deny' : 'allow',
    enforce: channel === undefined ? false : channel.enforce !== false,
    rules: channel?.rules ?? [],
  };
}

/**
 * 改一个 Vendor 的过滤器。还没有的话先建一份：默认放行、**只标记**——
 * 新加的规则先看它会拦掉什么，确认了再由人打开执行，不能一加上就开始拒请求。
 * 这一页不认识的键照留。
 */
function writeChannel(doc: FilterDoc, vendor: string, change: (channel: FilterChannel) => FilterChannel): FilterDoc {
  const key = channelKeyOf(doc, vendor) ?? vendor;
  const current: FilterChannel = doc.filters?.[key] ?? { default: 'allow', enforce: false, rules: [] };
  return { ...doc, filters: { ...(doc.filters ?? {}), [key]: change(current) } };
}

export function setChannelDefault(doc: FilterDoc, vendor: string, action: FilterAction): FilterDoc {
  return writeChannel(doc, vendor, (c) => ({ ...c, default: action }));
}

export function setChannelEnforce(doc: FilterDoc, vendor: string, enforce: boolean): FilterDoc {
  return writeChannel(doc, vendor, (c) => ({ ...c, enforce }));
}

const RULE_FORM_KEYS = ['id', 'enabled', 'action', 'when'];

/** 写进一条过滤规则。`originalId` 给了就是改那一条（位置不动，表单不管的键照留），没给就加在最后。 */
export function upsertFilterRule(doc: FilterDoc, vendor: string, rule: FilterRule, originalId?: string): FilterDoc {
  return writeChannel(doc, vendor, (c) => {
    const rules = c.rules ?? [];
    if (originalId === undefined) return { ...c, rules: [...rules, rule] };
    return {
      ...c,
      rules: rules.map((r) => (r.id === originalId ? { ...rule, ...untouched(r, RULE_FORM_KEYS) } : r)),
    };
  });
}

export function setFilterRuleEnabled(doc: FilterDoc, vendor: string, id: string, enabled: boolean): FilterDoc {
  return writeChannel(doc, vendor, (c) => ({
    ...c,
    rules: (c.rules ?? []).map((r) => (r.id === id ? { ...r, enabled } : r)),
  }));
}

export function removeFilterRule(doc: FilterDoc, vendor: string, id: string): FilterDoc {
  return writeChannel(doc, vendor, (c) => ({ ...c, rules: (c.rules ?? []).filter((r) => r.id !== id) }));
}

/** 上移或下移一格；已经在头上（或尾上）时原样返回。 */
export function moveFilterRule(doc: FilterDoc, vendor: string, id: string, direction: -1 | 1): FilterDoc {
  const rules = channelOf(doc, vendor).rules;
  const next = move(rules, rules.findIndex((r) => r.id === id), direction);
  return next ? writeChannel(doc, vendor, (c) => ({ ...c, rules: next })) : doc;
}

/** 整个去掉这个 Vendor 的过滤器：它回到什么都收。 */
export function removeChannel(doc: FilterDoc, vendor: string): FilterDoc {
  const key = channelKeyOf(doc, vendor);
  if (key === undefined) return doc;
  return { ...doc, filters: Object.fromEntries(Object.entries(doc.filters ?? {}).filter(([k]) => k !== key)) };
}

/** 左边 Vendor 列表里那一行小字。 */
export function channelSummary(view: ChannelView): string {
  if (!view.exists) return '没有规则，什么都收';
  const count = view.rules.length === 0 ? '没有规则' : `${view.rules.length} 条规则`;
  return `${count} · 默认${view.defaultAction === 'deny' ? '拒绝' : '放行'} · ${view.enforce ? '执行中' : '只标记'}`;
}

export interface VendorItem {
  key: string;
  displayName: string;
  /** 号池后台不认识这个 Vendor：只在过滤器里出现过，多半是写错了或者已经下线。 */
  unknown: boolean;
}

/** 左边的 Vendor 列表：号池后台报的那些，加上只在过滤器里出现过的。 */
export function vendorList(doc: FilterDoc, vendors: FilterVendor[]): VendorItem[] {
  const items: VendorItem[] = vendors.map((v) => ({ ...v, unknown: false }));
  for (const key of Object.keys(doc.filters ?? {})) {
    if (!items.some((s) => sameVendor(s.key, key))) items.push({ key, displayName: key, unknown: true });
  }
  return items;
}

// ---------- 号池后台查出来的问题 ----------

/** 和这个分类器有关的那几句。号池后台按 `classifier 'id'` 报，没有 id 的按 `classifier #n`。 */
export function problemsOfClassifier(problems: FilterProblem[], id: string, index: number): string[] {
  return problems
    .filter((p) => p.subject === `classifier '${id}'` || p.subject === `classifier #${index}`)
    .map((p) => p.reason);
}

/** 这条过滤规则的那几句。`key` 是文档里写成的那个 Vendor 键。 */
export function problemsOfRule(problems: FilterProblem[], key: string, id: string, index: number): string[] {
  const own = new Set([`filter '${key}' rule '${id}'`, `filter '${key}' rule #${index}`]);
  return problems.filter((p) => own.has(p.subject)).map((p) => p.reason);
}

/**
 * 这个 Vendor 的过滤器里网关读不懂的全部（它自己的和其中规则的）。有一句，整个过滤器在网关那边就不生效——
 * 那个 Vendor 什么都收，所以页面上要在过滤器头上说。
 */
export function problemsOfChannel(problems: FilterProblem[], key: string): FilterProblem[] {
  const own = `filter '${key}'`;
  return problems.filter((p) => p.subject === own || p.subject.startsWith(`${own} rule `));
}
