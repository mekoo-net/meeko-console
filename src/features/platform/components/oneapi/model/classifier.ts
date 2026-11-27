import type {
  ClassifierDoc,
  ClassifierProblem,
  ClassifierRule,
  ClassifierVendor,
} from './classifier.types';

/**
 * 请求分类规则的纯逻辑：按 vendor 看规则、改文档、读写条件树、把条件说成人话。页面只管摆。
 *
 * 两条规矩贯穿这里：
 * - **顺序是规则的一部分**。网关从上往下看，第一条命中的说了算，所以每一行都带着它在整份文档里的位置，
 *   按 vendor 筛过以后先后也不变。
 * - **不认识的东西照搬**。改一条规则只动表单里有的字段，文档里别的键（`channels`、以后新加的）原样留着。
 */

// ---------- 按 vendor 看 ----------

/** 左边的「全部规则」。 */
export const SCOPE_ALL = '*';

/** vendor 名不分大小写（网关也不分）。 */
const sameVendor = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const rulesOf = (doc: ClassifierDoc): ClassifierRule[] => doc.rules ?? [];

/** 没写 `vendors` 的规则所有 vendor 都管。 */
export const isCommon = (rule: ClassifierRule): boolean => !rule.vendors || rule.vendors.length === 0;

export const isEnabled = (rule: ClassifierRule): boolean => rule.enabled !== false;

/** 这条规则管不管这个 vendor 的请求。 */
export function appliesTo(rule: ClassifierRule, vendor: string): boolean {
  return isCommon(rule) || rule.vendors!.some((v) => sameVendor(v, vendor));
}

export interface RuleRow {
  rule: ClassifierRule;
  /** 在整份文档里排第几（从 0 起），也就是网关看它的先后。 */
  index: number;
}

/**
 * 某个 vendor 的请求会依次经过哪些规则：专门给它的，加上所有 vendor 通用的，按文档里的先后。
 * 这才是「这个 vendor 上会怎么认」的全貌——只列专门给它的那几条，会看漏排在前面的通用规则先把请求认走了。
 */
export function rowsInScope(doc: ClassifierDoc, scope: string): RuleRow[] {
  const rows = rulesOf(doc).map((rule, index) => ({ rule, index }));
  return scope === SCOPE_ALL ? rows : rows.filter((r) => appliesTo(r.rule, scope));
}

export interface VendorScope {
  key: string;
  displayName: string;
  /** 专门给它的规则数（不含通用的）。 */
  own: number;
  /** 号池后台不认识这个 vendor：只在规则里出现过，多半是写错了或者渠道已经下线。 */
  unknown: boolean;
}

/** 左边的 vendor 列表：号池后台报的那些，加上只在规则里出现过的。 */
export function vendorScopes(doc: ClassifierDoc, vendors: ClassifierVendor[]): VendorScope[] {
  const scopes: VendorScope[] = vendors.map((v) => ({ ...v, own: 0, unknown: false }));
  for (const rule of rulesOf(doc)) {
    for (const name of rule.vendors ?? []) {
      let scope = scopes.find((s) => sameVendor(s.key, name));
      if (!scope) {
        scope = { key: name, displayName: name, own: 0, unknown: true };
        scopes.push(scope);
      }
      scope.own += 1;
    }
  }
  return scopes;
}

// ---------- 改文档 ----------

/** 标签的格式：`类别.名称`，小写字母、数字、下划线，至少两级。和网关的校验是同一条。 */
export const LABEL_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const withRules = (doc: ClassifierDoc, rules: ClassifierRule[]): ClassifierDoc => ({ ...doc, rules });

/** 表单管的那几个键。改规则时这几个整个换成表单里的（表单里去掉了「适用 Vendor」，存下去就没有 `vendors`）。 */
const FORM_KEYS = ['id', 'label', 'enabled', 'vendors', 'when'];

/**
 * 写进一条规则。`originalId` 给了就是改那一条（位置不动，表单不管的键照留），没给就加在最后。
 */
export function upsertRule(doc: ClassifierDoc, rule: ClassifierRule, originalId?: string): ClassifierDoc {
  const rules = rulesOf(doc);
  if (originalId === undefined) return withRules(doc, [...rules, rule]);
  return withRules(
    doc,
    rules.map((r) => {
      if (r.id !== originalId) return r;
      const untouched = Object.fromEntries(Object.entries(r).filter(([key]) => !FORM_KEYS.includes(key)));
      return { ...rule, ...untouched };
    }),
  );
}

export function removeRule(doc: ClassifierDoc, id: string): ClassifierDoc {
  return withRules(
    doc,
    rulesOf(doc).filter((r) => r.id !== id),
  );
}

export function setEnabled(doc: ClassifierDoc, id: string, enabled: boolean): ClassifierDoc {
  return withRules(
    doc,
    rulesOf(doc).map((r) => (r.id === id ? { ...r, enabled } : r)),
  );
}

/**
 * 在当前看着的这个范围里上移或下移一格：和列表里相邻的那一条换位置。
 * 中间隔着的、这个范围里看不见的规则不动——它们管的是别的 vendor，和这两条谁先谁后没有关系。
 * 已经在头上（或尾上）时原样返回。
 */
