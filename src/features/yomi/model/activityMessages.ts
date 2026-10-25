/**
 * 活动语言包（后端 Meeko.Yomi `activity_locales`）：每种语言一份扁平的 `{ key: 文案 }` JSON。
 * 活动的正文只有一份模板，文字一律写成 `{{key}}` 占位；页面按访客语言取语言包替换后渲染。
 * 奖励只有结构，名称、兑换说明、条件提示、实物的登记项也是语言包里的 key（`reward.{key}.*`）。
 *
 * 有哪些语言以后端 `GET {id}/messages` 返回的为准，后端加一种语言前端不用改。
 * 保存时只提交改动 `{ 语言: { key: 文案 | null } }`，null 表示删掉这个 key。
 */

export type LocaleMessages = Record<string, string>;
export type ActivityMessages = Record<string, LocaleMessages>;
export type MessagesPatch = Record<string, Record<string, string | null>>;

/** 与后端 ActivityLocales.Default 一致：缺译文时回退到它，上架前它必须齐。 */
export const DEFAULT_LOCALE = 'zh';

/** 新建活动还没拿到后端的语言列表，先按这两种编辑；与后端 ActivityLocales.Supported 一致。 */
export const FALLBACK_LOCALES: readonly string[] = ['zh', 'en'];

export const messageKeys = {
  title: 'title',
  rewardPrefix: (reward: string) => `reward.${reward}.`,
  rewardName: (reward: string) => `reward.${reward}.name`,
  rewardUsage: (reward: string) => `reward.${reward}.usage`,
  ruleMessage: (reward: string, ruleId: string) => `reward.${reward}.rule.${ruleId}`,
  registrationField: (reward: string, fieldId: string) => `reward.${reward}.field.${fieldId}`,
  registrationOption: (reward: string, fieldId: string, option: string) => `reward.${reward}.field.${fieldId}.${option}`,
} as const;

/** 与后端 ActivityMessageKeys 的上限一致。 */
export const MESSAGE_LIMITS = {
  title: 80,
  text: 4000,
  rewardName: 60,
  rewardUsage: 800,
  ruleMessage: 160,
  fieldLabel: 60,
  keys: 500,
  template: 200_000,
} as const;

const KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
// 与后端 ActivityMessageKeys.RewardKeyPattern 一致；登记项与选项的写法与 ActivityRegistrationField 一致。
const REWARD_FIELD = /^reward\.([a-z0-9][a-z0-9-]{0,47})\.(name|usage|rule\.[a-z0-9]{1,16}|field\.[a-z0-9][a-z0-9_]{0,31}(?:\.[a-z0-9][a-z0-9_-]{0,31})?)$/;
// 与后端 ActivityMessageKeys.PlaceholderPattern、官网 lib/activityTemplate.ts 一致，三处要一起改。
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9][A-Za-z0-9_.-]{0,79})\s*\}\}/g;

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['zh-CN'], { type: 'language' });
  } catch {
    return null;
  }
})();

/** 管理台是中文界面：zh → 中文、en → 英语、ja → 日语。 */
export function localeLabel(locale: string): string {
  return displayNames?.of(locale) ?? locale;
}

/** 默认语言排第一，其余保持后端给的顺序。 */
export function orderLocales(locales: Iterable<string>): string[] {
  const list = [...new Set(locales)];
  return list.includes(DEFAULT_LOCALE) ? [DEFAULT_LOCALE, ...list.filter((l) => l !== DEFAULT_LOCALE)] : list;
}

export function emptyMessages(locales: readonly string[]): ActivityMessages {
  return Object.fromEntries(locales.map((l) => [l, {}]));
}

/** 去掉首尾空白、丢掉空值：与后端落库时一样，用来比较和作为保存后的基线。 */
export function normalizeMessages(m: ActivityMessages): ActivityMessages {
  return Object.fromEntries(Object.entries(m).map(([locale, texts]) => [
    locale,
    Object.fromEntries(Object.entries(texts).flatMap(([k, v]) => (v.trim() ? [[k, v.trim()]] : []))),
  ]));
}

