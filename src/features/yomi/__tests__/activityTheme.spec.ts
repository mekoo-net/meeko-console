import { describe, expect, it } from 'vitest';

import { buildActivityDocument } from '../model/activity.types';
import { renderClaimPlaceholders } from '../model/activityReward.types';
import {
  THEME_PRESETS,
  formatGradient,
  parseGradient,
  presetKeyOf,
  presetTheme,
  themeCssVars,
  themeProblem,
  validTheme,
} from '../model/activityTheme';

/**
 * 主题就是一组 CSS 变量：预设只是现成取值，改过就是自定义；校验规则与后端 ActivityTheme 一致，
 * 值进的是页面 style，跳出声明、加载外部资源的写法都不行。
 */
describe('activity theme', () => {
  it('presets are complete and recognized; any edit makes it custom', () => {
    for (const p of THEME_PRESETS) {
      expect(themeProblem(p.theme)).toBeNull();
      expect(presetKeyOf(presetTheme(p.key))).toBe(p.key);
    }
    expect(presetKeyOf({ ...presetTheme('pink'), accent: '#000000' })).toBeNull();
    // 空的深色值等于没写，不影响认出预设。
    expect(presetKeyOf({ ...presetTheme('pink'), 'orb-dark': '' })).toBe('pink');
  });

  it('rejects unknown variables, missing ones and values that could escape or load resources', () => {
    const base = presetTheme('blue');
    expect(themeProblem({ ...base, font: 'serif' })).toContain('font');
    expect(themeProblem({ accent: '#000' })).toContain('标题色');
    for (const bad of ['url(//evil.example/x.png)', 'url(x.png)', 'red}body{color:red', '"red"', 'red; color: blue']) {
      expect(themeProblem({ ...base, banner: bad })).toContain('banner');
    }
    expect(validTheme({ ...base, banner: 'url(x.png)' })).not.toHaveProperty('banner');
  });

  it('exposes --activity-* variables, dark ones falling back to light', () => {
    const theme = { accent: '#111', ink: '#222', button: '#555', banner: '#333', orb: '#444', 'accent-dark': '#aaa' };
    expect(themeCssVars(theme)).toEqual({
      '--activity-accent': '#111', '--activity-ink': '#222', '--activity-button': '#555', '--activity-banner': '#333', '--activity-orb': '#444',
    });
    expect(themeCssVars(theme, true)['--activity-accent']).toBe('#aaa');
    expect(themeCssVars(theme, true)['--activity-ink']).toBe('#222');
  });

  it('reads and rewrites gradient color stops for the pickers', () => {
    const g = parseGradient('linear-gradient(135deg, #f3eaff 0%, rgba(226, 211, 255, 0.8) 55%, #f9dcef 100%)')!;
    expect(g.head).toBe('135deg');
    expect(g.stops.map((s) => s.color)).toEqual(['#f3eaff', 'rgba(226, 211, 255, 0.8)', '#f9dcef']);
    g.stops[1] = { ...g.stops[1]!, color: '#000000' };
    expect(formatGradient(g)).toBe('linear-gradient(135deg, #f3eaff 0%, #000000 55%, #f9dcef 100%)');
    expect(parseGradient('#9b7bd8')).toBeNull();
    expect(parseGradient('radial-gradient(#fff, #000)')?.stops.length).toBe(2);
  });

  it('feeds the preview frame and claim buttons, so templates can use var(--activity-*)', () => {
    const doc = buildActivityDocument('<p style="color:var(--activity-ink)">hi</p>', presetTheme('warm'));
    expect(doc).toContain(':root{--activity-accent:#d9792b;--activity-ink:#c4621c;--activity-button:');
    expect(renderClaimPlaceholders('<yomi-claim reward="a"></yomi-claim>', new Map([['a', 'A']]), '领取')).toContain('var(--activity-button');
  });
});
