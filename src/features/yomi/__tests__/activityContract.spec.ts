import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME } from '../model/activityTheme';
import {
  activityTitle,
  buildActivityDocument,
  buildAiPrompt,
  imageSrc,
  missingAssetRefs,
  parseAiDraft,
  resolveAssetRefs,
  suggestAssetName,
  yomiActivitySchema,
} from '../model/activity.types';

/**
 * 活动中心：线上格式按 Meeko.Yomi `ActivityAdminDto`（camelCase、毫秒时间、snake_case 状态）；
 * `asset:名字` 的替换规则要与后端 Activity.ResolveAssetRefs 一致。
 */
describe('activity wire contract', () => {
  it('parses the admin DTO as the backend serializes it', () => {
    const r = yomiActivitySchema.safeParse({
      id: '42',
      slug: 'invite',
      theme: { accent: '#d8668f', ink: '#c2477a', banner: 'linear-gradient(135deg, #ffeaf2, #fbd3e4)', orb: 'rgba(244, 168, 192, 0.55)', 'accent-dark': '#f0a8c8' },
      cover: { key: 'static/blobs/aa/x', url: 'cdn.example.com/blobs/aa/x' },
      hero: null,
      assets: [{ name: 'gift', key: 'static/blobs/bb/y', url: 'cdn.example.com/blobs/bb/y' }],
      linkUrl: '/console/referral',
      startAtUtc: null,
      endAtUtc: null,
      isPublished: true,
      sortOrder: 10,
      status: 'long_term',
      titles: { zh: '邀请', en: 'Invite' },
      html: '<p>{{lead}}</p>',
      createdAtUtc: 1761350400000,
      updatedAtUtc: 1761350400000,
      updatedBy: '900001',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cover?.key).toBe('static/blobs/aa/x');
      expect(r.data.hero).toBeNull();
      expect(r.data.theme['accent-dark']).toBe('#f0a8c8');
      expect(activityTitle(r.data)).toBe('邀请');
      expect(r.data.html).toBe('<p>{{lead}}</p>');
    }
  });

  it('defaults missing assets and falls back to the default theme for a malformed one', () => {
    const r = yomiActivitySchema.safeParse({
      id: 1, slug: 'x', theme: 'neon', isPublished: false, sortOrder: 0, status: 'ended',
      createdAtUtc: 0, updatedAtUtc: 0,
    });
    expect(r.success && r.data.theme).toEqual(DEFAULT_THEME);
    expect(r.success && r.data.assets).toEqual([]);
  });

  it('titles fall back from the default locale to any locale, then to the slug', () => {
    expect(activityTitle({ slug: 'x', titles: { en: 'Only English' } })).toBe('Only English');
    expect(activityTitle({ slug: 'x', titles: {} })).toBe('x');
  });
});

describe('asset references', () => {
  const assets = [{ name: 'gift', key: 'k1', url: 'cdn.example.com/a.webp' }];

  it('replaces src and css url references, leaving glued text and unknown names alone', () => {
    const html = '<img src="asset:gift"><i style="background:url(asset:gift)"></i>xasset:gift asset:missing';
    expect(resolveAssetRefs(html, assets)).toBe(
      '<img src="https://cdn.example.com/a.webp"><i style="background:url(https://cdn.example.com/a.webp)"></i>xasset:gift asset:missing',
    );
  });

  it('reports references that the library does not have', () => {
    expect(missingAssetRefs('<img src="asset:gift"><img src="asset:bow">', assets)).toEqual(['bow']);
  });

  it('suggests unique, valid names from file names', () => {
    const taken = new Set(['gift']);
    expect(suggestAssetName('Gift.PNG', taken)).toBe('gift-2');
    expect(suggestAssetName('礼物 图.png', taken)).toBe('img');
    expect(suggestAssetName('_hero bg@2x.webp', taken)).toBe('hero-bg-2x');
  });

  it('keeps blob/data/absolute urls and adds https to bare hosts', () => {
    expect(imageSrc('blob:http://x/1')).toBe('blob:http://x/1');
    expect(imageSrc('cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(imageSrc(null)).toBeNull();
  });
});

describe('buildAiPrompt', () => {
  it('lists the uploaded assets so the AI references them by name', () => {
    const prompt = buildAiPrompt([{ name: 'gift' }, { name: 'ribbon' }]);
    expect(prompt).toContain('asset:gift');
    expect(prompt).toContain('asset:ribbon');
  });

  it('tells the AI not to use images when there are no assets', () => {
    expect(buildAiPrompt([])).toContain('不要使用 <img>');
  });

  it('asks for one template with {{key}} placeholders and one language bundle per supported locale', () => {
    const prompt = buildAiPrompt([], [], ['zh', 'en']);
    expect(prompt).toContain('"html": "详情页正文模板');
    expect(prompt).toContain('{{key}} 占位');
    expect(prompt).toContain('"zh": { "title": "中文活动名，20 字内"');
    expect(prompt).toContain('"en": { "title": "英语活动名", "…": "英语同一批 key 的译文" }');
  });
});

describe('buildActivityDocument', () => {
  it('wraps a fragment so links open in the top window', () => {
    const doc = buildActivityDocument('<p>hi</p>');
    expect(doc).toContain('<base target="_top">');
    expect(doc).toContain('<body><p>hi</p></body>');
  });

  it('keeps a full document from the AI as-is', () => {
    const full = '<!doctype html><html><head></head><body>x</body></html>';
    expect(buildActivityDocument(full)).toBe(full);
  });
});

describe('parseAiDraft', () => {
  it('extracts JSON (with HTML inside) from a fenced block with chatter around it', () => {
    const json = JSON.stringify({
      slug: 'double-eleven',
      theme: 'warm',
      startAt: '2026-11-01T00:00:00+08:00',
      html: '<style>.a{color:#5d3fa8}</style><img src="asset:gift" alt="{{lead.alt}}"><p>{{lead}}</p>',
      messages: { zh: { title: '双十一', lead: '买一送一', 'lead.alt': '礼物' }, en: { title: 'Double 11', lead: 'Buy one get one' } },
    });
    const r = parseAiDraft(`好的！\n\`\`\`json\n${json}\n\`\`\`\n祝顺利`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.slug).toBe('double-eleven');
    expect(r.draft.startAt).toBe(Date.parse('2026-11-01T00:00:00+08:00'));
    expect(r.draft.html).toContain('{{lead}}');
    expect(r.draft.messages?.en?.lead).toBe('Buy one get one');
    expect(r.draft.endAt).toBeNull();
  });

  it('reports unreadable times, missing objects and invalid themes', () => {
    expect(parseAiDraft('{"startAt":"next friday"}').ok).toBe(false);
    expect(parseAiDraft('这里没有 JSON').ok).toBe(false);
    expect(parseAiDraft('{"theme":"neon"}').ok).toBe(false);
  });
});
