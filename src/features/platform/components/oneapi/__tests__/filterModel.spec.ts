import { describe, expect, it } from 'vitest';

import {
  CLASSIFIER_ID_PATTERN,
  conditionSources,
  fieldLabel,
  sourceOf,
  RULE_ID_PATTERN,
  blockingUses,
  buildCondition,
  channelOf,
  channelSummary,
  classifierUses,
  conditionError,
  conditionTree,
  describeCondition,
  isCategoryRef,
  moveClassifier,
  moveFilterRule,
  problemsOfChannel,
  problemsOfClassifier,
  problemsOfRule,
  referencedClassifiers,
  refMatches,
  removeChannel,
  removeClassifier,
  removeFilterRule,
  setChannelDefault,
  setChannelEnforce,
  setFilterRuleEnabled,
  upsertClassifier,
  upsertFilterRule,
  vendorList,
  type ConditionGroup,
  type ConditionNode,
  type ConditionRow,
} from '../model/filter';
import type { FilterDoc } from '../model/filter.types';

/**
 * 过滤器的纯逻辑：分类器和各 Vendor 过滤规则的增删改排、条件在表单和文档写法之间来回、说成人话、
 * 把号池后台的问题落到哪一项上。页面怎么用它们在 filterView.spec.ts 里看。
 */