export function moveRule(doc: ClassifierDoc, scope: string, id: string, direction: -1 | 1): ClassifierDoc {
  const rows = rowsInScope(doc, scope);
  const at = rows.findIndex((r) => r.rule.id === id);
  const other = rows[at + direction];
  if (at < 0 || !other) return doc;

  const rules = [...rulesOf(doc)];
  const from = rows[at]!.index;
  [rules[from], rules[other.index]] = [rules[other.index]!, rules[from]!];
  return withRules(doc, rules);
}

// ---------- 条件 ----------

/** 一个比较：某个字段、某种比法、比什么。 */
export interface FlatRow {
  /** 取反：这个比较不成立才算。 */
  negate: boolean;
  field: string;
  op: string;
  /** 比的值。`exists` 没有值；别的可以有多个，命中任一个就算。 */
  values: string[];
  ignoreCase: boolean;
}

/** 表单里编得出来的条件：一组比较，全部成立或者任一成立。 */
export interface FlatCondition {
  mode: 'all' | 'any';
  rows: FlatRow[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const keysOf = (v: Record<string, unknown>): string[] => Object.keys(v).sort();

function readComparison(node: unknown): Omit<FlatRow, 'negate'> | null {
  if (!isObject(node) || typeof node.field !== 'string' || typeof node.op !== 'string') return null;
  if (keysOf(node).some((k) => !['field', 'op', 'value', 'ignoreCase'].includes(k))) return null;

  let values: string[];
  if (node.value === undefined || node.value === true) values = [];
  else if (typeof node.value === 'string') values = [node.value];
  else if (Array.isArray(node.value) && node.value.every((v) => typeof v === 'string')) values = [...node.value];
  else return null;

  if (node.ignoreCase !== undefined && typeof node.ignoreCase !== 'boolean') return null;
  return { field: node.field, op: node.op, values, ignoreCase: node.ignoreCase === true };
}

function readRow(node: unknown): FlatRow | null {
  if (isObject(node) && keysOf(node).join() === 'not') {
    const inner = readComparison(node.not);
    return inner ? { ...inner, negate: true } : null;
  }
  const plain = readComparison(node);
  return plain ? { ...plain, negate: false } : null;
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

function writeRow(row: FlatRow): Record<string, unknown> {
  const comparison: Record<string, unknown> = { field: row.field, op: row.op };
  if (opNeedsValue(row.op)) comparison.value = row.values.length === 1 ? row.values[0] : [...row.values];
  if (row.ignoreCase && opNeedsValue(row.op)) comparison.ignoreCase = true;
  return row.negate ? { not: comparison } : comparison;
}

/** 表单 → 条件树。只有一个比较时不套 `all`。 */
export function buildCondition(flat: FlatCondition): Record<string, unknown> {
  const rows = flat.rows.map(writeRow);
  return rows.length === 1 ? rows[0]! : { [flat.mode]: rows };
}

/** 表单里的条件哪里还没填好；null = 可以存了（剩下的交给号池后台用网关的编译器查）。 */
export function flatConditionError(flat: FlatCondition): string | null {
  if (flat.rows.length === 0) return '至少要有一个条件';
  for (const [i, row] of flat.rows.entries()) {
    const which = flat.rows.length > 1 ? `第 ${i + 1} 个条件` : '条件';
    if (!row.field) return `${which}没选字段`;
    if (!row.op) return `${which}没选比法`;
    if (opNeedsValue(row.op) && row.values.every((v) => v === '')) return `${which}没填值`;
  }
  return null;
}

// ---------- 说成人话 ----------

const HEADER_PREFIX = 'header.';

const FIELD_LABELS: Record<string, string> = {
  'caller.account': '账号 UID',
  'caller.key': 'API Key UID',
  'caller.account_type': '账号类型',
  model: '模型',
  format: '调用协议',
};

/** 字段在页面上叫什么。请求头就是「请求头 xxx」；这一页不认识的原样显示。 */
export function fieldLabel(name: string): string {
  if (name.startsWith(HEADER_PREFIX)) return `请求头 ${name.slice(HEADER_PREFIX.length)}`;
  return FIELD_LABELS[name] ?? name;
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

function describeRow(row: FlatRow): string {
  const field = fieldLabel(row.field);
  if (row.op === 'exists') return row.negate ? `${field} 没有值` : `${field} 有值`;

  const values = row.values.map((v) => `"${v}"`).join(' 或 ');
  const text = `${field} ${opLabel(row.op)} ${values}${row.ignoreCase ? '（不分大小写）' : ''}`;
  return row.negate ? `不满足：${text}` : text;
}

/** 列表里那一格：这条规则认的是什么。表单读不成的条件只说它是手写的。 */
export function describeCondition(when: unknown): string {
  const flat = flattenCondition(when);
  if (!flat) return '自定义条件（JSON）';
  return flat.rows.map(describeRow).join(flat.mode === 'all' ? ' 且 ' : ' 或 ');
}

// ---------- 号池后台查出来的问题 ----------

/**
 * 一批问题里和这条规则有关的那几句。号池后台按 `rule 'id'` 报（没有 id 的按 `rule #n`，n 是它在文档里的位置）。
 */
export function problemsOfRule(problems: ClassifierProblem[], id: string, index: number): string[] {
  return problems
    .filter((p) => p.subject === `rule '${id}'` || p.subject === `rule #${index}`)
    .map((p) => p.reason);
}
