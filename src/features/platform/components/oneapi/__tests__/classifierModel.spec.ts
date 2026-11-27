import { describe, expect, it } from 'vitest';

import {
  LABEL_PATTERN,
  MATCH_ANY_LABEL,
  MATCH_UNLABELLED,
  SCOPE_ALL,
  addChannelEntry,
  buildCondition,
  channelOf,
  channelSummary,
  channelVerdict,
  describeMatch,
  isValidMatch,
  matchCovers,
  matchOptions,
  moveChannelEntry,
  removeChannel,
  setChannelEnforce,
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
    { id: 'a', label: 'agent.claude_code', vendors: ['factory'], when: { field: 'header.user-agent', op: 'exists' } },
    { id: 'b', label: 'tavern.sillytavern', when: { field: 'header.user-agent', op: 'exists' } },
    { id: 'c', label: 'agent.claude_own', vendors: ['Claude'], when: { field: 'header.user-agent', op: 'exists' } },
    { id: 'd', label: 'chat.app', vendors: ['claude', 'factory'], when: { field: 'header.user-agent', op: 'exists' } },
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
    const next = upsertRule(doc(), { id: 'e', label: 'sdk.httpx', when: { field: 'header.user-agent', op: 'exists' } });
    expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next.channels).toEqual({ factory: { enforce: false } });
  });

  it('editing keeps the position and the keys the form does not own, and drops what the form cleared', () => {
    const before: ClassifierDoc = {
      rules: [
        { id: 'a', label: 'agent.x', vendors: ['factory'], enabled: false, note: 'hand-written', when: { field: 'header.user-agent', op: 'exists' } },
        { id: 'b', label: 'tavern.y', when: {} },
      ],
    };
    // 表单里把「适用 Vendor」清空、打开了开关：存下去就没有 vendors 和 enabled 这两个键
    const next = upsertRule(before, { id: 'a', label: 'agent.z', when: { field: 'header.origin', op: 'exists' } }, 'a');

    expect(ids(next)).toEqual(['a', 'b']);
    expect(next.rules![0]).toEqual({
      id: 'a',
      label: 'agent.z',
      when: { field: 'header.origin', op: 'exists' },
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
    ['nested groups', { all: [{ any: [{ field: 'header.user-agent', op: 'exists' }] }] }],
    ['double negation', { not: { not: { field: 'header.user-agent', op: 'exists' } } }],
    ['negated group', { not: { any: [{ field: 'header.user-agent', op: 'exists' }] } }],
    ['an empty group', { all: [] }],
    ['a key this page does not know', { field: 'header.user-agent', op: 'eq', value: 'x', fuzzy: true }],
    ['a value that is not text', { field: 'header.user-agent', op: 'eq', value: 3 }],
    ['two shapes at once', { all: [{ field: 'header.user-agent', op: 'exists' }], field: 'header.user-agent' }],
    ['nothing', undefined],
  ])('%s is left to the JSON editor', (_name, when) => {
    expect(flattenCondition(when)).toBeNull();
  });

  it('an operator that takes no value writes none, and drops the case flag with it', () => {
    const when = buildCondition({
      mode: 'all',
      rows: [{ negate: false, field: 'header.user-agent', op: 'exists', values: ['left over'], ignoreCase: true }],
    });
    expect(when).toEqual({ field: 'header.user-agent', op: 'exists' });
  });

  it('says what is still missing in the form', () => {
    const row = { negate: false, field: 'header.user-agent', op: 'eq', values: ['x'], ignoreCase: false };
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
          { field: 'header.origin', op: 'contains', value: 'example', ignoreCase: true },
        ],
      }),
    ).toBe('请求头 x-app 等于 "cli" 或 请求头 origin 包含 "example"（不分大小写）');
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

