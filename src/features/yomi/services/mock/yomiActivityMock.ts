import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  ActivityAsset,
  ActivityInput,
  ActivityListQuery,
  ActivityListResult,
  ActivityStatus,
  ActivityImage,
  YomiActivity,
} from '../../model/activity.types';
import { DEFAULT_LOCALE, applyPatch, messageKeys, requiredKeys, type ActivityMessages, type MessagesPatch } from '../../model/activityMessages';
import { presetTheme, themeProblem } from '../../model/activityTheme';
import { validateImageFile } from '../../api/adapters/yomiActivityAdapter';
import type { YomiActivityPort } from '../ports/yomiActivityPort';
import { mockActivityMessages } from './yomiActivityMessagesMock';

const DAY = 86_400_000;

type ArtTone = 'pink' | 'purple' | 'blue' | 'warm';

const PALETTE: Record<ArtTone, [string, string, string]> = {
  pink: ['#ffd6e7', '#f4a8c0', '#c2477a'],
  purple: ['#e6d9ff', '#b9a0ee', '#5d3fa8'],
  blue: ['#d6e9ff', '#9cc6f0', '#2a6bb0'],
  warm: ['#ffe6c7', '#f8b86b', '#c4621c'],
};

/** mock 用的「设计稿」：渐变 + 光斑 + 大字，模拟运营上传的带字横幅图。 */
function mockArt(tone: ArtTone, text: string, w: number, h: number): string {
  const [a, b, ink] = PALETTE[tone];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w * 0.82}" cy="${h * 0.3}" r="${h * 0.42}" fill="#fff" opacity=".25"/>