const doc = (): FilterDoc => ({
  classifiers: [
    { id: 'agent.claude', when: { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' } },
    { id: 'chat.app', name: 'Chat', when: { field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'RikkaHub-'] } },
  ],
  filters: {
    Factory: {
      enforce: false,
      rules: [
        { id: 'no-agents', action: 'deny', when: { classifier: 'agent.claude' } },
        { id: 'no-chat', action: 'deny', when: { not: { classifier: ['chat.app'] } }, note: 'keep me' },
      ],
    },
  },
  future: { anything: true },
});

describe('ids', () => {
  it('classifier ids are <category>.<name>, rule ids are anything that fits in an error code', () => {
    expect(CLASSIFIER_ID_PATTERN.test('chat.app')).toBe(true);
    expect(CLASSIFIER_ID_PATTERN.test('tavern.silly_tavern.v2')).toBe(true);
    expect(CLASSIFIER_ID_PATTERN.test('chat')).toBe(false);
    expect(CLASSIFIER_ID_PATTERN.test('Chat.App')).toBe(false);

    expect(RULE_ID_PATTERN.test('no-agents')).toBe(true);
    expect(RULE_ID_PATTERN.test('v1.block_all')).toBe(true);
    expect(RULE_ID_PATTERN.test('-x')).toBe(false);
    expect(RULE_ID_PATTERN.test('No Agents')).toBe(false);
  });
});

describe('conditions', () => {
  it('reads every shape the form can edit, nested groups included, and writes it back unchanged', () => {
    const cases: unknown[] = [
      { classifier: 'chat.app' },
      { classifier: ['chat.app', 'chat.tavern'] },
      { not: { classifier: 'agent.claude' } },
      { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
      { field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'Tavo'], ignoreCase: true },
      { not: { field: 'header.user-agent', op: 'exists' } },
      { field: 'tools.count', op: 'gte', value: 3 },
      { field: 'tools.name', op: 'contains_all', value: ['Bash', 'Read'] },
      { any: [{ classifier: 'chat.app' }, { field: 'header.x-requested-with', op: 'exists' }] },
      // 层级：组里套组、整组取反
      {
        any: [
          { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
          {
            all: [
              { field: 'prompt.system', op: 'contains', value: 'You are Claude Code' },
              { not: { any: [{ field: 'tools.count', op: 'lt', value: 3 }, { field: 'tools.name', op: 'exists' }] } },
            ],
          },
        ],
      },
      { not: { any: [{ classifier: 'chat.app' }, { classifier: 'chat.tavern' }] } },
      // 工具对象：同一个工具的名称、描述、参数
      {
        tool: {
          all: [
            { field: 'name', op: 'eq', value: 'Bash' },
            { field: 'description', op: 'contains', value: 'Executes a given bash command' },
            { field: 'params', op: 'contains_all', value: ['command', 'timeout'] },
          ],
        },
      },
      { not: { tool: { field: 'name', op: 'prefix', value: 'mcp__' } } },
      { all: [{ classifier: 'chat.app' }, { tool: { field: 'description', op: 'contains', value: 'x' } }] },
    ];
    for (const when of cases) {
      const tree = conditionTree(when);
      expect(tree, JSON.stringify(when)).not.toBeNull();
      expect(buildCondition(tree!)).toEqual(when);
    }
  });

  it('leaves shapes it does not know to the JSON editor', () => {
    expect(conditionTree({ all: [{ any: [] }] })).toBeNull();
    expect(conditionTree({ all: [] })).toBeNull();
    expect(conditionTree({ classifier: [] })).toBeNull();
    expect(conditionTree({ classifier: 'a.b', field: 'x' })).toBeNull();
    expect(conditionTree({ field: 'header.x', op: 'eq', value: 1.5 })).toBeNull();
    // 工具对象里面只比这个工具自己的字段：不能引用分类器，不能再套工具对象
    expect(conditionTree({ tool: { classifier: 'chat.app' } })).toBeNull();
    expect(conditionTree({ tool: { tool: { field: 'name', op: 'exists' } } })).toBeNull();
    expect(conditionTree('nope')).toBeNull();
    expect(conditionTree(undefined)).toBeNull();
  });

  it('says what is missing before it goes to the gateway', () => {
    const field = (patch: Partial<ConditionRow & { kind: 'field' }>): ConditionNode => ({
      kind: 'field',
      negate: false,
      field: 'header.origin',
      op: 'eq',
      values: ['x'],
      numeric: false,
      ignoreCase: false,
      ...patch,
    });
    const group = (...children: ConditionNode[]): ConditionGroup => ({ kind: 'group', negate: false, mode: 'all', children });

    expect(conditionError(group())).toBe('有一组里没有条件');
    expect(conditionError(group({ kind: 'classifier', negate: false, classifiers: [] }))).toBe('有条件没选分类器');
    expect(conditionError(group(field({}), group(field({ values: [''] }))))).toBe('有条件没填值');
    expect(conditionError(group(field({ field: 'tools.count', op: 'gte', values: ['2.5'], numeric: true })))).toBe(
      '数量要填整数',
    );
    expect(conditionError(group(field({ op: 'exists', values: [], negate: true })))).toBeNull();
    expect(conditionError(group({ kind: 'tool', negate: false, group: group(field({ field: 'name', values: [] })) }))).toBe(
      '有条件没填值',
    );
  });

  it('finds every classifier a condition refers to, however deep', () => {
    expect(
      referencedClassifiers({
        all: [{ classifier: 'a.b' }, { not: { any: [{ classifier: ['c.d', 'a.b'] }, { field: 'header.x', op: 'exists' }] } }],
      }).sort(),
    ).toEqual(['a.b', 'c.d']);
    expect(referencedClassifiers({ field: 'header.x', op: 'exists' })).toEqual([]);
  });

  it('describes conditions in plain words, nested groups in brackets', () => {
    expect(describeCondition({ classifier: 'chat.app' })).toBe('分类器是 chat.app');
    expect(describeCondition({ classifier: ['chat.app', 'chat.tavern'] })).toBe('分类器是 chat.app 或 chat.tavern');
    expect(describeCondition({ not: { classifier: ['chat.app', 'chat.tavern'] } })).toBe('分类器不是 chat.app 也不是 chat.tavern');
    expect(describeCondition({ field: 'header.user-agent', op: 'prefix', value: ['Kelivo', 'Tavo'], ignoreCase: true })).toBe(
      'user-agent 开头是 "Kelivo" 或 "Tavo"（不分大小写）',
    );
    expect(describeCondition({ not: { field: 'header.user-agent', op: 'exists' } })).toBe('user-agent 没有值');
    expect(
      describeCondition({ all: [{ classifier: 'agent.claude' }, { field: 'header.x-app', op: 'eq', value: 'cli' }] }),
    ).toBe('分类器是 agent.claude 且 x-app 等于 "cli"');
    expect(
      describeCondition({
        any: [
          { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
          {
            all: [
              { field: 'prompt.system', op: 'contains', value: 'You are Claude Code' },
              { field: 'tools.name', op: 'contains_all', value: ['Bash', 'Read'] },
            ],
          },
        ],
      }),
    ).toBe('user-agent 开头是 "claude-cli/" 或 （提示词·系统 包含 "You are Claude Code" 且 工具·名称 全部包含 "Bash" 和 "Read"）');
    expect(describeCondition({ field: 'tools.count', op: 'gte', value: 3 })).toBe('工具·数量 至少 3');
    expect(describeCondition({ not: { any: [{ classifier: 'chat.app' }, { classifier: 'chat.tavern' }] } })).toBe(
      '不满足（分类器是 chat.app 或 分类器是 chat.tavern）',
    );
    expect(
      describeCondition({
        tool: { all: [{ field: 'name', op: 'eq', value: 'Bash' }, { field: 'description', op: 'contains', value: 'bash command' }] },
      }),
    ).toBe('有工具（名称 等于 "Bash" 且 描述 包含 "bash command"）');
    expect(describeCondition({ not: { tool: { field: 'params', op: 'contains_all', value: ['command', 'timeout'] } } })).toBe(
      '没有工具（参数 全部包含 "command" 和 "timeout"）',
    );
    expect(describeCondition({ all: [{ any: [] }] })).toBe('自定义条件（JSON）');
  });
});

describe('where a condition reads from', () => {
  it('names fields as people say them: a header is its name, the rest are 来源·层级', () => {
    expect(fieldLabel('header.user-agent')).toBe('user-agent');
    expect(fieldLabel('prompt.system')).toBe('提示词·系统');
    expect(fieldLabel('prompt.user')).toBe('提示词·用户');
    expect(fieldLabel('tools.name')).toBe('工具·名称');
    // 网关以后多报的，这里还不认识，原样显示
    expect(fieldLabel('messages.count')).toBe('messages·count');
  });

  it('groups the fields the gateway offers into sources, each with its levels', () => {
    expect(sourceOf('header.origin')).toBe('header');
    expect(sourceOf('prompt.assistant')).toBe('prompt');
    expect(
      conditionSources([
        { name: 'header.user-agent', kind: 'text' },
        { name: 'header.origin', kind: 'text' },
        { name: 'prompt.system', kind: 'text' },
        { name: 'prompt.user', kind: 'text' },
        { name: 'tools.name', kind: 'set' },
        { name: 'tools.count', kind: 'number' },
      ]),
    ).toEqual([
      {
        key: 'header',
        label: '请求头',
        levels: [
          { field: 'header.user-agent', label: 'user-agent', kind: 'text' },
          { field: 'header.origin', label: 'origin', kind: 'text' },
        ],
      },
      {
        key: 'prompt',
        label: '提示词',
        levels: [
          { field: 'prompt.system', label: '系统', kind: 'text' },
          { field: 'prompt.user', label: '用户', kind: 'text' },
        ],
      },
      {
        key: 'tools',
        label: '工具',
        levels: [
          { field: 'tools.name', label: '名称', kind: 'set' },
          { field: 'tools.count', label: '数量', kind: 'number' },
        ],
      },
    ]);
  });
});

describe('classifiers', () => {
  it('adds at the end, edits in place keeping keys the form does not manage, moves and removes', () => {
    let d = upsertClassifier(doc(), { id: 'chat.tavern', when: { field: 'header.origin', op: 'exists' } });
    expect(d.classifiers!.map((c) => c.id)).toEqual(['agent.claude', 'chat.app', 'chat.tavern']);

    d = { ...d, classifiers: d.classifiers!.map((c) => (c.id === 'chat.app' ? { ...c, extra: 1 } : c)) };
    d = upsertClassifier(d, { id: 'chat.app', when: { field: 'header.origin', op: 'exists' } }, 'chat.app');
    expect(d.classifiers![1]).toEqual({ id: 'chat.app', when: { field: 'header.origin', op: 'exists' }, extra: 1 });

    d = moveClassifier(d, 'chat.tavern', -1);
    expect(d.classifiers!.map((c) => c.id)).toEqual(['agent.claude', 'chat.tavern', 'chat.app']);
    expect(moveClassifier(d, 'agent.claude', -1)).toBe(d);

    d = removeClassifier(d, 'chat.tavern');
    expect(d.classifiers!.map((c) => c.id)).toEqual(['agent.claude', 'chat.app']);
    // 文档里别的东西不动
    expect(d.filters).toEqual(doc().filters);
    expect(d.future).toEqual({ anything: true });
  });

  it('knows which filter rules use a classifier', () => {
    expect(classifierUses(doc(), 'agent.claude')).toEqual([{ vendor: 'Factory', ruleId: 'no-agents' }]);
    expect(classifierUses(doc(), 'chat.app')).toEqual([{ vendor: 'Factory', ruleId: 'no-chat' }]);
    expect(classifierUses(doc(), 'chat.tavern')).toEqual([]);
  });

  /** factory 不收任何 agent：一条规则写 agent.*，三个 agent 分类器都算被它引用。 */
  const agentsDoc = (): FilterDoc => ({
    classifiers: [
      { id: 'agent.claude', when: { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' } },
      { id: 'agent.codex', when: { field: 'header.originator', op: 'prefix', value: 'codex_' } },
      { id: 'chat.app', when: { field: 'header.user-agent', op: 'prefix', value: 'Kelivo' } },
    ],
    filters: { factory: { enforce: true, rules: [{ id: 'no-agents', action: 'deny', when: { classifier: 'agent.*' } }] } },
  });

  it('a whole-category reference (agent.*) counts as using every classifier in it, and only those', () => {
    expect(isCategoryRef('agent.*')).toBe(true);
    expect(isCategoryRef('agent')).toBe(false);
    expect(isCategoryRef('*')).toBe(false);
    expect(isCategoryRef('agent*')).toBe(false);
    expect(refMatches('agent.*', 'agent.codex')).toBe(true);
    expect(refMatches('agent.*', 'agents.x')).toBe(false);

    expect(classifierUses(agentsDoc(), 'agent.codex')).toEqual([{ vendor: 'factory', ruleId: 'no-agents', via: 'agent.*' }]);
    expect(classifierUses(agentsDoc(), 'chat.app')).toEqual([]);
  });

  it('deleting one of a category a rule refers to as a whole is fine, the last one is not', () => {
    // 规则还认得 agent.claude，删 agent.codex 不拦
    expect(blockingUses(agentsDoc(), 'agent.codex')).toEqual([]);
    // 只剩 agent.claude 一个时，删它会让 agent.* 一个都对不上
    const lastOne = removeClassifier(agentsDoc(), 'agent.codex');
    expect(blockingUses(lastOne, 'agent.claude')).toEqual([{ vendor: 'factory', ruleId: 'no-agents', via: 'agent.*' }]);
    // 点名引用的照样拦
    expect(blockingUses(doc(), 'agent.claude')).toEqual([{ vendor: 'Factory', ruleId: 'no-agents' }]);
  });

  it('says a whole-category reference in words', () => {
    expect(describeCondition({ classifier: 'agent.*' })).toBe('分类器是 agent 类任一');
    expect(describeCondition({ classifier: ['agent.*', 'chat.app'] })).toBe('分类器是 agent 类任一 或 chat.app');
  });
});

describe('filters', () => {
  it('fills in what the gateway assumes: no filter takes everything, a filter without enforce only observes', () => {
    expect(channelOf(doc(), 'kiro')).toEqual({
      vendor: 'kiro',
      key: 'kiro',
      exists: false,
      defaultAction: 'allow',
      enforce: false,
      rules: [],
    });
    // vendor 不分大小写，文档里写成什么就认什么
    const factory = channelOf(doc(), 'factory');
    expect(factory).toMatchObject({ key: 'Factory', exists: true, enforce: false, defaultAction: 'allow' });
    expect(factory.rules.map((r) => r.id)).toEqual(['no-agents', 'no-chat']);

    // 没写 enforce 就是观察；要过滤得明确写 true
    expect(channelOf({ filters: { kiro: { default: 'deny' } } }, 'kiro')).toMatchObject({ enforce: false, defaultAction: 'deny' });
    expect(channelOf({ filters: { kiro: { enforce: true } } }, 'kiro')).toMatchObject({ enforce: true, defaultAction: 'allow' });
  });

  it('a new filter starts as mark-only and allowing', () => {
    const d = upsertFilterRule({}, 'kiro', { id: 'r', action: 'deny', when: { classifier: 'chat.app' } });
    expect(d.filters).toEqual({
      kiro: { default: 'allow', enforce: false, rules: [{ id: 'r', action: 'deny', when: { classifier: 'chat.app' } }] },
    });
  });

  it('edits the key as written in the document and keeps keys the form does not manage', () => {
    let d = upsertFilterRule(doc(), 'factory', { id: 'no-chat', action: 'allow', when: { classifier: 'chat.app' } }, 'no-chat');
    expect(d.filters!.Factory!.rules![1]).toEqual({ id: 'no-chat', action: 'allow', when: { classifier: 'chat.app' }, note: 'keep me' });
    expect(Object.keys(d.filters!)).toEqual(['Factory']);

    d = setFilterRuleEnabled(d, 'factory', 'no-agents', false);
    expect(d.filters!.Factory!.rules![0]!.enabled).toBe(false);

    d = moveFilterRule(d, 'factory', 'no-chat', -1);
    expect(d.filters!.Factory!.rules!.map((r) => r.id)).toEqual(['no-chat', 'no-agents']);
    expect(moveFilterRule(d, 'factory', 'no-agents', 1)).toBe(d);

    d = removeFilterRule(d, 'factory', 'no-chat');
    expect(d.filters!.Factory!.rules!.map((r) => r.id)).toEqual(['no-agents']);

    d = setChannelDefault(setChannelEnforce(d, 'factory', true), 'factory', 'deny');
    expect(d.filters!.Factory).toMatchObject({ default: 'deny', enforce: true });

    d = removeChannel(d, 'factory');
    expect(d.filters).toEqual({});
    expect(d.classifiers).toEqual(doc().classifiers);
  });

  it('summarises a vendor in one line', () => {
    expect(channelSummary(channelOf(doc(), 'kiro'))).toBe('没有规则，什么都收');
    expect(channelSummary(channelOf(doc(), 'factory'))).toBe('2 条规则 · 默认放行 · 观察');
    expect(channelSummary(channelOf({ filters: { kiro: { default: 'deny' } } }, 'kiro'))).toBe('没有规则 · 默认拒绝 · 观察');
  });

  it('lists the registered vendors plus any only the filters know about', () => {
    const vendors = [
      { key: 'factory', displayName: 'Factory' },
      { key: 'kiro', displayName: 'Kiro' },
    ];
    expect(vendorList({ filters: { FACTORY: {}, retired: {} } }, vendors)).toEqual([
      { key: 'factory', displayName: 'Factory', unknown: false },
      { key: 'kiro', displayName: 'Kiro', unknown: false },
      { key: 'retired', displayName: 'retired', unknown: true },
    ]);
  });
});

describe('problems from the vault', () => {
  const problems = [
    { subject: "classifier 'chat.app'", reason: 'a' },
    { subject: 'classifier #2', reason: 'b' },
    { subject: "filter 'Factory'", reason: 'c' },
    { subject: "filter 'Factory' rule 'no-chat'", reason: 'd' },
    { subject: "filter 'Factory' rule #3", reason: 'e' },
    { subject: "filter 'Factory2' rule 'no-chat'", reason: 'f' },
    { subject: 'document', reason: 'g' },
  ];

  it('lands each on the classifier, rule or filter it is about', () => {
    expect(problemsOfClassifier(problems, 'chat.app', 1)).toEqual(['a']);
    expect(problemsOfClassifier(problems, '', 2)).toEqual(['b']);
    expect(problemsOfRule(problems, 'Factory', 'no-chat', 1)).toEqual(['d']);
    expect(problemsOfRule(problems, 'Factory', '', 3)).toEqual(['e']);
    expect(problemsOfChannel(problems, 'Factory').map((p) => p.reason)).toEqual(['c', 'd', 'e']);
    expect(problemsOfChannel(problems, 'kiro')).toEqual([]);
  });
});