/** 本语言有就用，没有回退默认语言。 */
export function textOf(m: ActivityMessages, locale: string, key: string): string | null {
  return m[locale]?.[key]?.trim() || m[DEFAULT_LOCALE]?.[key]?.trim() || null;
}

export function hasChanges(patch: MessagesPatch): boolean {
  return Object.values(patch).some((p) => Object.keys(p).length > 0);
}

/** 两份语言包的差异，只含改了的 key；删掉或清空的给 null。 */
export function diffMessages(before: ActivityMessages, after: ActivityMessages): MessagesPatch {
  const a = normalizeMessages(before);
  const b = normalizeMessages(after);
  const patch: MessagesPatch = {};
  for (const locale of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = a[locale] ?? {};
    const to = b[locale] ?? {};
    const changes: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(to)) if (from[k] !== v) changes[k] = v;
    for (const k of Object.keys(from)) if (!(k in to)) changes[k] = null;
    if (Object.keys(changes).length) patch[locale] = changes;
  }
  return patch;
}

/** 按后端的合并语义套上一份改动：值为空表示删掉。 */
export function applyPatch(base: ActivityMessages, patch: MessagesPatch): ActivityMessages {
  const next: ActivityMessages = Object.fromEntries(Object.entries(base).map(([l, m]) => [l, { ...m }]));
  for (const [locale, changes] of Object.entries(patch)) {
    const target = (next[locale] ??= {});
    for (const [k, v] of Object.entries(changes)) {
      if (v?.trim()) target[k] = v.trim();
      else delete target[k];
    }
  }
  return next;
}

// ---------------- 模板 ----------------

/** 模板里用到的 key，去重、按出现顺序。 */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * 把 `{{key}}` 换成文字（按纯文本转义，属性里也安全）。取不到的原样留着，预览里一眼能看出漏了哪个 key。
 * 官网用的是同一个规则（lib/activityTemplate.ts）。
 */
export function renderTemplate(template: string, text: (key: string) => string | null): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const v = text(key);
    return v === null ? whole : escapeHtml(v);
  });
}

/**
 * 上架前默认语言必须有的 key：活动名、模板里每个占位、启用奖励要的文案（名称、实物的登记项，
 * 见 activityReward.types.ts 的 rewardRequiredKeys）。与后端 MissingForPublish 一致。
 */
export function requiredKeys(template: string, rewardKeys: readonly string[]): string[] {
  return [...new Set([messageKeys.title, ...placeholders(template), ...rewardKeys])];
}

/**
 * 一种语言还缺的 key。默认语言：必须有的没写；其他语言：必须有的加上默认语言里已有的，这个语言还没翻的
 * （不翻也能上架，页面回落到默认语言，只是会混着中文）。
 */
export function missingKeys(m: ActivityMessages, locale: string, required: readonly string[]): string[] {
  const own = m[locale] ?? {};
  const wanted = locale === DEFAULT_LOCALE ? required : [...new Set([...required, ...Object.keys(m[DEFAULT_LOCALE] ?? {})])];
  return wanted.filter((k) => !own[k]?.trim());
}

// ---------------- 奖励改名 / 删除时跟着动 ----------------

/** 奖励改了 key：它名下的文案搬到新 key 下（后端保存奖励时也这么搬）。 */
export function renameRewardKeys(m: LocaleMessages, from: string, to: string): LocaleMessages {
  if (from === to) return m;
  const fromPrefix = messageKeys.rewardPrefix(from);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [
    k.startsWith(fromPrefix) ? messageKeys.rewardPrefix(to) + k.slice(fromPrefix.length) : k,
    v,
  ]));
}

/**
 * 删掉奖励名下的文案；给了 keep 时只删它说用不上的。参数是 key 去掉 `reward.{key}.` 后的部分
 * （如 `rule.r1`、`field.size.m`），后端同样处理。
 */
export function dropRewardKeys(m: LocaleMessages, reward: string, keep?: (field: string) => boolean): LocaleMessages {
  const prefix = messageKeys.rewardPrefix(reward);
  return Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(prefix) || (keep?.(k.slice(prefix.length)) ?? false)));
}

