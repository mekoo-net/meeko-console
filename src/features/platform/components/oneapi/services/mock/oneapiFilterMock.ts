import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

import { CLASSIFIER_ID_PATTERN, RESERVED_RULE_ID, RULE_ID_PATTERN } from '../../model/filter';
import type { FilterDoc, FilterProblem, FilterSchema, FilterSnapshot } from '../../model/filter.types';
import { VAULT_REJECTED } from '../../model/ratecard';
import type { OneApiFilterPort } from '../ports/oneapiFilterPort';

/**
 * 过滤器的内存版，照着号池后台的规矩做：整份读写、带版本号、存之前校验、有一处不过就不存。
 * 校验只做了网关编译器里最常撞上的那几条（id 的写法和重复、字段和比法认不认识、引用的分类器在不在、
 * 动作和默认动作的写法），说法和 subject 照网关的抄——真的那一份是网关的编译器，这里不求全，
 * 只求页面上「存不进去时说出是哪一处」这条线走得通。
 */

const HEADERS = [
  'user-agent',
  'origin',
  'referer',
  'x-requested-with',
  'x-title',
  'http-referer',
  'x-app',
  'anthropic-beta',
  'originator',
  'x-stainless-lang',
  'x-stainless-runtime',
  'x-stainless-package-version',
];

export const MOCK_FILTER_SCHEMA: FilterSchema = {
  // 条件能看的只有请求本身带的东西：这些请求头和系统提示词
  fields: [...HEADERS.map((h) => ({ name: `header.${h}`, kind: 'text' })), { name: 'system', kind: 'text' }],
  operators: { text: ['eq', 'in', 'prefix', 'contains', 'regex', 'exists'] },
  vendors: [
    { key: 'agentspace', displayName: 'Agentspace' },
    { key: 'claude', displayName: 'Claude' },
    { key: 'factory', displayName: 'Factory' },
    { key: 'kiro', displayName: 'Kiro' },
  ],
};

/** 开场的样子：四个分类器；factory 拒 agent（只标记），claude 只收自家客户端和酒馆。 */
const seed = (): FilterDoc => ({
  classifiers: [
    {
      id: 'agent.claude',
      name: 'Claude',
      when: {
        any: [
          { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
          { field: 'system', op: 'contains', value: 'You are Claude Code' },
        ],
      },
    },
    {
      id: 'chat.tavern',
      name: '酒馆',
      when: { field: 'header.user-agent', op: 'prefix', value: 'TauriTavern/' },
    },
    {
      id: 'chat.app',
      name: '聊天 App',
      when: { field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'RikkaHub-', 'Tavo'] },
    },
    {
      id: 'chat.webview',
      name: '小手机 WebView',
      when: { field: 'header.x-requested-with', op: 'exists' },
    },
  ],
  filters: {
    factory: {
      enforce: false,
      rules: [{ id: 'no-agents', action: 'deny', when: { classifier: 'agent.claude' } }],
    },
    claude: {
      default: 'deny',
      enforce: false,
      rules: [
        { id: 'own-client', action: 'allow', when: { classifier: 'agent.claude' } },
        { id: 'tavern', action: 'allow', when: { classifier: ['chat.tavern', 'chat.app', 'chat.webview'] } },
        {
          id: 'old-cli',
          action: 'allow',
          enabled: false,
          when: { field: 'header.x-app', op: 'eq', value: 'cli' },
        },
      ],
    },
  },
});

/**
 * 文档是纯 JSON，照 JSON 的办法拷：页面交过来的可能是 Vue 包过的响应式对象，`structuredClone` 拷不了它；
 * 真的那条路也是 `JSON.stringify` 以后发出去的。
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let doc: FilterDoc | null = seed();
let version = 1;

/** 测试之间把内存里的那一份放回开场的样子；给 `null` 是「还没有文档」。 */
export function _resetOneApiFilterMock(next: FilterDoc | null = seed()): void {
  doc = next === null ? null : clone(next);
  version = 1;
}

/** 装作别人刚存了一次：内容不变，版本号往前走。页面手上的版本号就过期了。 */
export function _someoneElseSavedFilter(): void {
  version += 1;
}

/** 现在内存里存的那一份（测试断言用）。 */
export function _currentOneApiFilterDoc(): FilterDoc | null {
  return doc === null ? null : clone(doc);
}

const FIELD_NAMES = new Set(MOCK_FILTER_SCHEMA.fields.map((f) => f.name));
const OPERATORS = new Set(MOCK_FILTER_SCHEMA.operators.text);