<circle cx="${w * 0.12}" cy="${h * 0.85}" r="${h * 0.3}" fill="#fff" opacity=".18"/>
<text x="${w * 0.08}" y="${h * 0.58}" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="${h * 0.22}" font-weight="800" fill="${ink}">${text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** 仿 AI 生成的模板：亮点 → 步骤 → 领取 → 规则。文字全是 {{key}}，配色全用主题变量，礼物图用 asset:gift 引用素材。 */
function sampleTemplate(steps: number, rules: number, withGift: boolean, claims: string[] = []): string {
  return `<style>
.act{padding:4px}
.act .lead{display:flex;gap:18px;align-items:center;margin:0 0 8px;padding:20px 22px;border-radius:20px;background:var(--activity-banner);font-size:15px}
.act .lead img{width:120px;border-radius:16px}
.act h3{margin:28px 0 12px;font-size:17px;color:var(--activity-ink)}
.act .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;padding:0;margin:0;list-style:none;counter-reset:s}
.act .steps li{position:relative;padding:46px 16px 16px;border-radius:18px;background:#fff;box-shadow:0 10px 28px -18px var(--activity-orb);counter-increment:s}
.act .steps li::before{content:counter(s);position:absolute;top:14px;left:16px;width:24px;height:24px;border-radius:50%;background:var(--activity-button);color:#fff;font-size:13px;line-height:24px;text-align:center}
.act ul{margin:0;padding-left:20px;color:#6b5b8a}
.act .claims{display:flex;flex-wrap:wrap;gap:12px}
</style>
<div class="act">
  <div class="lead">${withGift ? '<img src="asset:gift" alt="{{lead.alt}}">' : ''}<p>{{lead}}</p></div>
  <h3>{{steps.title}}</h3>
  <ol class="steps">${range(steps).map((i) => `<li>{{steps.${i}}}</li>`).join('')}</ol>${claims.length ? `
  <h3>{{claims.title}}</h3>
  <div class="claims">${claims.map((k) => `<yomi-claim reward="${k}"></yomi-claim>`).join('')}</div>` : ''}
  <h3>{{rules.title}}</h3>
  <ul>${range(rules).map((i) => `<li>{{rules.${i}}}</li>`).join('')}</ul>
</div>`;
}

interface SamplePack {
  title: string;
  lead: string;
  leadAlt?: string;
  stepsTitle: string;
  steps: string[];
  claimsTitle?: string;
  rulesTitle: string;
  rules: string[];
}

/** 与 sampleTemplate 配套的一份语言包。 */
function samplePack(c: SamplePack): Record<string, string> {
  return {
    [messageKeys.title]: c.title,
    lead: c.lead,
    ...(c.leadAlt ? { 'lead.alt': c.leadAlt } : {}),
    'steps.title': c.stepsTitle,
    ...Object.fromEntries(c.steps.map((x, i) => [`steps.${i + 1}`, x])),
    ...(c.claimsTitle ? { 'claims.title': c.claimsTitle } : {}),
    'rules.title': c.rulesTitle,
    ...Object.fromEntries(c.rules.map((x, i) => [`rules.${i + 1}`, x])),
  };
}

type MockActivity = Omit<YomiActivity, 'status' | 'titles'>;

function seed(): MockActivity[] {
  const now = Date.now();
  const base = { createdAtUtc: now - 30 * DAY, updatedAtUtc: now - DAY, updatedBy: '900001' };
  const gift: ActivityAsset = { name: 'gift', key: 'static/blobs/mock/gift', url: mockArt('pink', '礼物', 400, 400) };
  const rows: (MockActivity & { messages: MessagesPatch })[] = [
    {
      ...base,
      id: '1',
      slug: 'topup-bonus',
      theme: presetTheme('purple'),
      cover: { key: 'static/blobs/mock/topup-cover', url: mockArt('purple', '充值有礼', 1200, 600) },
      hero: { key: 'static/blobs/mock/topup-hero', url: mockArt('purple', '充值有礼 · 多充多得', 1800, 600) },
      assets: [gift],
      linkUrl: '/console/billing/topups',
      startAtUtc: now - 5 * DAY,
      endAtUtc: now + 17 * DAY,
      isPublished: true,
      sortOrder: 10,
      html: sampleTemplate(3, 2, true, ['topup-coupon', 'jd-50']),
      messages: {
        zh: samplePack({
          title: '充值有礼',
          lead: '活动期间充值满 100 元，就能领一张代金券，下次充值直接抵扣。',
          leadAlt: '礼物',
          stepsTitle: '参与方式',
          steps: ['进入充值页', '单笔充值满 100 元', '回到本页领取代金券'],
          claimsTitle: '领取奖励',
          rulesTitle: '活动规则',
          rules: ['代金券有有效期，过期作废', '发生退款时，已领的代金券一并收回'],
        }),
        en: samplePack({
          title: 'Top-up bonus',
          lead: 'Top up ¥100 or more during the event to claim a voucher for your next top-up.',
          leadAlt: 'Gift',
          stepsTitle: 'How to join',
          steps: ['Open the top-up page', 'Top up ¥100 or more', 'Come back and claim the voucher'],
          claimsTitle: 'Claim your rewards',
          rulesTitle: 'Rules',
          rules: ['Vouchers expire after their validity period', 'Refunds revoke claimed vouchers'],
        }),
      },
    },
    {
      ...base,
      id: '2',
      slug: 'invite',
      // 改过主色的樱粉：编辑器里显示为自定义。
      theme: { ...presetTheme('pink'), accent: '#e0527f' },
      cover: { key: 'static/blobs/mock/invite-cover', url: mockArt('pink', '邀请有礼', 1200, 600) },
      hero: null,
      assets: [],
      linkUrl: '/console/referral',
      startAtUtc: null,
      endAtUtc: null,
      isPublished: true,
      sortOrder: 0,
      html: sampleTemplate(3, 2, false),
      messages: {
        zh: samplePack({
          title: '邀请好友得返利',
          lead: '分享你的专属邀请链接，好友之后的每一笔充值，你都能拿到一份返利。',
          stepsTitle: '参与方式',
          steps: ['复制专属邀请链接', '好友通过链接注册', '好友充值，返利自动到账'],
          rulesTitle: '活动规则',
          rules: ['返利比例以控制台为准', '刷单、自邀将取消返利'],
        }),
        // 英文只翻了标题：编辑器里 en.json 会显示缺多少，预览英文时其余回落到中文。
        en: { [messageKeys.title]: 'Invite friends, earn rebates' },
      },
    },
    {
      ...base,
      id: '3',
      slug: 'halloween',
      theme: presetTheme('warm'),
      cover: null,
      hero: null,
      assets: [],
      linkUrl: '/chat',
      startAtUtc: now + 3 * DAY,
      endAtUtc: now + 8 * DAY,
      isPublished: false,
      sortOrder: 0,
      html: '',
      messages: {
        zh: { [messageKeys.title]: '万圣节魔法夜' },
        en: { [messageKeys.title]: 'Halloween magic night' },
      },
    },
  ];
  return rows.map(({ messages, ...r }) => {
    mockActivityMessages.apply(r.id, messages);
    return r;
  });
}

function statusOf(start: number | null, end: number | null, now: number): ActivityStatus {
  if (start !== null && now < start) return 'upcoming';
  if (end !== null && now > end) return 'ended';
  return end === null ? 'long_term' : 'ongoing';
}

const phaseOrder: Record<ActivityStatus, number> = { ongoing: 0, long_term: 1, upcoming: 2, ended: 3 };

/** 与后端 MissingForPublish 一致：上架前默认语言要有活动名、模板里每个占位、每个启用奖励的名称。 */
function missingForPublish(current: ActivityMessages, patch: MessagesPatch | undefined, html: string, enabledRewards: readonly string[]): string[] {
  const pack = applyPatch(current, patch ?? {})[DEFAULT_LOCALE] ?? {};
  return requiredKeys(html, enabledRewards).filter((k) => !pack[k]?.trim());
}

const incomplete = (missing: string[]) => fail({
  code: 'validation',
  message: `上架前默认语言（${DEFAULT_LOCALE}）的语言包还缺：${missing.slice(0, 10).map((k) => (k === messageKeys.title ? `${k}（活动名）` : k)).join('、')}。`,
});

export class YomiActivityMock implements YomiActivityPort {
  private rows: MockActivity[] = seed();
  private nextId = 100;
  // mock 不真传：key → 本地 blob 地址。
  private urls = new Map<string, string>();

  async list(query: ActivityListQuery): Promise<AppResult<ActivityListResult>> {
    await delay(150);
    const now = Date.now();
    const scoped = this.rows
      .map((r) => this.view(r, now))
      .filter((r) => query.isPublished === null || r.isPublished === query.isPublished);

    const matches = (s: ActivityStatus) =>
      query.status === 'all'
      || (query.status === 'ongoing' ? s === 'ongoing' || s === 'long_term' : s === query.status);

    const filtered = scoped
      .filter((r) => matches(r.status))
      .sort((a, b) => phaseOrder[a.status] - phaseOrder[b.status] || b.sortOrder - a.sortOrder);

    const upcoming = scoped.filter((r) => r.status === 'upcoming').length;
    const ended = scoped.filter((r) => r.status === 'ended').length;
    const start = (query.page - 1) * query.pageSize;
    return ok({
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      counts: { all: scoped.length, ongoing: scoped.length - upcoming - ended, upcoming, ended },
    });
  }

  async get(id: string): Promise<AppResult<YomiActivity>> {
    await delay(120);
    const row = this.rows.find((r) => r.id === id);
    return row ? ok(this.view(row)) : fail({ code: 'not_found', message: `活动 ${id} 不存在。` });
  }

  async messages(id: string): Promise<AppResult<ActivityMessages>> {
    await delay(100);
    return this.rows.some((r) => r.id === id)
      ? ok(mockActivityMessages.read(id))
      : fail({ code: 'not_found', message: `活动 ${id} 不存在。` });
  }

  async create(input: ActivityInput): Promise<AppResult<YomiActivity>> {
    await delay(150);
    const invalid = this.validate(input, null) ?? mockActivityMessages.validate(input.messages, new Set());
    if (invalid) return fail({ code: 'validation', message: invalid });
    const gaps = input.isPublished ? missingForPublish({}, input.messages, input.html, []) : [];
    if (gaps.length) return incomplete(gaps);
    const now = Date.now();
    const row: MockActivity = {
      ...this.withUrls(input, null),
      id: String(this.nextId++),
      createdAtUtc: now,
      updatedAtUtc: now,
      updatedBy: '900001',
    };
    this.rows.unshift(row);
    mockActivityMessages.apply(row.id, input.messages);
    return ok(this.view(row));
  }

  async update(id: string, input: ActivityInput): Promise<AppResult<YomiActivity>> {
    await delay(150);
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: `活动 ${id} 不存在。` });
    const invalid = this.validate(input, id) ?? mockActivityMessages.validate(input.messages, mockActivityMessages.rewardKeys(id));
    if (invalid) return fail({ code: 'validation', message: invalid });
    const gaps = input.isPublished ? missingForPublish(mockActivityMessages.read(id), input.messages, input.html, mockActivityMessages.enabledRewardKeys(id)) : [];
    if (gaps.length) return incomplete(gaps);
    const prev = this.rows[idx]!;
    const row: MockActivity = {
      ...prev,
      ...this.withUrls(input, prev),
      updatedAtUtc: Date.now(),
    };
    this.rows[idx] = row;
    mockActivityMessages.apply(id, input.messages);
    return ok(this.view(row));
  }

  async setPublished(id: string, isPublished: boolean): Promise<AppResult<YomiActivity>> {
    await delay(100);
    const row = this.rows.find((r) => r.id === id);
    if (!row) return fail({ code: 'not_found', message: `活动 ${id} 不存在。` });
    const gaps = isPublished ? missingForPublish(mockActivityMessages.read(id), undefined, row.html, mockActivityMessages.enabledRewardKeys(id)) : [];
    if (gaps.length) return incomplete(gaps);
    row.isPublished = isPublished;
    row.updatedAtUtc = Date.now();
    return ok(this.view(row));
  }

  async remove(id: string): Promise<AppResult<void>> {
    await delay(100);
    this.rows = this.rows.filter((r) => r.id !== id);
    mockActivityMessages.remove(id);
    return ok(undefined);
  }

  async uploadImage(file: File): Promise<AppResult<ActivityImage>> {
    const invalid = validateImageFile(file);
    if (invalid) return fail({ code: 'validation', message: invalid });
    await delay(300);
    const key = `static/blobs/mock/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const url = URL.createObjectURL(file);
    this.urls.set(key, url);
    return ok({ key, url });
  }

  private view(row: MockActivity, now = Date.now()): YomiActivity {
    return { ...row, status: statusOf(row.startAtUtc, row.endAtUtc, now), titles: mockActivityMessages.titles(row.id) };
  }

  /** 后端只收 key、回 url；mock 按 key 从上传记录或旧值里找回 url。 */
  private withUrls(input: ActivityInput, prev: MockActivity | null) {
    const known = new Map<string, string | null>([
      ...([prev?.cover, prev?.hero].filter((x): x is ActivityImage => !!x).map((x) => [x.key, x.url] as [string, string | null])),
      ...(prev?.assets.map((a) => [a.key, a.url] as [string, string | null]) ?? []),
      ...this.urls,
    ]);
    const urlOf = (key: string | null) => (key ? known.get(key) ?? null : null);
    const image = (key: string | null): ActivityImage | null => (key ? { key, url: urlOf(key) } : null);
    // 文案（messages）不是活动的字段，单独进语言包。
    return {
      slug: input.slug,
      theme: input.theme,
      linkUrl: input.linkUrl,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      isPublished: input.isPublished,
      sortOrder: input.sortOrder,
      html: input.html,
      cover: image(input.coverKey),
      hero: image(input.heroKey),
      assets: input.assets.map((a) => ({ ...a, url: urlOf(a.key) })),
    };
  }

  private validate(input: ActivityInput, selfId: string | null): string | null {
    const theme = themeProblem(input.theme);
    if (theme) return `主题：${theme}`;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.slug)) return 'slug 只能用小写字母、数字和 -，以字母或数字开头，最长 64。';
    if (this.rows.some((r) => r.slug === input.slug && r.id !== selfId)) return `slug「${input.slug}」已被另一场活动使用。`;
    if (input.linkUrl && !/^(\/(?![/\\])|https?:\/\/)/i.test(input.linkUrl)) return 'linkUrl 只能是 / 开头的站内路径或 http(s) 地址。';
    const names = input.assets.map((a) => a.name);
    if (new Set(names).size !== names.length) return '素材名重复了。';
    return null;
  }
}
