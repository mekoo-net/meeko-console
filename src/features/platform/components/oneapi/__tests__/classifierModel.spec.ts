import { describe, expect, it } from 'vitest';

import {
  LABEL_PATTERN,
  SCOPE_ALL,
  buildCondition,
  describeCondition,
  flatConditionError,
  flattenCondition,
  moveRule,
  problemsOfRule,
  removeRule,
  rowsInScope,
  setEnabled,
  upsertRule,
  vendorScopes,
} from '../model/classifier';
import type { ClassifierDoc } from '../model/classifier.types';

/**
 * 请求分类规则的纯逻辑。要钉住的三件事：
 * - 按 Vendor 看到的是它的请求真会经过的那些规则，先后不乱；
 * - 改文档只动该动的，这一页不认识的键（`channels`、规则上别的键）一个不丢；
 * - 条件在「表单」和「文档里的写法」之间来回不走样，表单编不出来的不硬读。
 */

const doc = (): ClassifierDoc => ({
  rules: [
    { id: 'a', label: 'agent.claude_code', vendors: ['factory'], when: { field: 'model', op: 'exists' } },
    { id: 'b', label: 'tavern.sillytavern', when: { field: 'model', op: 'exists' } },
    { id: 'c', label: 'agent.claude_own', vendors: ['Claude'], when: { field: 'model', op: 'exists' } },
    { id: 'd', label: 'chat.app', vendors: ['claude', 'factory'], when: { field: 'model', op: 'exists' } },
  ],
  channels: { factory: { enforce: false } },
});

const ids = (d: ClassifierDoc): string[] => (d.rules ?? []).map((r) => r.id);