// ---------------- 语言包 JSON ----------------

/** 不合规的 key 返回原因；给了 rewardKeys 时奖励名下的 key 只认本活动已有的奖励。 */
export function invalidMessageKey(key: string, rewardKeys: ReadonlySet<string> | null): string | null {
  if (!key.startsWith('reward.')) return KEY.test(key) ? null : `key「${key}」只能用字母、数字和 _ . -，以字母或数字开头，最长 80`;
  const m = REWARD_FIELD.exec(key);
  if (!m) return `「${key}」不对：reward. 开头的只能是 reward.{奖励 key}.name / usage / rule.{条件 id} / field.{登记项 id}[.{选项}]`;
  if (rewardKeys && !rewardKeys.has(m[1]!)) return `「${key}」引用的奖励 ${m[1]} 不存在，先建奖励`;
  return null;
}

export function messageLimit(key: string): number {
  if (key === messageKeys.title) return MESSAGE_LIMITS.title;
  const field = REWARD_FIELD.exec(key)?.[2];
  if (!field) return MESSAGE_LIMITS.text;
  if (field === 'name') return MESSAGE_LIMITS.rewardName;
  if (field === 'usage') return MESSAGE_LIMITS.rewardUsage;
  if (field.startsWith('field.')) return MESSAGE_LIMITS.fieldLabel;
  return MESSAGE_LIMITS.ruleMessage;
}

/** title 在前，模板自己的 key 按字母排，reward.* 放最后，读起来顺。 */
export function sortedMessages(m: LocaleMessages): LocaleMessages {
  const rank = (k: string) => (k === messageKeys.title ? 0 : k.startsWith('reward.') ? 2 : 1);
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)));
}

export function formatBundle(m: LocaleMessages): string {
  return `${JSON.stringify(sortedMessages(m), null, 2)}\n`;
}

/** 截出 AI 回复里的 JSON 对象：容忍 ```json 代码块和前后多余的话。 */
export function extractJson(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, message: '没找到 JSON 对象' };
  try {
    return { ok: true, value: JSON.parse(body.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, message: `JSON 解析失败：${(e as Error).message}` };
  }
}

/**
 * 一种语言的语言包 JSON。值必须都是字符串，key 与长度按后端规则先查一遍；空字符串保留
 * （「补齐缺的 key」插进来等人填的），保存时才丢掉。
 */
export function parseBundle(raw: string, rewardKeys: ReadonlySet<string> | null): { ok: true; messages: LocaleMessages } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: true, messages: {} };
  const json = extractJson(raw);
  if (!json.ok) return json;
  if (typeof json.value !== 'object' || json.value === null || Array.isArray(json.value)) return { ok: false, message: '要的是 { key: 文案 } 形式的对象' };
  const messages: LocaleMessages = {};
  for (const [k, v] of Object.entries(json.value)) {
    if (typeof v !== 'string') return { ok: false, message: `「${k}」的值不是字符串` };
    const invalid = invalidMessageKey(k, rewardKeys);
    if (invalid) return { ok: false, message: invalid };
    if (v.trim().length > messageLimit(k)) return { ok: false, message: `「${k}」超过 ${messageLimit(k)} 字` };
    messages[k] = v;
  }
  if (Object.keys(messages).length > MESSAGE_LIMITS.keys) return { ok: false, message: `最多 ${MESSAGE_LIMITS.keys} 个 key` };
  return { ok: true, messages };
}

/** 把默认语言的整包交给 AI 翻成目标语言，回复整个粘进目标语言的 JSON 即可。 */
export function buildTranslatePrompt(source: LocaleMessages, from: string, to: string): string {
  return `把下面这份活动页语言包从${localeLabel(from)}翻译成${localeLabel(to)}（语言代码 ${to}），只输出 JSON，不要任何解释。

要求：
- key 原样保留，不增不减，只翻译值。
- 值都是纯文字，不要加 HTML 标签。
- 语气与原文一致：活泼、可爱、简洁；奖励名里的金额、数字不要改。
- 不要使用 emoji。

${formatBundle(source)}`;
}
