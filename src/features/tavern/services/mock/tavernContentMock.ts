/**
 * 内容管理 Mock：两个账户、三个世界（一个已删）、五张角色卡（一张已删）。
 * 雾港谜案是满配的：世界书分组 + 设定、规则书两个变量一条规则、运行态、纪事、心理节拍，
 * 场景频道里有一条几个人轮流说、带心声的角色消息；天州市·冬什么都还没有，看空态。
 *
 * Mock 扮演服务端：删除、清空、遗忘都改这里的状态，统计数现算，刷新列表能看到变化。
 */
import type { z } from 'zod';

import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  worldDetailSchema,
  type AccountRef,
  type ActionResult,
  type Beat,
  type BeatQuery,
  type ChronicleEntry,
  type ContentQuery,
  type LifecycleState,
  type MemoryItem,
  type MessageContent,
  type MessageRole,
  type MessageRow,
  type MessageSource,
  type MessageStatus,
  type PageQuery,
  type PersonaDetail,
  type PersonaRef,
  type PersonaRow,
  type SessionKey,
  type SessionKind,
  type SessionMemory,
  type SessionRow,
  type WorldDetail,
  type WorldKey,
  type WorldRow,
  type WorldRuntime,
  type WorldSettings,
  type rulebookDocumentSchema,
  type worldBookDocumentSchema,
} from '../../model/content.types';
import type { TavernContentPort } from '../ports/tavernContentPort';
import { pageOf } from './tavernMeteringMockData';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now();