describe('rules seen per vendor', () => {
  it('a vendor sees its own rules plus the common ones, in document order', () => {
    expect(rowsInScope(doc(), 'factory').map((r) => [r.rule.id, r.index])).toEqual([
      ['a', 0],
      ['b', 1],
      ['d', 3],
    ]);
    // vendor 名不分大小写，和网关一样
    expect(rowsInScope(doc(), 'claude').map((r) => r.rule.id)).toEqual(['b', 'c', 'd']);
    // 没有专属规则的 vendor 只过通用的
    expect(rowsInScope(doc(), 'kiro').map((r) => r.rule.id)).toEqual(['b']);
    expect(rowsInScope(doc(), SCOPE_ALL).map((r) => r.rule.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('the vendor list is what the vault reports plus what only the rules mention', () => {
    const scopes = vendorScopes(doc(), [
      { key: 'claude', displayName: 'Claude' },
      { key: 'factory', displayName: 'Factory' },
      { key: 'kiro', displayName: 'Kiro' },
    ]);
    expect(scopes.map((s) => [s.key, s.own, s.unknown])).toEqual([
      ['claude', 2, false],
      ['factory', 2, false],
      ['kiro', 0, false],
    ]);

    const withStray = vendorScopes(
      { rules: [{ id: 'x', label: 'a.b', vendors: ['retired'], when: {} }] },
      [{ key: 'claude', displayName: 'Claude' }],
    );
    expect(withStray.map((s) => [s.key, s.own, s.unknown])).toEqual([
      ['claude', 0, false],
      ['retired', 1, true],
    ]);
  });
});

describe('editing the document', () => {
  it('a new rule goes last; everything else, including keys this page does not know, stays', () => {
    const next = upsertRule(doc(), { id: 'e', label: 'sdk.httpx', when: { field: 'model', op: 'exists' } });
    expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next.channels).toEqual({ factory: { enforce: false } });
  });

  it('editing keeps the position and the keys the form does not own, and drops what the form cleared', () => {
    const before: ClassifierDoc = {
      rules: [
        { id: 'a', label: 'agent.x', vendors: ['factory'], enabled: false, note: 'hand-written', when: { field: 'model', op: 'exists' } },
        { id: 'b', label: 'tavern.y', when: {} },
      ],
    };
    // 表单里把「适用 Vendor」清空、打开了开关：存下去就没有 vendors 和 enabled 这两个键
    const next = upsertRule(before, { id: 'a', label: 'agent.z', when: { field: 'format', op: 'exists' } }, 'a');

    expect(ids(next)).toEqual(['a', 'b']);
    expect(next.rules![0]).toEqual({
      id: 'a',
      label: 'agent.z',
      when: { field: 'format', op: 'exists' },
      note: 'hand-written',
    });
  });

  it('toggling and removing touch one rule only', () => {
    expect(setEnabled(doc(), 'b', false).rules!.map((r) => r.enabled)).toEqual([undefined, false, undefined, undefined]);
    expect(ids(removeRule(doc(), 'c'))).toEqual(['a', 'b', 'd']);
  });

  it('moving swaps with the neighbour in the list being looked at, leaving other vendors alone', () => {
    // 看着 factory：a、b、d。把 d 上移一格是和 b 换；中间那条只管 claude 的 c 不动
    expect(ids(moveRule(doc(), 'factory', 'd', -1))).toEqual(['a', 'd', 'c', 'b']);
    expect(ids(moveRule(doc(), SCOPE_ALL, 'd', -1))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(moveRule(doc(), 'factory', 'a', 1))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('moving past either end changes nothing', () => {
    const d = doc();
    expect(moveRule(d, 'factory', 'a', -1)).toBe(d);
    expect(moveRule(d, 'factory', 'd', 1)).toBe(d);
    expect(moveRule(d, 'factory', 'c', 1)).toBe(d); // c 不在这个范围里
  });

  it('labels follow the gateway format', () => {
    for (const ok of ['agent.claude_code', 'tavern.sillytavern', 'a.b.c', 'phone.unknown']) expect(LABEL_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ['agent', 'Agent.X', 'agent.claude code', 'agent.', '.x', 'agent.x\n', '']) expect(LABEL_PATTERN.test(bad), bad).toBe(false);
  });
});

describe('conditions between the form and the document', () => {
  const cases: [string, unknown][] = [
    ['one comparison', { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' }],
    ['several values', { field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'RikkaHub-'] }],
    ['ignoring case', { field: 'header.origin', op: 'contains', value: 'example', ignoreCase: true }],
    ['no value', { field: 'header.user-agent', op: 'exists' }],
    ['negated', { not: { field: 'header.user-agent', op: 'exists' } }],
    [
      'all of',
      {
        all: [
          { field: 'header.user-agent', op: 'regex', value: '\\((iPhone|iPad);' },
          { not: { field: 'header.user-agent', op: 'contains', value: 'Safari/' } },
        ],
      },
    ],
    [
      'any of',
      {
        any: [
          { field: 'header.x-app', op: 'eq', value: 'cli' },
          { field: 'header.anthropic-beta', op: 'contains', value: 'claude-code-' },
        ],
      },
    ],
  ];

  it.each(cases)('%s survives a round trip unchanged', (_name, when) => {
    const flat = flattenCondition(when);
    expect(flat).not.toBeNull();
    expect(buildCondition(flat!)).toEqual(when);
  });

  it.each([
    ['nested groups', { all: [{ any: [{ field: 'model', op: 'exists' }] }] }],
    ['double negation', { not: { not: { field: 'model', op: 'exists' } } }],
    ['negated group', { not: { any: [{ field: 'model', op: 'exists' }] } }],
    ['an empty group', { all: [] }],
    ['a key this page does not know', { field: 'model', op: 'eq', value: 'x', fuzzy: true }],
    ['a value that is not text', { field: 'model', op: 'eq', value: 3 }],
    ['two shapes at once', { all: [{ field: 'model', op: 'exists' }], field: 'model' }],
    ['nothing', undefined],
  ])('%s is left to the JSON editor', (_name, when) => {
    expect(flattenCondition(when)).toBeNull();
  });

  it('an operator that takes no value writes none, and drops the case flag with it', () => {
    const when = buildCondition({
      mode: 'all',
      rows: [{ negate: false, field: 'model', op: 'exists', values: ['left over'], ignoreCase: true }],
    });
    expect(when).toEqual({ field: 'model', op: 'exists' });
  });

  it('says what is still missing in the form', () => {
    const row = { negate: false, field: 'model', op: 'eq', values: ['x'], ignoreCase: false };
    expect(flatConditionError({ mode: 'all', rows: [] })).toContain('至少');
    expect(flatConditionError({ mode: 'all', rows: [{ ...row, field: '' }] })).toContain('字段');
    expect(flatConditionError({ mode: 'all', rows: [{ ...row, values: [] }] })).toContain('没填值');
    expect(flatConditionError({ mode: 'all', rows: [row, { ...row, values: [] }] })).toContain('第 2 个');
    expect(flatConditionError({ mode: 'all', rows: [{ ...row, op: 'exists', values: [] }] })).toBeNull();
    expect(flatConditionError({ mode: 'all', rows: [row] })).toBeNull();
  });

  it('reads a condition back in plain words', () => {
    expect(describeCondition({ field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' })).toBe(
      '请求头 user-agent 开头是 "claude-cli/"',
    );
    expect(describeCondition({ field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'RikkaHub-'] })).toBe(
      '请求头 user-agent 开头是 "Kelivo" 或 "RikkaHub-"',
    );
    expect(describeCondition({ not: { field: 'header.user-agent', op: 'exists' } })).toBe('请求头 user-agent 没有值');
    expect(
      describeCondition({
        any: [
          { field: 'header.x-app', op: 'eq', value: 'cli' },
          { field: 'model', op: 'contains', value: 'opus', ignoreCase: true },
        ],
      }),
    ).toBe('请求头 x-app 等于 "cli" 或 模型 包含 "opus"（不分大小写）');
    expect(describeCondition({ all: [{ any: [] }] })).toBe('自定义条件（JSON）');
  });
});

describe('problems the vault reports', () => {
  it('are matched to a rule by id, or by position when the rule has none', () => {
    const problems = [
      { subject: "rule 'a'", reason: "Unknown field 'system.head'." },
      { subject: 'rule #2', reason: 'Rule has no id.' },
      { subject: "channel 'factory'", reason: 'Unknown action.' },
    ];
    expect(problemsOfRule(problems, 'a', 0)).toEqual(["Unknown field 'system.head'."]);
    expect(problemsOfRule(problems, '', 2)).toEqual(['Rule has no id.']);
    expect(problemsOfRule(problems, 'b', 1)).toEqual([]);
  });
});
