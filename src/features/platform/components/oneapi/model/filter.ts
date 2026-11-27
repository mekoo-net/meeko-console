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

/** 表单只管 id 和条件。`name` 表单不再填，文档里原有的（整套分类器里带的那些）编辑时照留。 */
const CLASSIFIER_FORM_KEYS = ['id', 'when'];

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

/**
 * 过滤规则引用一整类分类器的写法：`agent.*` = id 以 `agent.` 开头的全部，任一成立。网关在编译时展开，
 * 以后新加的 `agent.xxx` 自己就算进去。`*` 只能是最后一整段（和网关 FilterPolicy 的规矩一样）。
 */
export const CATEGORY_REF_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*\.\*$/;
export const isCategoryRef = (ref: string): boolean => CATEGORY_REF_PATTERN.test(ref);
export const categoryRef = (category: string): string => `${category}.*`;

/** 引用里写的（一个 id，或者 `agent.*`）对不对得上这个分类器。 */
export const refMatches = (ref: string, id: string): boolean =>
  isCategoryRef(ref) ? id.startsWith(ref.slice(0, -1)) : ref === id;

export interface ClassifierUse {
  vendor: string;
  ruleId: string;
  /** 经一整类引用到的：那一类的写法（`agent.*`）。直接点名的没有这一项。 */
  via?: string;
}

/** 哪些过滤规则引用了这个分类器：直接点名的，和经 `agent.*` 这种一整类引用到的。 */
export function classifierUses(doc: FilterDoc, id: string): ClassifierUse[] {
  const uses: ClassifierUse[] = [];
  for (const [vendor, channel] of Object.entries(doc.filters ?? {})) {
    for (const rule of channel.rules ?? []) {
      const refs = referencedClassifiers(rule.when).filter((ref) => refMatches(ref, id));
      if (refs.length === 0) continue;
      // 同一条规则既点了名又写了一整类：按点名算，删它时要拦。
      const via = refs.includes(id) ? undefined : refs[0];
      uses.push(via === undefined ? { vendor, ruleId: rule.id } : { vendor, ruleId: rule.id, via });
    }
  }
  return uses;
}

/**
 * 删这个分类器会让哪些过滤规则读不懂：直接点名它的；经一整类引用、而这一类只剩它一个的（网关对一个都对不上的
 * `agent.*` 报读不懂，那个 Vendor 的过滤器整个不生效）。一整类里还有别的就不拦：规则照样认得这一类其余的。
 */
export function blockingUses(doc: FilterDoc, id: string): ClassifierUse[] {
  const others = classifiersOf(doc).filter((c) => c.id !== id);
  return classifierUses(doc, id).filter((u) => u.via === undefined || !others.some((c) => refMatches(u.via!, c.id)));
}

// ---------- 条件 ----------

/** 条件里的一行：引用分类器，或者比一个字段。 */
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
      /** 比的值。`exists` 没有值；文本和工具名可以有多个；数字只有一个（按字符串存，写回去时转成数）。 */
      values: string[];
      /** 值是数字（工具数量）。 */
      numeric: boolean;
      ignoreCase: boolean;
    };

/** 一组条件：全部成立或者任一成立，可以整组取反，组里还能再套组（层级）。 */
export interface ConditionGroup {
  kind: 'group';
  negate: boolean;
  mode: 'all' | 'any';
  children: ConditionNode[];
}

/**
 * 按对象匹配工具：请求里有一个工具，它自己的名称、描述、参数同时满足里面那组条件。
 * 重名的工具太多，只比名字会误伤；同一个工具的描述或参数也对得上才算。取反 = 没有这样的工具。
 */
export interface ConditionTool {
  kind: 'tool';
  negate: boolean;
  /** 里面的字段只有这个工具对象上的：`name` / `description` / `params`。不能引用分类器，不能再套工具对象。 */
  group: ConditionGroup;
}

export type ConditionNode = ConditionRow | ConditionGroup | ConditionTool;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const keysOf = (v: Record<string, unknown>): string[] => Object.keys(v).sort();

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function readLeaf(node: Record<string, unknown>): ConditionRow | null {
  if (keysOf(node).join() === 'classifier') {
    const value = node.classifier;
    if (typeof value === 'string') return { kind: 'classifier', negate: false, classifiers: [value] };
    if (isStringList(value) && value.length > 0) return { kind: 'classifier', negate: false, classifiers: [...value] };
    return null;
  }

  if (typeof node.field !== 'string' || typeof node.op !== 'string') return null;
  if (keysOf(node).some((k) => !['field', 'op', 'value', 'ignoreCase'].includes(k))) return null;

  let values: string[];
  let numeric = false;
  if (node.value === undefined) values = [];
  else if (typeof node.value === 'string') values = [node.value];
  else if (typeof node.value === 'number' && Number.isInteger(node.value)) {
    values = [String(node.value)];
    numeric = true;
  } else if (isStringList(node.value)) values = [...node.value];
  else return null;

  if (node.ignoreCase !== undefined && typeof node.ignoreCase !== 'boolean') return null;
  return {
    kind: 'field',
    negate: false,
    field: node.field,
    op: node.op,
    values,
    numeric,
    ignoreCase: node.ignoreCase === true,
  };
}