describe('channel rules', () => {
  const withChannel = (): ClassifierDoc => ({
    rules: [
      { id: 'a', label: 'agent.claude_code', when: {} },
      { id: 'b', label: 'agent.codex', when: {} },
      { id: 'c', label: 'chat.app', when: {} },
    ],
    channels: {
      Claude: {
        default: 'allow',
        rules: [
          { match: 'agent.claude_code', action: 'allow' },
          { match: 'agent.*', action: 'deny' },
        ],
        note: 'hand-written',
      },
    },
  });

  it('a match is a label, a class, everything recognised, or what was not recognised', () => {
    for (const ok of ['chat.app', 'agent.*', 'agent.claude_*', '*', 'unlabeled']) expect(isValidMatch(ok), ok).toBe(true);
    for (const bad of ['', 'agent', '*agent', 'Agent.*', 'a b', 'agent.**x']) expect(isValidMatch(bad), bad).toBe(false);

    expect(matchCovers('agent.*', 'agent.codex')).toBe(true);
    expect(matchCovers('agent.*', 'chat.app')).toBe(false);
    expect(matchCovers('chat.app', 'chat.app')).toBe(true);
    // 「所有被认出来的」不包括没被认出来的；后者只有 unlabeled 点得到
    expect(matchCovers(MATCH_ANY_LABEL, 'chat.app')).toBe(true);
    expect(matchCovers(MATCH_ANY_LABEL, null)).toBe(false);
    expect(matchCovers(MATCH_UNLABELLED, null)).toBe(true);
    expect(matchCovers(MATCH_UNLABELLED, 'chat.app')).toBe(false);
  });

  it('the first entry that matches decides; nothing matching falls to the default', () => {
    // vendor 名不分大小写：文档里写的是 Claude
    const view = channelOf(withChannel(), 'claude');
    expect(view).toMatchObject({ exists: true, defaultAction: 'allow', enforce: true });

    expect(channelVerdict(view, 'agent.claude_code')).toBe('allow'); // 排在前面的例外
    expect(channelVerdict(view, 'agent.codex')).toBe('deny');
    expect(channelVerdict(view, 'chat.app')).toBe('allow');
    expect(channelVerdict(view, null)).toBe('allow');

    expect(channelVerdict(channelOf({ channels: { x: { default: 'deny' } } }, 'x'), null)).toBe('deny');
  });

  it('a vendor with no channel rules takes everything', () => {
    const view = channelOf(withChannel(), 'factory');
    expect(view).toMatchObject({ exists: false, defaultAction: 'allow', enforce: false, entries: [] });
    expect(channelVerdict(view, 'agent.codex')).toBe('allow');
    expect(channelSummary(view)).toBe('没有规则，什么都收');
  });

  it('the first entry for a vendor creates its rules as mark-only', () => {
    const next = addChannelEntry(withChannel(), 'factory', { match: 'agent.*', action: 'deny' });
    expect(next.channels!.factory).toEqual({ default: 'allow', enforce: false, rules: [{ match: 'agent.*', action: 'deny' }] });
    // 别的 Vendor 和分类规则都没动
    expect(next.channels!.Claude).toEqual(withChannel().channels!.Claude);
    expect(next.rules).toEqual(withChannel().rules);
  });

  it('changes go to the key the document already uses, and keep what this page does not know', () => {
    const next = setChannelEnforce(withChannel(), 'claude', false);
    expect(Object.keys(next.channels!)).toEqual(['Claude']);
    expect(next.channels!.Claude).toMatchObject({ enforce: false, note: 'hand-written' });

    const moved = moveChannelEntry(withChannel(), 'claude', 1, -1);
    expect(moved.channels!.Claude!.rules!.map((e) => e.match)).toEqual(['agent.*', 'agent.claude_code']);
    const d = withChannel();
    expect(moveChannelEntry(d, 'claude', 0, -1)).toBe(d);

    expect(removeChannel(withChannel(), 'CLAUDE').channels).toEqual({});
    expect(removeChannel(d, 'factory')).toBe(d);
  });

  it('offers the classes and labels the classifier rules produce', () => {
    expect(matchOptions(withChannel())).toEqual([
      'agent.*',
      'chat.*',
      'agent.claude_code',
      'agent.codex',
      'chat.app',
      '*',
      'unlabeled',
    ]);
  });

  it('says a match and a vendor summary in plain words', () => {
    expect(describeMatch('agent.*')).toBe('agent 这一类');
    expect(describeMatch('agent.claude_*')).toBe('标签以 agent.claude_ 开头的');
    expect(describeMatch('*')).toBe('所有被认出来的请求');
    expect(describeMatch('unlabeled')).toBe('没被认出来的请求');
    expect(describeMatch('chat.app')).toBe('chat.app');

    expect(channelSummary(channelOf(withChannel(), 'claude'))).toBe('拒绝 1 类 · 执行中');
    expect(channelSummary(channelOf({ channels: { x: { default: 'deny', enforce: false } } }, 'x'))).toBe('默认拒绝 · 只标记');
    expect(channelSummary(channelOf({ channels: { x: { enforce: false, rules: [{ match: 'chat.app', action: 'allow' }] } } }, 'x'))).toBe(
      '没有拒绝的 · 只标记',
    );
  });
});
