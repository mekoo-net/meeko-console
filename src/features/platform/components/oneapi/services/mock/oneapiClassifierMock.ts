import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

import { LABEL_PATTERN, rulesOf } from '../../model/classifier';
import type {
  ClassifierDoc,
  ClassifierProblem,
  ClassifierSchema,
  ClassifierSnapshot,
} from '../../model/classifier.types';
import { VAULT_REJECTED } from '../../model/ratecard';
import type { OneApiClassifierPort } from '../ports/oneapiClassifierPort';

/**
 * 请求分类规则的内存版，照着号池后台的规矩做：整份读写、带版本号、存之前校验、有一处不过就不存。
 * 校验只做了号池后台里最常撞上的那几条（标签格式、字段和比法认不认识、适用 vendor 不能是空数组）——
 * 真的那一份是网关的编译器，这里不求全，只求页面上「存不进去时说出是哪一条」这条线走得通。
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

export const MOCK_CLASSIFIER_SCHEMA: ClassifierSchema = {
  fields: [
    ...HEADERS.map((h) => ({ name: `header.${h}`, kind: 'text' })),
    ...['caller.account', 'caller.key', 'caller.account_type', 'model', 'format'].map((name) => ({
      name,
      kind: 'text',
    })),
  ],
  operators: { text: ['eq', 'in', 'prefix', 'contains', 'regex', 'exists'] },
  vendors: [
    { key: 'agentspace', displayName: 'Agentspace' },
    { key: 'claude', displayName: 'Claude' },
    { key: 'factory', displayName: 'Factory' },
    { key: 'kiro', displayName: 'Kiro' },
  ],
};

/** 开场的那几条：两条通用的，两条只管某个 vendor 的，一条关着的。 */
const seed = (): ClassifierDoc => ({
  rules: [
    {
      id: 'ua-claude-code',
      label: 'agent.claude_code',
      vendors: ['factory'],
      when: { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
    },
    {
      id: 'ua-tauritavern',
      label: 'tavern.sillytavern',
      when: { field: 'header.user-agent', op: 'prefix', value: 'TauriTavern/' },
    },
    {
      id: 'ua-chat-apps',
      label: 'chat.app',
      when: { field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'RikkaHub-'] },
    },
    {
      id: 'claude-own-agent',
      label: 'agent.claude_own',
      vendors: ['claude'],
      when: {
        any: [
          { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
          { field: 'header.x-app', op: 'eq', value: 'cli' },
        ],
      },
    },
    {
      id: 'no-ua',
      label: 'unknown.no_user_agent',
      enabled: false,
      when: { not: { field: 'header.user-agent', op: 'exists' } },
    },
  ],
});

/**
 * 文档是纯 JSON，照 JSON 的办法拷：页面交过来的可能是 Vue 包过的响应式对象，`structuredClone` 拷不了它；
 * 真的那条路也是 `JSON.stringify` 以后发出去的。
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let doc: ClassifierDoc | null = seed();
let version = 1;

/** 测试之间把内存里的那一份放回开场的样子；给 `null` 是「还没有文档」。 */
export function _resetOneApiClassifierMock(next: ClassifierDoc | null = seed()): void {
  doc = next === null ? null : clone(next);
  version = 1;
}

/** 装作别人刚存了一次：内容不变，版本号往前走。页面手上的版本号就过期了。 */
export function _someoneElseSavedClassifier(): void {
  version += 1;
}

/** 现在内存里存的那一份（测试断言用）。 */
export function _currentOneApiClassifierDoc(): ClassifierDoc | null {
  return doc === null ? null : clone(doc);
}

const FIELD_NAMES = new Set(MOCK_CLASSIFIER_SCHEMA.fields.map((f) => f.name));
const OPERATORS = new Set(MOCK_CLASSIFIER_SCHEMA.operators.text);

function conditionProblem(node: unknown): string | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return 'Condition is not an object.';
  const o = node as Record<string, unknown>;
  for (const key of ['all', 'any'] as const) {
    if (!(key in o)) continue;
    const list = o[key];
    if (!Array.isArray(list)) return `'${key}' is not an array.`;
    if (list.length === 0) return `'${key}' is empty.`;
    return list.map(conditionProblem).find((p) => p !== null) ?? null;
  }
  if ('not' in o) return conditionProblem(o.not);
  if (typeof o.field !== 'string') return "Condition needs exactly one of 'all', 'any', 'not', 'field'.";
  if (!FIELD_NAMES.has(o.field)) return `Unknown field '${o.field}'.`;
  if (typeof o.op !== 'string' || !OPERATORS.has(o.op)) return `Unknown operator '${String(o.op)}' for a text field.`;
  if (o.op !== 'exists' && (o.value === undefined || o.value === '')) return `Operator '${o.op}' needs non-empty values.`;
  return null;
}

function check(candidate: ClassifierDoc): ClassifierProblem[] {
  const problems: ClassifierProblem[] = [];
  rulesOf(candidate).forEach((rule, index) => {
    const subject = rule.id ? `rule '${rule.id}'` : `rule #${index}`;
    let reason: string | null = null;
    if (!rule.id) reason = 'Rule has no id.';
    else if (!LABEL_PATTERN.test(rule.label))
      reason = `Label '${rule.label}' is not '<category>.<name>' in lowercase letters, digits and '_'.`;
    else if (rule.vendors && rule.vendors.length === 0)
      reason = "'vendors' is empty; leave it out to cover every vendor.";
    else reason = conditionProblem(rule.when);
    if (reason) problems.push({ subject, reason });
  });
  return problems;
}

const snapshot = (): ClassifierSnapshot => ({
  doc: doc === null ? {} : clone(doc),
  version: doc === null ? null : String(version),
});

export class OneApiClassifierMock implements OneApiClassifierPort {
  async load(): Promise<AppResult<ClassifierSnapshot>> {
    return ok(snapshot());
  }

  async save(next: ClassifierDoc, expected: string | null): Promise<AppResult<ClassifierSnapshot>> {
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

  async validate(candidate: ClassifierDoc): Promise<AppResult<ClassifierProblem[]>> {
    return ok(check(candidate));
  }

  async schema(): Promise<AppResult<ClassifierSchema>> {
    return ok(clone(MOCK_CLASSIFIER_SCHEMA));
  }
}
