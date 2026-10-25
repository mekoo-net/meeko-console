import { z } from 'zod';

import {
  DEFAULT_LOCALE,
  extractJson,
  localeLabel,
  type MessagesPatch,
} from './activityMessages';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  themeCssVars,
  type ActivityTheme,
} from './activityTheme';

export type { ActivityTheme } from './activityTheme';

/**
 * Yomi 官网活动中心（后端 Meeko.Yomi `/yomi/api/admin/activities`）。
 * 线上 camelCase、时间是 Unix 毫秒、状态是 snake_case 字符串、id 是字符串。
 *
 * 一场活动 = 两张固定位置的图（列表卡片的封面图、详情页顶部的 Hero 图）+ 素材库 + 主题（一组 CSS 变量，
 * 见 activityTheme.ts）+ 一份正文模板 + 语言包。模板所有语言共用，文字写成 `{{key}}` 占位、图片用
 * `asset:名字` 引用素材库；各语言的文字在语言包里（见 activityMessages.ts），页面按访客语言渲染。
 */

export type ActivityStatus = 'ongoing' | 'long_term' | 'upcoming' | 'ended';

export const activityStatusLabels: Record<ActivityStatus, string> = {
  ongoing: '进行中',
  long_term: '长期有效',
  upcoming: '即将开始',
  ended: '已结束',
};

export type ActivityStatusFilter = 'all' | 'ongoing' | 'upcoming' | 'ended';

/** 与后端 Activity 的上限一致，编辑器里先拦一道。 */
export const ACTIVITY_LIMITS = {
  slug: 64,
  assets: 30,
  assetName: 48,
  imageBytes: 5 * 1024 * 1024,
} as const;

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** 图片建议尺寸，编辑器里给运营看。 */
export const IMAGE_SPECS = {
  cover: { ratio: 2, hint: '1200 × 600' },
  hero: { ratio: 3, hint: '1800 × 600' },
} as const;

export const ASSET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

const assetSchema = z.object({
  name: z.string(),
  key: z.string(),
  url: z.string().nullish().transform((v) => v ?? null),
});

export type ActivityAsset = z.infer<typeof assetSchema>;

const nullableString = z.string().nullish().transform((v) => v ?? null);
const nullableNumber = z.number().nullish().transform((v) => v ?? null);

/** 一张已上传的图：可落库的 key + 不带协议头的公开地址（预览前用 {@link imageSrc} 补上）。 */
const imageSchema = z.object({ key: z.string(), url: nullableString });

export type ActivityImage = z.infer<typeof imageSchema>;

export const yomiActivitySchema = z.object({
  id: z.coerce.string(),
  slug: z.string(),
  theme: z.record(z.string(), z.string()).catch(() => ({ ...DEFAULT_THEME })),
  cover: imageSchema.nullish().transform((v) => v ?? null),
  hero: imageSchema.nullish().transform((v) => v ?? null),
  assets: z.array(assetSchema).default([]),
  linkUrl: nullableString,
  startAtUtc: nullableNumber,
  endAtUtc: nullableNumber,
  isPublished: z.boolean(),
  sortOrder: z.number().int(),
  status: z.enum(['ongoing', 'long_term', 'upcoming', 'ended']),
  /** 各语言已有的标题，列表显示用；语言包全文另取 `GET {id}/messages`。 */
  titles: z.record(z.string(), z.string()).default({}),
  /** 正文模板 */
  html: z.string().default(''),
  createdAtUtc: z.number(),
  updatedAtUtc: z.number(),
  updatedBy: z.coerce.string().nullish().transform((v) => v ?? null),
});

export type YomiActivity = z.infer<typeof yomiActivitySchema>;

/** 默认语言的标题，没填就退到任一语言，再退到 slug。 */
export function activityTitle(a: Pick<YomiActivity, 'titles' | 'slug'>): string {
  return a.titles[DEFAULT_LOCALE] || Object.values(a.titles).find(Boolean) || a.slug;
}

export const activityCountsSchema = z.object({
  all: z.number().int(),
  ongoing: z.number().int(),
  upcoming: z.number().int(),
  ended: z.number().int(),
});

export type ActivityCounts = z.infer<typeof activityCountsSchema>;

export const activityListSchema = z.object({
  items: z.array(yomiActivitySchema),
  total: z.number().int(),
  counts: activityCountsSchema,
});

export type ActivityListResult = z.infer<typeof activityListSchema>;

export interface ActivityListQuery {
  page: number;
  pageSize: number;
  status: ActivityStatusFilter;
  /** null 表示不限 */
  isPublished: boolean | null;
}

export interface ActivityInput {
  slug: string;
  theme: ActivityTheme;
  coverKey: string | null;
  heroKey: string | null;
  assets: { name: string; key: string }[];
  linkUrl: string | null;
  startAtUtc: number | null;
  endAtUtc: number | null;
  isPublished: boolean;
  sortOrder: number;
  html: string;
  /** 语言包的改动，只带变了的 key。 */
  messages: MessagesPatch;
}

