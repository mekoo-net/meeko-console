import { describe, expect, it } from 'vitest';

import {
  applyPatch,
  buildTranslatePrompt,
  diffMessages,
  dropRewardKeys,
  localeLabel,
  missingKeys,
  orderLocales,
  parseBundle,
  placeholders,
  renameRewardKeys,
  renderTemplate,
  requiredKeys,
  textOf,
} from '../model/activityMessages';

/**
 * 活动语言包：一份 {{key}} 模板 + 每种语言一份扁平 JSON。保存只提交改动、null 表示删掉，
 * 与后端 ActivityLocaleBundle.Apply 的合并语义一致；占位规则与后端、官网一致。
 */
describe('language bundle diff', () => {
  const saved = { zh: { title: '充值有礼', lead: '多充多得' }, en: { title: 'Top-up' } };

  it('sends only changed keys and null for removed or blanked ones', () => {
    const edited = { zh: { title: '充值有礼 ', lead: '充得越多送得越多' }, en: { title: '  ' } };
    expect(diffMessages(saved, edited)).toEqual({ zh: { lead: '充得越多送得越多' }, en: { title: null } });
  });

  it('is empty when nothing changed, ignoring surrounding whitespace', () => {
    expect(diffMessages(saved, { zh: { title: ' 充值有礼', lead: '多充多得\n' }, en: { title: 'Top-up' } })).toEqual({});
  });

  it('applies a patch the way the backend merges it', () => {
    expect(applyPatch(saved, { zh: { lead: null }, en: { lead: ' More bonus ' } }))
      .toEqual({ zh: { title: '充值有礼' }, en: { title: 'Top-up', lead: 'More bonus' } });
  });

  it('falls back to the default locale', () => {
    expect(textOf(saved, 'en', 'lead')).toBe('多充多得');
    expect(textOf(saved, 'en', 'title')).toBe('Top-up');
    expect(textOf(saved, 'en', 'nope')).toBeNull();
  });

  it('puts the default locale first and labels locales in Chinese', () => {
    expect(orderLocales(['en', 'ja', 'zh'])).toEqual(['zh', 'en', 'ja']);
    expect(localeLabel('zh')).toBe('中文');
  });
});

describe('template', () => {
  const template = '<h3>{{ steps.title }}</h3><img src="asset:gift" alt="{{lead.alt}}"><p>{{lead}}</p><p>{{lead}}</p>{{ not a key }}';

  it('collects each placeholder once, in order', () => {
    expect(placeholders(template)).toEqual(['steps.title', 'lead.alt', 'lead']);
  });

  it('fills placeholders as escaped text and leaves unknown ones visible', () => {
    const texts: Record<string, string> = { 'steps.title': '参与方式', 'lead.alt': '"礼物" <b>' };
    expect(renderTemplate(template, (k) => texts[k] ?? null))
      .toBe('<h3>参与方式</h3><img src="asset:gift" alt="&quot;礼物&quot; &lt;b&gt;"><p>{{lead}}</p><p>{{lead}}</p>{{ not a key }}');
  });

  it('requires the title, every placeholder and each enabled reward name, and reports gaps per language', () => {
    const required = requiredKeys('<p>{{lead}}</p>', ['reward.jd.name']);
    expect(required).toEqual(['title', 'lead', 'reward.jd.name']);
    const m = { zh: { title: '充值', lead: '多充多得', 'reward.jd.rule.r1': '先充值' }, en: { title: 'Top-up' } };
    expect(missingKeys(m, 'zh', required)).toEqual(['reward.jd.name']);
    // 其他语言还要把默认语言里已有的都翻了。
    expect(missingKeys(m, 'en', required)).toEqual(['lead', 'reward.jd.name', 'reward.jd.rule.r1']);
  });
});

describe('reward keys follow the reward', () => {
  const pack = { title: 't', 'reward.jd.name': '京东卡', 'reward.jd.rule.r1': '先充值', 'reward.jd.rule.r2': '留着', 'reward.plush.name': '公仔' };

  it('moves to the new key on rename', () => {
    expect(Object.keys(renameRewardKeys(pack, 'jd', 'jd-50')).sort())
      .toEqual(['reward.jd-50.name', 'reward.jd-50.rule.r1', 'reward.jd-50.rule.r2', 'reward.plush.name', 'title']);
  });

  it('drops a deleted reward, or only the keys it no longer owns', () => {
    expect(dropRewardKeys(pack, 'jd')).toEqual({ title: 't', 'reward.plush.name': '公仔' });
    expect(dropRewardKeys(pack, 'jd', (field) => field !== 'rule.r1')).toEqual({ title: 't', 'reward.jd.name': '京东卡', 'reward.jd.rule.r2': '留着', 'reward.plush.name': '公仔' });
  });
});

describe('language bundle JSON', () => {
  const rewards = new Set(['jd']);

  it('reads a fenced reply and keeps blank values for later filling', () => {
    const r = parseBundle('Here you go:\n```json\n{ "title": "Top-up", "steps.1": "", "reward.jd.name": "JD card" }\n```', rewards);
    expect(r).toEqual({ ok: true, messages: { title: 'Top-up', 'steps.1': '', 'reward.jd.name': 'JD card' } });
  });

  it('accepts registration field labels and option texts under a reward', () => {
    expect(parseBundle('{ "reward.jd.field.size": "尺码", "reward.jd.field.size.m": "中号" }', rewards).ok).toBe(true);
    expect(parseBundle(`{ "reward.jd.field.size": "${'x'.repeat(61)}" }`, rewards).ok).toBe(false);
    expect(parseBundle('{ "reward.jd.field.Size": "x" }', rewards).ok).toBe(false);
  });

  it('rejects malformed keys, unknown rewards, non-strings and over-long texts', () => {
    expect(parseBundle('{ "hero title": "x" }', rewards).ok).toBe(false);
    expect(parseBundle('{ "reward.jd.desc": "x" }', rewards).ok).toBe(false);
    expect(parseBundle('{ "reward.plush.name": "x" }', rewards).ok).toBe(false);
    expect(parseBundle('{ "reward.plush.name": "x" }', null).ok).toBe(true);
    expect(parseBundle('{ "title": 1 }', rewards).ok).toBe(false);
    expect(parseBundle(`{ "reward.jd.name": "${'x'.repeat(61)}" }`, rewards).ok).toBe(false);
    expect(parseBundle('[]', rewards).ok).toBe(false);
    expect(parseBundle('  ', rewards)).toEqual({ ok: true, messages: {} });
  });

  it('hands the AI the source bundle with title first and reward keys last', () => {
    const prompt = buildTranslatePrompt({ 'reward.jd.name': '京东卡', lead: '嗨', title: '充值' }, 'zh', 'en');
    expect(prompt).toContain('从中文翻译成英语（语言代码 en）');
    expect(prompt.indexOf('"title"')).toBeLessThan(prompt.indexOf('"lead"'));
    expect(prompt.indexOf('"lead"')).toBeLessThan(prompt.indexOf('"reward.jd.name"'));
  });
});