/** 固定种子出的 uuid 形状 id：刷新页面不变，和真 id 一样能复制、能搜。 */
function mockUuid(seed: number): string {
  let h = (seed * 2654435761) >>> 0;
  let s = '';
  for (let i = 0; i < 32; i += 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    s += (h & 15).toString(16);
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

// ─── 账户与角色卡 ────────────────────────────────────────

const LINXIA: AccountRef = { uid: 100002333, displayName: '林夏', email: 'linxia@example.com', phone: null };
const PLAYER_0123: AccountRef = { uid: 100000123, displayName: null, email: 'player0123@example.com', phone: '138****0123' };

interface MockPersona {
  id: number;
  account: AccountRef;
  name: string;
  avatar: string | null;
  tagline: string | null;
  tags: string[];
  greetings: string[];
  card: { id: string; version: number | null } | null;
  preset: Record<string, unknown>;
  worldBook: unknown[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

const personas: MockPersona[] = [
  {
    id: 10000008,
    account: LINXIA,
    name: '沈惟行',
    avatar: null,
    tagline: '雾港警署的年轻督察，话少，记性好得吓人。',
    tags: ['推理', '克制', '警察', '雾港'],
    greetings: [
      '“又是你。”他把伞收起来，雨水顺着伞尖滴到地板上。“这次又看见什么了？”',
      '他靠在警署门口的柱子上抽烟，看见你过来，把烟掐了。“码头那边出事了，跟我走一趟。”',
    ],
    card: { id: 'card_7f3a91c2', version: 3 },
    preset: {
      systemPrompt:
        '你是沈惟行，雾港警署督察，二十九岁。\n- 说话简短，很少用形容词\n- 对细节过目不忘，会在不经意间点出别人忽略的东西\n- 父亲二十年前死于一场码头火灾，你从不主动提起',
      personality: '冷静、克制、嘴硬心软',
      scenario: '雾港常年起雾，三号码头最近接连有货船失踪。',
      exampleDialogue: ['<START>', '{{user}}: 你怎么知道我来过？', '{{char}}: 你鞋底的煤灰，只有三号码头有。'],
    },
    worldBook: [
      { keys: ['父亲', '火灾'], content: '沈惟行的父亲沈仲是当年三号码头的仓库管理员，死于 2006 年的大火。', constant: false },
      { keys: ['警署'], content: '雾港警署在旧城区钟楼对面，三层灰楼。', constant: true },
    ],
    createdAt: NOW - 42 * DAY,
    updatedAt: NOW - 2 * DAY,
    deletedAt: null,
  },
  {
    id: 10000009,
    account: LINXIA,
    name: '苏晚',
    avatar: null,
    tagline: '码头茶馆老板娘，消息比谁都灵通。',
    tags: ['茶馆', '八卦', '温柔'],
    greetings: ['“来啦？”她往你面前推了一杯热茶，“今天雾大，船都没出去，坐一会儿吧。”'],
    card: { id: 'card_1b6d0e44', version: null },
    preset: {
      systemPrompt: '你是苏晚，苏记茶馆的老板娘。说话带点南方口音，爱笑，记得每个熟客的口味。',
      personality: '圆滑、热心、藏着心事',
    },
    worldBook: [],
    createdAt: NOW - 40 * DAY,
    updatedAt: NOW - 6 * DAY,
    deletedAt: null,
  },
  {
    id: 10000010,
    account: LINXIA,
    name: '陆川',
    avatar: null,
    tagline: '退休的灯塔守夜人，喝醉了会讲二十年前的沉船。',
    tags: ['老人', '灯塔', '酒鬼'],
    greetings: ['“年轻人，”他晃了晃酒瓶，“你听说过‘海燕号’吗？”'],
    card: null,
    preset: { systemPrompt: '你是陆川，六十七岁，在雾港灯塔守了三十年夜。' },
    worldBook: [],
    createdAt: NOW - 39 * DAY,
    updatedAt: NOW - 20 * DAY,
    deletedAt: null,
  },
  {
    id: 10000011,
    account: PLAYER_0123,
    name: '小满',
    avatar: null,
    tagline: '会说话的橘猫，只在下雨天开口。',
    tags: ['猫', '治愈'],
    greetings: ['“喵——今天也下雨了呢。”'],
    card: null,
    preset: { persona: '一只胖橘猫，懒，嘴馋，偶尔说出很有哲理的话。' },
    worldBook: [],
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 9 * DAY,
    deletedAt: null,
  },
  {
    id: 10000012,
    account: PLAYER_0123,
    name: '测试角色',
    avatar: null,
    tagline: null,
    tags: [],
    greetings: [],
    card: null,
    preset: {},
    worldBook: [],
    createdAt: NOW - 28 * DAY,
    updatedAt: NOW - 27 * DAY,
    deletedAt: NOW - 27 * DAY,
  },
];

function personaRef(id: number): PersonaRef {
  const p = personas.find((x) => x.id === id);
  if (!p) throw new Error(`mock persona ${id} missing`);
  return { id: p.id, name: p.name, avatar: p.avatar };
}

// ─── 世界、频道、消息 ────────────────────────────────────

interface MockMember {
  personaId: number;
  displayOrder: number;
  joinedAt: number;
  leftAt: number | null;
  dmSessionId: string;
}

interface MockSession {
  id: string;
  kind: SessionKind;
  title: string | null;
  personaId: number | null;
  createdAt: number;
  deletedAt: number | null;
  summary: { text: string; coveredUntilSeq: number; updatedAt: number } | null;
  stateCard: Record<string, unknown> | null;
}

interface MockWorld {
  id: string;
  account: AccountRef;
  title: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  settings: WorldSettings;
  worldBook: { version: number; document: z.input<typeof worldBookDocumentSchema>; updatedAt: number } | null;
  rulebook: { version: number; document: z.input<typeof rulebookDocumentSchema>; updatedAt: number } | null;
  members: MockMember[];
  sessions: MockSession[];
  runtime: WorldRuntime | null;
}

const FOG_ID = 'b3c1f0a2-6d4e-4f7a-9c21-5e8d7a6b4c10';
const WINTER_ID = '7c1e0d52-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OLD_ID = '2a9d6c13-0b7e-4f58-8a3d-91c4e2f7b605';

const S = {
  dmShen: '23c97d30-c8a6-4920-bd78-4c244bac6328',
  dmSu: '5f0e2b71-93ad-4c0e-b1f2-7a8c4d6e9b13',
  dmLu: '8d4a1c05-6e2f-4b97-a3c8-0f5e7d1b2c46',
  news: 'c2e7a9f4-1d3b-4a65-8e0c-6b9f2d4a7e18',
  director: 'e91b3f60-7c2d-4e8a-b5f1-3a0d6c9e2b74',
  scene: '4b8f2e19-5a7c-4d03-9e6b-1c2f8a0d5e37',
  group: '9a3c5e70-2b8d-4f16-a7e9-5d0b3c1f8a62',
  winterDm: '61e0d8b3-4f2a-4c79-b8e5-2d7a9f1c0e43',
  winterDirector: '0f7b4d26-8e1c-4a35-9d6f-b2e8c5a1d790',
  oldDm: 'd5c2a8e1-3b9f-4e60-a4d7-8f1b6e0c3a95',
};

const fog: MockWorld = {
  id: FOG_ID,
  account: LINXIA,
  title: '雾港谜案',
  createdAt: NOW - 38 * DAY,
  updatedAt: NOW - 3 * HOUR,
  deletedAt: null,
  settings: {
    preset: {
      systemPrompt:
        '你是雾港世界的叙述者。\n- 用第三人称、过去时\n- 每次回复不超过 300 字\n- 不替玩家说话、不替玩家做决定\n- 雾、潮湿、煤灰是这座城市的底色，适当带出来',
      style: 'noir',
      depthPrompts: [{ depth: 4, role: 'system', content: '记住：真凶的身份只有导演知道。' }],
    },
    completion: { temperature: 0.9, topP: 0.95, maxTokens: 1200 },
    pipelineModels: { dialogue: 'kiro/claude-opus-5.5', showrunner: 'kiro/claude-opus-4.6', wake: 'neko/gpt-5-mini' },
  },
  worldBook: {
    version: 7,
    updatedAt: NOW - 2 * DAY,
    document: {
      version: 3,
      nodes: [
        { id: 'geo', type: 'group', title: '地理', order: 0 },
        {
          id: 'wugang',
          type: 'lore',
          parent: 'geo',
          title: '雾港',
          order: 0,
          content: '雾港是一座常年起雾的海港城，北边是老厂区，南边是新修的商埠。城里的人习惯用钟楼的钟声报时。',
        },
        {
          id: 'dock3',
          type: 'lore',
          parent: 'geo',
          title: '三号码头',
          order: 1,
          content: '三号码头是雾港最老的码头，夜里只有一盏灯。二十年前的那场大火之后，仓库重建过一次。',
          activation: { mode: 'keyword', keywords: ['码头', '三号', '货单'], scanDepth: 3 },
        },
        { id: 'factions', type: 'group', title: '势力', order: 1 },
        {
          id: 'police',
          type: 'lore',
          parent: 'factions',
          title: '雾港警署',
          content: '警署在旧城区钟楼对面，三层灰楼。署长姓周，快退休了，不想惹事。',
        },
        {
          id: 'smugglers',
          type: 'lore',
          parent: 'factions',
          title: '走私团伙',
          enabled: false,
          when: "world.case_stage != 'solved'",
          probability: 60,
          content: '一伙人借着雾天在三号码头卸货，货单都改过。领头的人从不露面。',
          activation: { mode: 'keyword', keywords: ['走私', '卸货'], also: ['夜里'], match: 'all', scanDepth: 2 },
        },
        { id: 'winter', type: 'group', title: '冬季', order: 2, when: "world.season == 'winter'", audience: 'all' },
        {
          id: 'fog_closure',
          type: 'lore',
          parent: 'winter',
          title: '大雾封港',
          content: '入冬后大雾经常一连几天不散，港务局会挂黑旗封港，所有船只停航。',
          activation: { mode: 'semantic' },
        },
        {
          id: 'culprit',
          type: 'lore',
          title: '真凶',
          order: 3,
          audience: 'director',
          content: '二十年前纵火的人是苏晚的父亲苏振海。苏晚知道，一直在替他还债。',
        },
      ],
    },
  },
  rulebook: {
    version: 4,
    updatedAt: NOW - 5 * DAY,
    document: {
      version: 1,
      variables: [
        {
          key: 'case_stage',
          scope: 'world',
          type: 'enum',
          label: '案件进度',
          values: ['open', 'suspect', 'solved'],
          default: 'open',
          visible: true,
        },
        {
          key: 'trust',
          scope: 'character',
          type: 'int',
          label: '信任度',
          min: 0,
          max: 100,
          default: 50,
          visible: true,
          actorAdjust: 10,
        },
      ],
      rules: [
        {
          id: 'morning_tea',
          title: '工作日早上在茶馆碰面',
          enabled: true,
          priority: 1,
          on: { clock: '08:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          with: { a: 10000008 },
          if: 'a.trust >= 60',
          do: [
            { move: { who: 'a', to: '苏记茶馆' } },
            { wake: { who: 'a', intent: '去茶馆坐一会儿，顺便打听码头的消息' } },
          ],
          cooldown: '20h',
        },
      ],
    },
  },
  members: [
    { personaId: 10000008, displayOrder: 0, joinedAt: NOW - 38 * DAY, leftAt: null, dmSessionId: S.dmShen },
    { personaId: 10000009, displayOrder: 1, joinedAt: NOW - 37 * DAY, leftAt: null, dmSessionId: S.dmSu },
    { personaId: 10000010, displayOrder: 2, joinedAt: NOW - 37 * DAY, leftAt: NOW - 12 * DAY, dmSessionId: S.dmLu },
  ],
  sessions: [
    {
      id: S.dmShen,
      kind: 'dm',
      title: null,
      personaId: 10000008,
      createdAt: NOW - 38 * DAY,
      deletedAt: null,
      summary: {
        text: '林夏在三号码头捡到一张被改过的货单，交给了沈惟行。沈惟行认出上面的笔迹和二十年前仓库的账本一样，但没说出来。两人约好周五夜里去码头蹲守。',
        coveredUntilSeq: 30,
        updatedAt: NOW - 1 * DAY,
      },
      stateCard: {
        关系: '搭档',
        好感: '信任，但还有戒心',
        当前地点: '雾港警署',
        心情: '疲惫，专注',
        已知线索: ['货单被改过', '笔迹与旧账本一致'],
        受伤: false,
      },
    },
    {
      id: S.dmSu,
      kind: 'dm',
      title: null,
      personaId: 10000009,
      createdAt: NOW - 37 * DAY,
      deletedAt: null,
      summary: null,
      stateCard: { 关系: '熟客', 当前地点: '苏记茶馆' },
    },
    {
      id: S.dmLu,
      kind: 'dm',
      title: null,
      personaId: 10000010,
      createdAt: NOW - 37 * DAY,
      deletedAt: null,
      summary: null,
      stateCard: null,
    },
    { id: S.news, kind: 'world', title: '雾港晨报', personaId: null, createdAt: NOW - 38 * DAY, deletedAt: null, summary: null, stateCard: null },
    { id: S.director, kind: 'system', title: '导演席', personaId: null, createdAt: NOW - 38 * DAY, deletedAt: null, summary: null, stateCard: null },
    {
      id: S.scene,
      kind: 'scene',
      title: '码头 · 苏记茶馆',
      personaId: null,
      createdAt: NOW - 20 * DAY,
      deletedAt: null,
      summary: {
        text: '雨夜，茶馆里只剩林夏、沈惟行和苏晚。苏晚提到海燕号时手抖了一下。',
        coveredUntilSeq: 4,
        updatedAt: NOW - 4 * HOUR,
      },
      stateCard: null,
    },
    {
      id: S.group,
      kind: 'private_group',
      title: '蹲守小组',
      personaId: null,
      createdAt: NOW - 15 * DAY,
      deletedAt: NOW - 10 * DAY,
      summary: null,
      stateCard: null,
    },
  ],
  runtime: {
    overview:
      '雾港，三月。连续第五天大雾，港务局挂了黑旗。三号码头接连有货船在雾里失踪，警署督察沈惟行接手调查。\n码头边的苏记茶馆是消息最灵通的地方；老灯塔守夜人陆川已经搬去了北区。',
    storyClockIso: '2026-03-14T21:40:00',
    events: [
      { id: mockUuid(9002), atIso: '2026-03-15T02:00:00', title: '码头夜间卸货', note: '只有导演知道' },
      { id: mockUuid(9003), atIso: '2026-03-16T09:00:00', title: '港务局解除封港', note: null },
    ],
    places: [
      { id: mockUuid(9101), name: '雾港警署', zone: '旧城区', note: null },
      { id: mockUuid(9102), name: '苏记茶馆', zone: '码头', note: '二楼是苏晚的住处' },
      { id: mockUuid(9103), name: '三号码头', zone: '码头', note: null },
      { id: mockUuid(9104), name: '灯塔', zone: '北区', note: '已停用' },
    ],
    variables: [
      { name: 'case_stage', values: [{ persona: null, value: 'suspect' }] },
      {
        name: 'trust',
        values: [
          { persona: personaRef(10000008), value: '72' },
          { persona: personaRef(10000009), value: '55' },
          { persona: personaRef(10000010), value: '40' },
        ],
      },
    ],
  },
};

const winter: MockWorld = {
  id: WINTER_ID,
  account: LINXIA,
  title: '天州市·冬',
  createdAt: NOW - 6 * DAY,
  updatedAt: NOW - 6 * DAY,
  deletedAt: null,
  settings: { preset: { style: 'slice-of-life' }, completion: null, pipelineModels: null },
  worldBook: null,
  rulebook: null,
  members: [{ personaId: 10000008, displayOrder: 0, joinedAt: NOW - 6 * DAY, leftAt: null, dmSessionId: S.winterDm }],
  sessions: [
    { id: S.winterDm, kind: 'dm', title: null, personaId: 10000008, createdAt: NOW - 6 * DAY, deletedAt: null, summary: null, stateCard: null },
    { id: S.winterDirector, kind: 'system', title: '导演席', personaId: null, createdAt: NOW - 6 * DAY, deletedAt: null, summary: null, stateCard: null },
  ],
  runtime: null,
};

const old: MockWorld = {
  id: OLD_ID,
  account: PLAYER_0123,
  title: '旧版测试世界',
  createdAt: NOW - 30 * DAY,
  updatedAt: NOW - 9 * DAY,
  deletedAt: NOW - 3 * DAY,
  settings: { preset: { systemPrompt: '你是一只猫。' }, completion: { temperature: 1 }, pipelineModels: null },
  worldBook: null,
  rulebook: null,
  members: [{ personaId: 10000011, displayOrder: 0, joinedAt: NOW - 30 * DAY, leftAt: null, dmSessionId: S.oldDm }],
  sessions: [
    { id: S.oldDm, kind: 'dm', title: null, personaId: 10000011, createdAt: NOW - 30 * DAY, deletedAt: null, summary: null, stateCard: null },
  ],
  runtime: {
    overview: '一间老公寓，窗外一直在下雨。',
    storyClockIso: '2026-06-01T15:00:00',
    events: [],
    places: [],
    variables: [],
  },
};

const worlds: MockWorld[] = [fog, winter, old];

// ─── 消息 ────────────────────────────────────────────────

interface Line {
  role: MessageRole;
  source: MessageSource;
  content: MessageContent;
}

function text(speaker: string | null, said: string, inner: string | null = null): MessageContent {
  return { kind: 'text', segments: [{ speaker, said, inner }], storyAt: null };
}

const USER = (said: string): Line => ({ role: 'user', source: 'user', content: text(null, said) });
const ACTOR = (speaker: string, said: string, inner: string | null = null, source: MessageSource = 'assistant'): Line => ({
  role: 'assistant',
  source,
  content: text(speaker, said, inner),
});

const SHEN_TALK: Line[] = [
  USER('沈督察，我在三号码头捡到了这个。'),
  ACTOR('沈惟行', '他接过那张纸，对着灯看了很久。“货单。日期被人改过。”', '这笔迹……不可能。'),
  USER('改过？你怎么看出来的？'),
  ACTOR('沈惟行', '“墨色不一样。原来写的是十二号，改成了十三号。”他把货单折好放进口袋。'),
  USER('那艘青鸟号，就是十三号失联的。'),
  ACTOR('沈惟行', '“我知道。”他看了你一眼，“这件事先别跟别人说，包括茶馆那位。”', '苏晚知道得太多了。'),
  USER('你是怀疑苏晚？'),
  ACTOR('沈惟行', '“我谁都怀疑。”他把烟盒拿出来，又放了回去。'),
];

function dmLines(count: number): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < count; i += 1) out.push(SHEN_TALK[i % SHEN_TALK.length]!);
  return out;
}

const SCENE_LINES: Line[] = [
  USER('（推门进来，把伞靠在门边）老板娘，两杯热茶。'),
  {
    role: 'assistant',
    source: 'assistant',
    content: {
      kind: 'text',
      storyAt: '2026-03-14T21:12:00',
      segments: [
        { speaker: '苏晚', said: '“来啦？今天雾大，船都没出去。”她一边倒茶一边往门口看了一眼。', inner: '沈督察怎么也来了。' },
        { speaker: '沈惟行', said: '他在靠窗的位置坐下，没摘帽子。“苏老板，十三号晚上，你这儿开到几点？”', inner: null },
        { speaker: '苏晚', said: '“和平常一样，十一点。”茶壶在她手里顿了一下。', inner: '他是冲着青鸟号来的。' },
      ],
    },
  },
  USER('海燕号是什么船？我听陆伯提过。'),
  {
    role: 'assistant',
    source: 'assistant',
    content: {
      kind: 'text',
      storyAt: '2026-03-14T21:20:00',
      segments: [
        { speaker: '苏晚', said: '“老黄历了。”她笑着把话岔开，“要不要尝尝新到的桂花糕？”', inner: '不能让他们再问下去。' },
        { speaker: '沈惟行', said: '他没接话，只是看着她的手。', inner: '她在发抖。' },
      ],
    },
  },
  ACTOR('陆川', '门被一把推开，陆川拎着酒瓶站在门口：“海燕号？谁在说海燕号？”', '二十年了，终于有人问了。', 'proactive'),
  { role: 'system', source: 'interaction', content: text(null, '林夏 递给 沈惟行 一张货单。') },
  { role: 'user', source: 'user', content: { kind: 'image', image: { storageKey: 'tavern/u100002333/img/2026/03/manifest-01.webp', width: 1024, height: 768, mime: 'image/webp' }, storyAt: '2026-03-14T21:31:00' } },
  ACTOR('沈惟行', '“陆伯，你先坐。”他把椅子拉开，“慢慢说。”'),
];

const SIMPLE_LINES: Record<string, Line[]> = {
  [S.dmSu]: [
    USER('苏姐，最近码头那边有什么新鲜事吗？'),
    ACTOR('苏晚', '“新鲜事天天有，”她压低声音，“昨晚有人看见三号码头亮了灯。”', '这话不该说的。'),
  ],
  [S.dmLu]: [USER('陆伯，你还记得海燕号吗？'), ACTOR('陆川', '“记得，怎么不记得……”他灌了一口酒，没再说下去。')],
  [S.news]: [
    { role: 'assistant', source: 'proactive', content: text('雾港晨报', '【本报讯】货船青鸟号于十三日夜在雾中失联，港务局已挂黑旗封港。') },
    { role: 'assistant', source: 'proactive', content: text('雾港晨报', '【本报讯】警署督察沈惟行表示，案件正在调查中，请市民勿信谣传。') },
  ],
  [S.director]: [
    USER('让陆川在茶馆那一幕出场。'),
    { role: 'assistant', source: 'assistant', content: text(null, '好的。我给陆川投了一封意图：听到有人提海燕号就进门。他会自己决定怎么演。') },
  ],
  [S.group]: [USER('周五夜里十一点，码头见。'), ACTOR('沈惟行', '“别迟到。”')],
  [S.winterDm]: [USER('天州下雪了。'), ACTOR('沈惟行', '“嗯。北区的山路又要封了。”')],
  [S.winterDirector]: [],
  [S.oldDm]: [USER('小满，今天吃什么？'), ACTOR('小满', '“喵——小鱼干。”')],
};

/** 一个频道的全部消息，seq 从 1 起、时间按序往前倒推。 */
function buildMessages(sessionId: string, lines: Line[], endAt: number, stepMs: number): MessageRow[] {
  return lines.map((line, i) => {
    const seq = i + 1;
    const at = endAt - (lines.length - seq) * stepMs;
    return {
      id: mockUuid(sessionId.charCodeAt(0) * 1000 + sessionId.charCodeAt(1) * 37 + seq),
      seq,
      role: line.role,
      source: line.source,
      status: 'completed' as MessageStatus,
      content: line.content,
      memory: line.role !== 'system',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
  });
}

const messages = new Map<string, MessageRow[]>();

{
  // 私聊够长才能翻页；最后一条还在生成，倒数第三条失败过，第 30 条被玩家删了，第 12 条是图。
  const dm = buildMessages(S.dmShen, dmLines(46), NOW - 3 * HOUR, 9 * MINUTE);
  dm[45]!.status = 'streaming';
  dm[45]!.memory = false;
  dm[43]!.status = 'failed';
  dm[43]!.memory = false;
  dm[29]!.deletedAt = NOW - 2 * DAY;
  dm[29]!.memory = false;
  dm[11]!.content = {
    kind: 'image',
    image: { storageKey: 'tavern/u100002333/img/2026/03/dock-night.webp', width: 1280, height: null, mime: 'image/webp' },
    storyAt: null,
  };
  for (const m of dm.slice(38)) m.memory = false;
  messages.set(S.dmShen, dm);
  messages.set(S.scene, buildMessages(S.scene, SCENE_LINES, NOW - 4 * HOUR, 3 * MINUTE));
  for (const [id, lines] of Object.entries(SIMPLE_LINES)) {
    messages.set(id, buildMessages(id, lines, NOW - 5 * HOUR - lines.length * DAY, 6 * MINUTE));
  }
}

function sessionMessages(sessionId: string): MessageRow[] {
  return messages.get(sessionId) ?? [];
}

function liveMessages(sessionId: string): MessageRow[] {
  return sessionMessages(sessionId).filter((m) => m.deletedAt == null);
}

// ─── 纪事与节拍 ──────────────────────────────────────────

const chronicle: ChronicleEntry[] = (() => {
  const texts: Array<[string, number | null, string]> = [
    ['turn', 10000008, '沈惟行收下了林夏捡到的货单，认出了上面的笔迹。'],
    ['channel', null, '雾港晨报：货船青鸟号在雾中失联。'],
    ['turn', 10000009, '苏晚对林夏说，昨晚有人看见三号码头亮了灯。'],
    ['rule', 10000008, '沈惟行早上照例去了苏记茶馆。'],
    ['scene', 10000010, '陆川闯进茶馆，追问是谁在提海燕号。'],
    ['member_enter', 10000009, '苏晚加入了雾港。'],
    ['turn', 10000008, '沈惟行和林夏约好周五夜里去码头蹲守。'],
  ];
  const out: ChronicleEntry[] = [];
  for (let i = 0; i < 24; i += 1) {
    const [kind, pid, t] = texts[i % texts.length]!;
    const minutes = 24 * 60 - i * 47;
    const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    out.push({
      id: mockUuid(7000 + i),
      kind,
      persona: pid == null ? null : personaRef(pid),
      sessionId: pid === 10000008 ? S.dmShen : pid === 10000009 ? S.dmSu : null,
      storyAt: i > 20 ? null : `2026-03-${String(14 - Math.floor(i / 6)).padStart(2, '0')}T${h}:${m}:00`,
      text: t,
      createdAt: NOW - (3 + i * 5) * HOUR,
    });
  }
  return out;
})();

const beats: Beat[] = (() => {
  const shapes: Array<Pick<Beat, 'trigger' | 'perceived' | 'outcome' | 'innerThought' | 'reason'> & { pid: number }> = [
    { pid: 10000008, trigger: 'actor_spoke', perceived: '林夏说她在三号码头捡到了一张货单。', outcome: 'spoke', innerThought: null, reason: null },
    { pid: 10000009, trigger: 'actor_entered', perceived: '沈惟行走进了茶馆。', outcome: 'silent', innerThought: '他是冲着青鸟号来的。', reason: { code: 'chose_silence', detail: null } },
    { pid: 10000010, trigger: 'actor_spoke', perceived: '有人在茶馆里提到了海燕号。', outcome: 'spoke', innerThought: '二十年了，终于有人问了。', reason: null },
    { pid: 10000009, trigger: 'actor_spoke', perceived: '林夏问海燕号是什么船。', outcome: 'silent', innerThought: '不能让他们再问下去。', reason: { code: 'triage', detail: '话题被沈惟行接住了，不必回应' } },
    { pid: 10000008, trigger: 'alarm', perceived: '闹钟：周五夜里十一点去码头。', outcome: 'deferred', innerThought: null, reason: { code: 'quiet_hours', detail: '2026-03-15T07:00:00Z' } },
    { pid: 10000010, trigger: 'story_event_due', perceived: '港务局解除封港。', outcome: 'skipped', innerThought: null, reason: { code: 'inactive', detail: null } },
    { pid: 10000008, trigger: 'directed', perceived: '导演：去茶馆坐一会儿，顺便打听码头的消息。', outcome: 'failed', innerThought: null, reason: { code: 'failed', detail: 'upstream_timeout' } },
    { pid: 10000009, trigger: 'actor_broadcast', perceived: '陆川在门口大喊。', outcome: 'stale', innerThought: null, reason: { code: 'stale', detail: null } },
    { pid: 10000010, trigger: 'actor_left', perceived: '林夏离开了茶馆。', outcome: 'dropped', innerThought: null, reason: { code: 'left_place', detail: null } },
    { pid: 10000008, trigger: 'actor_called', perceived: '林夏在私聊里叫他。', outcome: 'deferred', innerThought: null, reason: { code: 'budget_hourly_quota', detail: '重试 120 秒后' } },
  ];
  const out: Beat[] = [];
  for (let i = 0; i < 32; i += 1) {
    const s = shapes[i % shapes.length]!;
    const actor = fog.members.find((m) => m.personaId === s.pid)!;
    const inScene = s.trigger !== 'alarm' && s.trigger !== 'actor_called';
    out.push({
      id: mockUuid(8000 + i),
      persona: personaRef(s.pid),
      actorSessionId: actor.dmSessionId,
      shownInSessionId: inScene ? S.scene : actor.dmSessionId,
      placeId: inScene ? mockUuid(9102) : null,
      trigger: s.trigger,
      perceived: s.perceived,
      outcome: s.outcome,
      innerThought: s.innerThought,
      reason: s.reason,
      messageId: s.outcome === 'spoke' ? mockUuid(8500 + i) : null,
      storyAt: `2026-03-14T${String(21 - Math.floor(i / 4)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`,
      createdAt: NOW - (4 * HOUR + i * 23 * MINUTE),
    });
  }
  return out;
})();

// ─── 现算的行 ────────────────────────────────────────────

function sessionRow(s: MockSession): SessionRow {
  const live = liveMessages(s.id);
  const last = live.at(-1);
  return {
    id: s.id,
    kind: s.kind,
    name: s.personaId == null ? s.title : personaRef(s.personaId).name,
    messages: live.length,
    lastActiveAt: last?.createdAt ?? s.createdAt,
    createdAt: s.createdAt,
    deletedAt: s.deletedAt,
  };
}

function worldRow(w: MockWorld): WorldRow {
  const sessions = w.sessions.filter((s) => s.deletedAt == null);
  const msgs = sessions.flatMap((s) => liveMessages(s.id));
  const lastActiveAt = msgs.length ? Math.max(...msgs.map((m) => m.createdAt)) : null;
  return {
    id: w.id,
    account: w.account,
    title: w.title,
    stats: {
      members: w.members.filter((m) => m.leftAt == null).length,
      sessions: sessions.length,
      messages: msgs.length,
    },
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    lastActiveAt,
    deletedAt: w.deletedAt,
  };
}

function personaRow(p: MockPersona): PersonaRow {
  const joined = worlds.filter((w) => w.deletedAt == null && w.members.some((m) => m.personaId === p.id && m.leftAt == null));
  return {
    id: p.id,
    account: p.account,
    name: p.name,
    avatar: p.avatar,
    profile: { tagline: p.tagline, tags: p.tags, greetings: p.greetings },
    worlds: joined.length,
    card: p.card,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  };
}

function inState(deletedAt: number | null, state: LifecycleState): boolean {
  if (state === 'all') return true;
  return state === 'deleted' ? deletedAt != null : deletedAt == null;
}

function findWorld({ accountUid, worldId }: WorldKey): MockWorld | undefined {
  return worlds.find((w) => w.id === worldId && w.account.uid === accountUid);
}

function findSession({ accountUid, sessionId }: SessionKey): MockSession | undefined {
  for (const w of worlds) {
    if (w.account.uid !== accountUid) continue;
    const s = w.sessions.find((x) => x.id === sessionId);
    if (s) return s;
  }
  return undefined;
}

/** 同服务端：第 1 页是最新的一页，页内按 seq 升序。 */
function newestPageOf<T>(rows: readonly T[], page: number, pageSize: number): ItemsEnvelope<T> {
  const size = Math.min(200, Math.max(1, pageSize));
  const p = Math.max(1, page);
  const end = Math.max(0, rows.length - (p - 1) * size);
  return { items: rows.slice(Math.max(0, end - size), end), total: rows.length, page: p, pageSize: size };
}

function memoryItemsOf(sessionId: string): MemoryItem[] {
  return liveMessages(sessionId)
    .filter((m) => m.memory && m.content.kind === 'text')
    .map((m) => ({
      messageId: m.id,
      sessionId,
      seq: m.seq,
      role: m.role,
      text:
        m.content.kind === 'text'
          ? m.content.segments.map((s) => (s.speaker ? `${s.speaker}：${s.said}` : s.said)).join('\n')
          : '',
      source: '本对话',
      createdAt: m.createdAt,
    }))
    .reverse();
}

const notFound = (what: string) => fail({ code: 'not_found', message: `${what}不存在。` });

export class TavernContentMock implements TavernContentPort {
  async worlds(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WorldRow>>> {
    await delay();
    const keyword = query.keyword?.trim().toLowerCase();
    const rows = worlds
      .filter((w) => query.accountUid == null || w.account.uid === query.accountUid)
      .filter((w) => !keyword || w.title.toLowerCase().includes(keyword))
      .filter((w) => inState(w.deletedAt, query.state))
      .map(worldRow)
      .sort((a, b) => (b.lastActiveAt ?? b.createdAt) - (a.lastActiveAt ?? a.createdAt));
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async world(key: WorldKey): Promise<AppResult<WorldDetail>> {
    await delay();
    const w = findWorld(key);
    if (!w) return notFound('世界');
    return ok(
      worldDetailSchema.parse({
        world: worldRow(w),
        settings: w.settings,
        worldBook: w.worldBook,
        rulebook: w.rulebook,
        members: w.members.map((m) => ({
          persona: personaRef(m.personaId),
          displayOrder: m.displayOrder,
          joinedAt: m.joinedAt,
          leftAt: m.leftAt,
          dmSessionId: m.dmSessionId,
        })),
        sessions: w.sessions.map(sessionRow).sort((a, b) => b.lastActiveAt - a.lastActiveAt),
        runtime: w.runtime,
      }),
    );
  }

  async chronicle(key: WorldKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<ChronicleEntry>>> {
    await delay();
    const w = findWorld(key);
    if (!w) return notFound('世界');
    return ok(pageOf(w.id === FOG_ID ? chronicle : [], page.p, page.pageSize));
  }

  async beats(key: WorldKey, query: BeatQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<Beat>>> {
    await delay();
    const w = findWorld(key);
    if (!w) return notFound('世界');
    const rows = (w.id === FOG_ID ? beats : []).filter((b) => query.personaId == null || b.persona.id === query.personaId);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async deleteWorld(key: WorldKey): Promise<AppResult<ActionResult>> {
    await delay();
    const w = findWorld(key);
    if (!w) return notFound('世界');
    if (w.deletedAt != null) return fail({ code: 'conflict', message: '这个世界已经删除了。' });
    w.deletedAt = Date.now();
    return ok({ affected: 1 });
  }

  async messages(key: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MessageRow>>> {
    await delay();
    if (!findSession(key)) return notFound('会话');
    return ok(newestPageOf(sessionMessages(key.sessionId), page.p, page.pageSize));
  }

  async deleteMessage(key: SessionKey, messageId: string): Promise<AppResult<ActionResult>> {
    await delay();
    if (!findSession(key)) return notFound('会话');
    const m = sessionMessages(key.sessionId).find((x) => x.id === messageId);
    if (!m) return notFound('消息');
    if (m.deletedAt != null) return fail({ code: 'conflict', message: '消息已经删除了。' });
    m.deletedAt = Date.now();
    m.memory = false;
    return ok({ affected: 1 });
  }

  async clearSession(key: SessionKey): Promise<AppResult<ActionResult>> {
    await delay();
    if (!findSession(key)) return notFound('会话');
    const now = Date.now();
    const live = liveMessages(key.sessionId);
    for (const m of live) {
      m.deletedAt = now;
      m.memory = false;
    }
    return ok({ affected: live.length });
  }

  async sessionMemory(key: SessionKey): Promise<AppResult<SessionMemory>> {
    await delay();
    const s = findSession(key);
    if (!s) return notFound('会话');
    return ok({
      session: sessionRow(s),
      summary: s.summary,
      stateCard: s.stateCard,
      indexedCount: memoryItemsOf(key.sessionId).length,
    });
  }

  async memoryItems(key: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MemoryItem>>> {
    await delay();
    if (!findSession(key)) return notFound('会话');
    return ok(pageOf(memoryItemsOf(key.sessionId), page.p, page.pageSize));
  }

  async forgetMemoryItem(key: SessionKey, messageId: string): Promise<AppResult<ActionResult>> {
    await delay();
    if (!findSession(key)) return notFound('会话');
    const m = sessionMessages(key.sessionId).find((x) => x.id === messageId && x.memory);
    if (!m) return fail({ code: 'conflict', message: '这条已经不在记忆索引里了。' });
    m.memory = false;
    return ok({ affected: 1 });
  }

  async personas(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<PersonaRow>>> {
    await delay();
    const keyword = query.keyword?.trim().toLowerCase();
    const rows = personas
      .filter((p) => query.accountUid == null || p.account.uid === query.accountUid)
      .filter((p) => !keyword || p.name.toLowerCase().includes(keyword))
      .filter((p) => inState(p.deletedAt, query.state))
      .map(personaRow)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async persona(personaId: number): Promise<AppResult<PersonaDetail>> {
    await delay();
    const p = personas.find((x) => x.id === personaId);
    if (!p) return notFound('角色卡');
    const joined = worlds.flatMap((w) =>
      w.members
        .filter((m) => m.personaId === p.id)
        .map((m) => ({
          world: { id: w.id, accountUid: w.account.uid, title: w.title, deletedAt: w.deletedAt },
          joinedAt: m.joinedAt,
          leftAt: m.leftAt,
        })),
    );
    return ok({ persona: personaRow(p), preset: p.preset, worldBook: p.worldBook, worlds: joined });
  }

  async deletePersona(personaId: number): Promise<AppResult<ActionResult>> {
    await delay();
    const p = personas.find((x) => x.id === personaId);
    if (!p) return notFound('角色卡');
    if (p.deletedAt != null) return fail({ code: 'conflict', message: '这张角色卡已经删除了。' });
    p.deletedAt = Date.now();
    return ok({ affected: 1 });
  }
}