/** `classifiers` 为 null 时是分类器自己的条件：不能再引用分类器。 */
function conditionProblem(node: unknown, classifiers: Set<string> | null): string | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return 'Condition is not an object.';
  const o = node as Record<string, unknown>;
  for (const key of ['all', 'any'] as const) {
    if (!(key in o)) continue;
    const list = o[key];
    if (!Array.isArray(list)) return `'${key}' is not an array.`;
    if (list.length === 0) return `'${key}' is empty.`;
    return list.map((n) => conditionProblem(n, classifiers)).find((p) => p !== null) ?? null;
  }
  if ('not' in o) return conditionProblem(o.not, classifiers);
  if ('classifier' in o) {
    if (classifiers === null) return 'A classifier cannot refer to another classifier.';
    const names = Array.isArray(o.classifier) ? o.classifier : [o.classifier];
    const unknown = names.find((n) => typeof n !== 'string' || !classifiers.has(n));
    return unknown === undefined ? null : `Unknown classifier '${String(unknown)}'.`;
  }
  if (typeof o.field !== 'string') return "Condition needs exactly one of 'all', 'any', 'not', 'classifier', 'field'.";
  if (!FIELD_NAMES.has(o.field)) return `Unknown field '${o.field}'.`;
  if (typeof o.op !== 'string' || !OPERATORS.has(o.op)) return `Unknown operator '${String(o.op)}' for a text field.`;
  if (o.op !== 'exists' && (o.value === undefined || o.value === '')) return `Operator '${o.op}' needs non-empty values.`;
  return null;
}

function check(candidate: FilterDoc): FilterProblem[] {
  const problems: FilterProblem[] = [];

  const readable = new Set<string>();
  const seen = new Set<string>();
  (candidate.classifiers ?? []).forEach((c, index) => {
    const subject = c.id ? `classifier '${c.id}'` : `classifier #${index}`;
    let reason: string | null;
    if (!CLASSIFIER_ID_PATTERN.test(c.id))
      reason = `Id '${c.id}' is not '<category>.<name>' in lowercase letters, digits and '_'.`;
    else if (seen.has(c.id)) {
      readable.delete(c.id);
      reason = 'Appears more than once.';
    } else reason = conditionProblem(c.when, null);
    seen.add(c.id);
    if (reason) problems.push({ subject, reason });
    else readable.add(c.id);
  });

  for (const [vendor, channel] of Object.entries(candidate.filters ?? {})) {
    const subject = `filter '${vendor}'`;
    if (channel.default !== undefined && channel.default !== 'allow' && channel.default !== 'deny') {
      problems.push({ subject, reason: `Unknown default '${channel.default}'.` });
      continue;
    }
    const unknownKey = Object.keys(channel).find((k) => !['default', 'enforce', 'rules'].includes(k));
    if (unknownKey) {
      problems.push({ subject, reason: `Unknown property '${unknownKey}'.` });
      continue;
    }

    // 网关读到一条坏的就不往下读了：一个 Vendor 只报第一处。
    const ids = new Set<string>();
    for (const [index, rule] of (channel.rules ?? []).entries()) {
      const ruleSubject = rule.id ? `${subject} rule '${rule.id}'` : `${subject} rule #${index}`;
      let reason: string | null;
      if (!RULE_ID_PATTERN.test(rule.id)) reason = `Id '${rule.id}' is not lowercase letters, digits, '_', '-' and '.'.`;
      else if (rule.id === RESERVED_RULE_ID) reason = `Id '${RESERVED_RULE_ID}' is reserved for the default action.`;
      else if (ids.has(rule.id)) reason = 'Appears more than once in this filter.';
      else if (rule.action !== 'allow' && rule.action !== 'deny') reason = `Unknown action '${rule.action}'.`;
      else reason = conditionProblem(rule.when, readable);
      ids.add(rule.id);
      if (reason) {
        problems.push({ subject: ruleSubject, reason });
        break;
      }
    }
  }
  return problems;
}

const snapshot = (): FilterSnapshot => ({
  doc: doc === null ? {} : clone(doc),
  version: doc === null ? null : String(version),
});

export class OneApiFilterMock implements OneApiFilterPort {
  async load(): Promise<AppResult<FilterSnapshot>> {
    return ok(snapshot());
  }

  async save(next: FilterDoc, expected: string | null): Promise<AppResult<FilterSnapshot>> {
    const problems = check(next);
    if (problems.length > 0) {
      return fail({
        code: 'validation',
        message: '提交的内容有误',
        reason: VAULT_REJECTED,
        details: { upstream: [problems.map((p) => `${p.subject}: ${p.reason}`).join(' ')] },
      });
    }

    const current = doc === null ? null : String(version);
    if (current !== expected) return fail({ code: 'conflict', message: '内容已被别人修改' });

    doc = clone(next);
    version += 1;
    return ok(snapshot());
  }

  async validate(candidate: FilterDoc): Promise<AppResult<FilterProblem[]>> {
    return ok(check(candidate));
  }

  async schema(): Promise<AppResult<FilterSchema>> {
    return ok(clone(MOCK_FILTER_SCHEMA));
  }
}