function readNode(node: unknown): ConditionNode | null {
  if (!isObject(node)) return null;
  const keys = keysOf(node).join();

  if (keys === 'not') {
    const inner = readNode(node.not);
    return inner ? { ...inner, negate: !inner.negate } : null;
  }

  if (keys === 'all' || keys === 'any') {
    const list = node[keys];
    if (!Array.isArray(list) || list.length === 0) return null;
    const children = list.map(readNode);
    return children.every((c) => c !== null)
      ? { kind: 'group', negate: false, mode: keys, children: children as ConditionNode[] }
      : null;
  }

  if (keys === 'tool') {
    const group = conditionTree(node.tool);
    // 工具对象里面只比这个工具自己的字段
    return group && onlyFields(group) ? { kind: 'tool', negate: false, group } : null;
  }

  return readLeaf(node);
}

const onlyFields = (group: ConditionGroup): boolean =>
  group.children.every((c) => (c.kind === 'group' ? onlyFields(c) : c.kind === 'field'));

/**
 * 把条件读成表单编得出来的样子：最外面总是一组（全部成立 / 任一成立），里面是行和套着的组。
 * 写法这一页不认识的（不认识的键、空组）回 null，页面改用 JSON 编辑。读得成的保证 `buildCondition` 写回去意思不变。
 */
export function conditionTree(when: unknown): ConditionGroup | null {
  const node = readNode(when);
  if (!node) return null;
  if (node.kind === 'group' && !node.negate) return node;
  return { kind: 'group', negate: false, mode: 'all', children: [node] };
}

export const emptyTree = (first: ConditionNode): ConditionGroup => ({
  kind: 'group',
  negate: false,
  mode: 'all',
  children: [first],
});

/** 数字字段上能用的比法；它们只比一个值。 */
const NUMBER_OPS = new Set(['gt', 'gte', 'lt', 'lte']);

/** `exists` 不比值，别的都要。 */
export const opNeedsValue = (op: string): boolean => op !== 'exists';

/** 正则、数字只写一个值；别的可以给好几个，命中任一个（或者「全部包含」）就算。 */
export const opTakesMany = (op: string, numeric = false): boolean =>
  !numeric && op !== 'regex' && op !== 'exists' && !NUMBER_OPS.has(op);

function writeNode(node: ConditionNode): Record<string, unknown> {
  let out: Record<string, unknown>;
  if (node.kind === 'group') {
    out = { [node.mode]: node.children.map(writeNode) };
  } else if (node.kind === 'tool') {
    out = { tool: buildCondition(node.group) };
  } else if (node.kind === 'classifier') {
    out = { classifier: node.classifiers.length === 1 ? node.classifiers[0] : [...node.classifiers] };
  } else {
    out = { field: node.field, op: node.op };
    if (opNeedsValue(node.op)) {
      out.value = node.numeric
        ? Number(node.values[0])
        : node.values.length === 1
          ? node.values[0]
          : [...node.values];
    }
    if (node.ignoreCase && opNeedsValue(node.op) && !node.numeric) out.ignoreCase = true;
  }
  return node.negate ? { not: out } : out;
}

/** 表单 → 条件。最外面那组只有一项时不套 `all` / `any`。 */
export function buildCondition(tree: ConditionGroup): Record<string, unknown> {
  if (tree.children.length === 1 && !tree.negate) return writeNode(tree.children[0]!);
  return writeNode(tree);
}