/** 编辑器里的一张素材：上传中时还没有 key。 */
export interface EditableAsset {
  /** 本地行号，上传中还没有 key 时用作 v-for 的 key */
  uid: string;
  name: string;
  key: string | null;
  url: string | null;
  uploading: boolean;
}


/** Storage 的地址不带协议头；mock 的本地预览是 blob: 地址，原样用。 */
export function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/i.test(url) || url.startsWith('//')) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

/** 由文件名推一个素材名：小写、非字母数字换成 -，与已有名字撞了就加序号。 */
export function suggestAssetName(fileName: string, taken: Set<string>): string {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'img';
  const start = /^[a-z0-9]/.test(base) ? base : `img-${base}`;
  if (!taken.has(start)) return start;
  for (let i = 2; ; i++) {
    const name = `${start}-${i}`;
    if (!taken.has(name)) return name;
  }
}

// 与后端 Activity.AssetRefPattern 一致：前面紧跟字母数字的不算引用。
const ASSET_REF = /(?<![A-Za-z0-9_])asset:([a-z0-9][a-z0-9-]{0,47})/g;

/** 预览时把 `asset:名字` 换成素材地址；后端对外返回前做的是同一件事。 */
export function resolveAssetRefs(html: string, assets: readonly ActivityAsset[]): string {
  if (!assets.length || !html) return html;
  const urls = new Map(assets.filter((a) => a.url).map((a) => [a.name, imageSrc(a.url)!]));
  return html.replace(ASSET_REF, (whole, name: string) => urls.get(name) ?? whole);
}

/** 正文里引用了、但素材库里没有的名字，编辑器里提示出来。 */
export function missingAssetRefs(html: string, assets: readonly ActivityAsset[]): string[] {
  const names = new Set(assets.map((a) => a.name));
  const missing = new Set<string>();
  for (const m of html.matchAll(ASSET_REF)) if (!names.has(m[1]!)) missing.add(m[1]!);
  return [...missing];
}

// ---------------- 正文 HTML 的渲染外壳 ----------------

const FRAME_BASE_CSS
  = '*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;'
  + 'line-height:1.7;color:#2d2148;word-break:break-word}img,video{max-width:100%;height:auto}';

/**
 * 把一段正文 HTML 包成预览 iframe 的 srcdoc，基础样式与官网正文的 Shadow DOM 一致（Yomi App 的
 * lib/activityContent.ts），两边要一起改。主题变量设在 :root 上，正文样式里的 var(--activity-*) 才取得到——
 * 官网上它们从页面继承进影子树。AI 若给的是完整文档（带 <html>），原样使用。
 * `<base target="_top">` 让正文里的链接在整页打开，而不是在 iframe 里。
 */