/** 表单里的条件哪里还没填好；null = 可以存了（剩下的交给号池后台用网关的编译器查）。 */
export function conditionError(tree: ConditionGroup): string | null {
  const check = (node: ConditionNode): string | null => {
    if (node.kind === 'group') {
      if (node.children.length === 0) return '有一组里没有条件';
      for (const child of node.children) {
        const error = check(child);
        if (error) return error;
      }
      return null;
    }
    if (node.kind === 'tool') return check(node.group);
    if (node.kind === 'classifier') return node.classifiers.length === 0 ? '有条件没选分类器' : null;
    if (!node.field) return '有条件没选字段';
    if (!node.op) return '有条件没选比法';
    if (!opNeedsValue(node.op)) return null;
    if (node.values.every((v) => v.trim() === '')) return '有条件没填值';
    if (node.numeric && !/^-?\d+$/.test(node.values[0]?.trim() ?? '')) return '数量要填整数';
    return null;
  };
  return check(tree);
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

// ---------- 字段：来源和层级 ----------

/**
 * 字段名是 `来源.层级`（网关的叫法）：请求头的层级是头名；提示词分系统、用户、助手；工具分名称、描述、数量。
 * 网关以后多报的来源或层级这里还不认识的，原样显示。
 */
const SOURCE_LABELS: Record<string, string> = {
  header: '请求头',
  prompt: '提示词',
  tools: '工具',
  // 工具对象里面的三样（字段名没有层级）
  name: '名称',
  description: '描述',
  params: '参数',
};
const LEVEL_LABELS: Record<string, Record<string, string>> = {
  prompt: { system: '系统', user: '用户', assistant: '助手' },
  tools: { name: '名称', count: '数量' },
};

export const sourceOf = (field: string): string => field.split('.')[0] ?? field;
const levelOf = (field: string): string => field.slice(sourceOf(field).length + 1);

export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;

export function levelLabel(field: string): string {
  const source = sourceOf(field);
  const level = levelOf(field);
  return LEVEL_LABELS[source]?.[level] ?? level;
}

/** 字段在页面上叫什么：请求头就是头名本身（`user-agent`），别的是「来源·层级」（提示词·系统、工具·名称）。 */
export function fieldLabel(field: string): string {
  const source = sourceOf(field);
  if (source === 'header') return levelOf(field);
  return levelOf(field) ? `${sourceLabel(source)}·${levelLabel(field)}` : sourceLabel(source);
}

/** 条件从哪儿取值：一个来源和它下面的层级（各是一个字段）。 */
export interface ConditionSource {
  key: string;
  label: string;
  levels: { field: string; label: string; kind: string }[];
}

/** 网关报的字段按来源归好，按第一次出现的顺序。 */
export function conditionSources(fields: readonly { name: string; kind: string }[]): ConditionSource[] {
  const sources: ConditionSource[] = [];
  for (const f of fields) {
    const key = sourceOf(f.name);
    let source = sources.find((s) => s.key === key);
    if (!source) sources.push((source = { key, label: sourceLabel(key), levels: [] }));
    source.levels.push({ field: f.name, label: levelLabel(f.name), kind: f.kind });
  }
  return sources;
}

// ---------- 说成人话 ----------

const OP_LABELS: Record<string, string> = {
  eq: '等于',
  in: '是其中之一',
  prefix: '开头是',
  contains: '包含',
  regex: '匹配正则',
  exists: '有值',
  contains_any: '包含任一',
  contains_all: '全部包含',
  gt: '大于',
  gte: '至少',
  lt: '小于',
  lte: '至多',
};

export const opLabel = (op: string): string => OP_LABELS[op] ?? op;

function describeRow(row: ConditionRow): string {
  if (row.kind === 'classifier') {
    const names = row.classifiers.map((c) => (isCategoryRef(c) ? `${c.slice(0, -2)} 类任一` : c));
    return row.negate ? `分类器不是 ${names.join(' 也不是 ')}` : `分类器是 ${names.join(' 或 ')}`;
  }
  const field = fieldLabel(row.field);
  if (row.op === 'exists') return row.negate ? `${field} 没有值` : `${field} 有值`;

  const joiner = row.op === 'contains_all' ? ' 和 ' : ' 或 ';
  const values = row.numeric ? row.values.join('') : row.values.map((v) => `"${v}"`).join(joiner);
  const text = `${field} ${opLabel(row.op)} ${values}${row.ignoreCase ? '（不分大小写）' : ''}`;
  return row.negate ? `不满足：${text}` : text;
}

function describeNode(node: ConditionNode, nested: boolean): string {
  if (node.kind === 'tool') return `${node.negate ? '没有工具' : '有工具'}（${describeNode(node.group, false)}）`;
  if (node.kind !== 'group') return describeRow(node);
  const inner = node.children.map((c) => describeNode(c, true)).join(node.mode === 'all' ? ' 且 ' : ' 或 ');
  if (node.negate) return `不满足（${inner}）`;
  return nested && node.children.length > 1 ? `（${inner}）` : inner;
}

/** 列表里那一格：这个条件说的是什么。表单读不成的条件只说它是手写的。 */
export function describeCondition(when: unknown): string {
  const tree = conditionTree(when);
  return tree ? describeNode(tree, false) : '自定义条件（JSON）';
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
  /** true = 过滤模式：判了拒绝的请求真的被拒；false = 观察模式：只记不拒。文档里不写就是观察，要过滤得明确写 true。 */
  enforce: boolean;
  rules: FilterRule[];
}

/** 一个 Vendor 的过滤器，缺的按网关的缺省补上（默认放行；不写 enforce 就是观察模式）。 */
export function channelOf(doc: FilterDoc, vendor: string): ChannelView {
  const key = channelKeyOf(doc, vendor);
  const channel = key === undefined ? undefined : doc.filters![key];
  return {
    vendor,
    key: key ?? vendor,
    exists: channel !== undefined,
    defaultAction: channel?.default === 'deny' ? 'deny' : 'allow',
    enforce: channel?.enforce === true,
    rules: channel?.rules ?? [],
  };
}

/**
 * 改一个 Vendor 的过滤器。还没有的话先建一份：默认放行、**观察模式**——
 * 新加的规则先看它会拦掉什么，确认了再由人切到过滤，不能一加上就开始拒请求。
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
  return `${count} · 默认${view.defaultAction === 'deny' ? '拒绝' : '放行'} · ${view.enforce ? '过滤' : '观察'}`;
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