export function buildActivityDocument(html: string, theme: ActivityTheme = DEFAULT_THEME): string {
  if (/<html[\s>]/i.test(html)) return html;
  const vars = Object.entries(themeCssVars(theme)).map(([k, v]) => `${k}:${v}`).join(';');
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<base target="_top"><style>:root{${vars}}${FRAME_BASE_CSS}</style></head><body>${html}</body></html>`;
}

/**
 * 不给 allow-scripts：AI 写的脚本、onclick 一律不执行。allow-same-origin 只是为了让外层量到内容高度，
 * 没有脚本权限时它碰不到外层页面。链接靠 allow-top-navigation-by-user-activation 在用户点击时整页跳转。
 */
export const ACTIVITY_FRAME_SANDBOX
  = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation';

// ---------------- AI 生成内容导入 ----------------

const AI_PROMPT_HEAD = `你是「悠米 AI」官网的活动页设计师。请为下面的活动写好内容，只输出一个 JSON 对象，不要任何解释。

JSON 格式：
{
  "slug": "url 用的英文短名，小写字母/数字/连字符，如 double-eleven",
  "theme": { "accent": "主色", "ink": "标题文字色", "banner": "没有图片时的占位背景，可用渐变", "orb": "光晕色，带透明度" }，只用颜色和渐变；也可以直接写预设名 __PRESETS__ 之一；省略就沿用当前主题,
  "linkUrl": "「立即参与」跳转的站内路径，如 /console/billing/topups，可省略",
  "startAt": "开始时间 ISO 8601（北京时间带 +08:00），长期活动可省略",
  "endAt": "结束时间 ISO 8601，长期活动可省略",
  "html": "详情页正文模板（要求见下），所有语言共用这一份",
  "messages": {
__LOCALES__
  }
}

模板与语言包：
- html 里不写任何直接显示的文字，所有文字（包括图片 alt）都写成 {{key}} 占位，例如 <h3>{{steps.title}}</h3>、<li>{{steps.1}}</li>。
- key 自己起，用小写英文、数字和 . _ -，按区块分组（lead、steps.1、rules.2 …）；title 留给活动名。
- messages 里每种语言一份语言包，key 完全一致，值是纯文字，不要带 HTML 标签。
- 页面顶部已经有 Hero 大图和活动名、时间、参与按钮，正文从「活动亮点」写起，不要再重复大标题。
- 只写页面主体片段，不要 <html>/<head>/<body>；可以带一个 <style> 标签，样式只作用于正文。
- 不要 <script>、不要 onclick 等事件属性（不会执行）；不要 position:fixed，不要用 vh/vw 单位。
- 风格：可爱、梦幻的魔法少女风，圆角卡片、柔和渐变，文字色 #2d2148。
- 配色用主题变量：var(--activity-accent)（主色）、var(--activity-ink)（标题色）、var(--activity-banner)（背景渐变）、var(--activity-orb)（光晕），换主题时正文跟着变。
- 不要使用 emoji，装饰用 CSS 渐变、形状和文字排版。
- 结构建议：活动亮点 → 参与方式（步骤卡片）→ 奖励说明 → 活动规则（列表）；宽度自适应，手机上也要好看。
- 站内链接用 / 开头的路径。`;

/** `messages` 里每种语言一份语言包，粘回来直接并进各语言的 JSON。 */
function localeLines(locales: readonly string[]): string {
  return locales.map((l, i) => {
    const title = l === DEFAULT_LOCALE ? '活动名，20 字内' : '活动名';
    const text = l === DEFAULT_LOCALE ? '模板里每个占位的文字' : '同一批 key 的译文';
    return `    "${l}": { "title": "${localeLabel(l)}${title}", "…": "${localeLabel(l)}${text}" }${i < locales.length - 1 ? ',' : ''}`;
  }).join('\n');
}

/**
 * 活动内容交给 AI 写：复制提示词给 AI，把它返回的 JSON 粘回编辑器即可一键填好。
 * 素材库里已有的图片会列给 AI，让它用 `asset:名字` 引用，而不是自己编图片地址；
 * 已配好的奖励也列给它，让它在奖励说明里摆上领取按钮。
 */
export function buildAiPrompt(
  assets: readonly { name: string }[],
  rewards: readonly { key: string; name: string }[] = [],
  locales: readonly string[] = [DEFAULT_LOCALE],
): string {
  const imageRule = assets.length
    ? `- 图片只能用下面这些素材，写法是 src="asset:名字" 或 CSS 里 url(asset:名字)，不要编造其他图片地址：\n${assets.map((a) => `  - asset:${a.name}`).join('\n')}`
    : '- 暂时没有素材图，不要使用 <img>，用 CSS 渐变和文字排版做装饰。';
  const rewardRule = rewards.length
    ? '- 奖励说明里要放领取按钮：在合适位置写 <yomi-claim reward="key"></yomi-claim>，页面会把它渲染成按钮'
      + '（自动处理登录、资格条件、库存和领取状态），不要自己写领取按钮、不要写「已领取」之类的状态文字。\n'
      + '- 每个奖励的名称也写进各语言的语言包，key 是 reward.{奖励 key}.name；按钮上显示的就是它。可用的奖励：\n'
      + rewards.map((r) => `  - ${r.key}${r.name ? `：${r.name}` : ''}`).join('\n')
    : '- 活动没有可在页面上领取的奖励，不要写领取按钮。';
  const head = AI_PROMPT_HEAD.replace('__LOCALES__', localeLines(locales)).replace('__PRESETS__', THEME_PRESETS.map((p) => p.key).join(' | '));
  return `${head}\n${imageRule}\n${rewardRule}\n\n活动主题：`;
}

const flexibleTime = z.union([z.number(), z.string()]).nullish().transform((v, ctx) => {
  if (v === null || v === undefined || v === '') return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (Number.isNaN(ms)) {
    ctx.addIssue({ code: 'custom', message: `无法识别的时间：${String(v)}` });
    return z.NEVER;
  }
  return ms;
});

const aiDraftSchema = z.object({
  slug: z.string().optional(),
  /** 预设名，或一组主题变量 */
  theme: z.union([z.enum(THEME_PRESETS.map((p) => p.key) as [string, ...string[]]), z.record(z.string(), z.string())]).optional(),
  linkUrl: z.string().nullish(),
  startAt: flexibleTime,
  endAt: flexibleTime,
  html: z.string().optional(),
  /** { 语言: { key: 文字 } }，就是各语言的语言包 */
  messages: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export type AiDraft = z.infer<typeof aiDraftSchema>;

/** 容忍 AI 常见的包装：```json 代码块、前后多余文字。 */
export function parseAiDraft(raw: string): { ok: true; draft: AiDraft } | { ok: false; message: string } {
  const json = extractJson(raw);
  if (!json.ok) return json;
  const r = aiDraftSchema.safeParse(json.value);
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? '格式不对' };
  return { ok: true, draft: r.data };
}
