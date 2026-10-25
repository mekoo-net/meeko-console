/**
 * 活动主题就是一组 CSS 变量（后端 Meeko.Yomi `ActivityTheme`）：官网把它们设成 `--activity-{名字}`，
 * 卡片、信息栏、按钮、领取按钮和正文模板的样式都用它配色。预设只是几组现成的取值，存下来的是值本身，可以随意改。
 * 每个变量可以再给一个 `{名字}-dark`，深色模式下用它，没给就沿用浅色的。
 */

export const THEME_TOKENS = ['accent', 'ink', 'button', 'banner', 'orb'] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];

export const themeTokenLabels: Record<ThemeToken, string> = {
  accent: '强调色',
  ink: '标题色',
  button: '按钮',
  banner: '占位背景',
  orb: '光晕',
};

/** 名字 → CSS 值 */
export type ActivityTheme = Record<string, string>;

export const DARK = '-dark';
const MAX_VALUE = 300;
// 与后端 ActivityTheme 的校验一致：值进的是页面 style，只放行颜色、渐变用得到的字符，挡掉能加载外部资源的函数。
const SAFE_VALUE = /^[A-Za-z0-9#(),.%\s-]+$/;
const FORBIDDEN = /url|image|element|expression|attr/i;

export interface ThemePreset {
  key: string;
  label: string;
  theme: ActivityTheme;
}

/** 浅色取值与官网原先的四套配色一致；按钮渐变是各自主色的深浅两档。 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    key: 'purple',
    label: '魔法紫',
    theme: {
      accent: '#5d3fa8',
      ink: '#5d3fa8',
      button: 'linear-gradient(135deg, #9b7bd8 0%, #f4a8c0 100%)',
      banner: 'linear-gradient(135deg, #f3eaff 0%, #e2d3ff 55%, #f9dcef 100%)',
      orb: 'rgba(155, 123, 216, 0.45)',
      'accent-dark': '#c4a8f0',
      'ink-dark': '#d4bdf7',
      'banner-dark': 'linear-gradient(135deg, #2e2148 0%, #382044 100%)',
    },
  },
  {
    key: 'pink',
    label: '樱粉',
    theme: {
      accent: '#d8668f',
      ink: '#c2477a',
      button: 'linear-gradient(135deg, #e0769d 0%, #f6b3cb 100%)',
      banner: 'linear-gradient(135deg, #ffeaf2 0%, #fbd3e4 55%, #f1d9ff 100%)',
      orb: 'rgba(244, 168, 192, 0.55)',
      'accent-dark': '#f0a8c8',
      'ink-dark': '#f6b8d2',
      'banner-dark': 'linear-gradient(135deg, #3a2034 0%, #2d1d3d 100%)',
    },
  },
  {
    key: 'blue',
    label: '天空蓝',
    theme: {
      accent: '#2f78c4',
      ink: '#2a6bb0',
      button: 'linear-gradient(135deg, #4a8fd8 0%, #9cc6f0 100%)',
      banner: 'linear-gradient(135deg, #e8f3ff 0%, #d3e6ff 55%, #e7dcff 100%)',
      orb: 'rgba(123, 184, 232, 0.55)',
      'accent-dark': '#8ec4f0',
      'ink-dark': '#a9d1f5',
      'banner-dark': 'linear-gradient(135deg, #1b2a48 0%, #28224a 100%)',
    },
  },
  {
    key: 'warm',
    label: '暖橙',
    theme: {
      accent: '#d9792b',
      ink: '#c4621c',
      button: 'linear-gradient(135deg, #e8893c 0%, #f8c48b 100%)',
      banner: 'linear-gradient(135deg, #fff3e2 0%, #ffe0c4 55%, #ffd8e4 100%)',
      orb: 'rgba(248, 184, 107, 0.55)',
      'accent-dark': '#f8b86b',
      'ink-dark': '#fbc98a',
      'banner-dark': 'linear-gradient(135deg, #3a2a1e 0%, #3a2030 100%)',
    },
  },
];

export const DEFAULT_THEME: ActivityTheme = THEME_PRESETS[0]!.theme;

export function presetTheme(key: string): ActivityTheme {
  return { ...(THEME_PRESETS.find((p) => p.key === key) ?? THEME_PRESETS[0]!).theme };
}

/** 主题和哪套预设完全一样；改过就是自定义，返回 null。 */
export function presetKeyOf(theme: ActivityTheme): string | null {
  const same = (a: ActivityTheme, b: ActivityTheme) => {
    const ka = Object.keys(a).filter((k) => a[k]).sort();
    const kb = Object.keys(b).filter((k) => b[k]).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  };
  return THEME_PRESETS.find((p) => same(p.theme, theme))?.key ?? null;
}

// ---------------- 校验 ----------------

export function invalidThemeValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > MAX_VALUE) return `最长 ${MAX_VALUE} 个字符`;
  if (!SAFE_VALUE.test(v) || FORBIDDEN.test(v)) return '只能用颜色和渐变，如 #9b7bd8、rgba(…)、linear-gradient(…)';
  return null;
}

/** 整套主题的第一个问题；与后端 ActivityTheme.Normalize 的规则一致。 */
export function themeProblem(theme: ActivityTheme): string | null {
  for (const [key, value] of Object.entries(theme)) {
    const token = key.endsWith(DARK) ? key.slice(0, -DARK.length) : key;
    if (!(THEME_TOKENS as readonly string[]).includes(token)) return `不认识的主题变量 ${key}`;
    const invalid = invalidThemeValue(value);
    if (invalid) return `${key}：${invalid}`;
  }
  const missing = THEME_TOKENS.filter((t) => !theme[t]?.trim());
  return missing.length ? `主题还缺：${missing.map((t) => themeTokenLabels[t]).join('、')}` : null;
}

/** 只留合法的值，给预览用：写到一半的值不往样式里塞。 */
export function validTheme(theme: ActivityTheme): ActivityTheme {
  return Object.fromEntries(Object.entries(theme).filter(([, v]) => v.trim() && !invalidThemeValue(v)));
}

/** 浅色（或深色，缺的回落到浅色）下的 `--activity-*` 变量，给预览设到元素或 iframe 上。 */
export function themeCssVars(theme: ActivityTheme, dark = false): Record<string, string> {
  return Object.fromEntries(THEME_TOKENS.flatMap((t) => {
    const v = (dark ? theme[t + DARK] : undefined) ?? theme[t];
    return v ? [[`--activity-${t}`, v]] : [];
  }));
}

// ---------------- 渐变的颜色点：给取色器用 ----------------

export interface GradientStop {
  color: string;
  /** 颜色后面的位置等，原样保留，如 "55%" */
  rest: string;
}

export interface Gradient {
  fn: string;
  /** 角度、方向等第一段参数，没有为空 */
  head: string;
  stops: GradientStop[];
}

/** 按最外层的逗号切开，rgba(…) 里的逗号不算。 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

function splitStop(part: string): GradientStop {
  const fn = part.match(/^[a-z]+\(/i);
  if (fn) {
    const end = part.indexOf(')');
    return { color: part.slice(0, end + 1), rest: part.slice(end + 1).trim() };
  }
  const [color = '', ...rest] = part.split(/\s+/);
  return { color, rest: rest.join(' ') };
}

/** 读出线性 / 径向渐变的各个颜色点；不是渐变返回 null。 */
export function parseGradient(value: string): Gradient | null {
  const m = value.trim().match(/^((?:repeating-)?(?:linear|radial|conic)-gradient)\(([\s\S]*)\)$/i);
  if (!m) return null;
  const parts = splitTopLevel(m[2]!);
  const first = parts[0] ?? '';
  const isHead = /^(to\s|from\s|at\s|circle|ellipse|-?[\d.]+(deg|turn|rad|grad))/i.test(first);
  const stops = (isHead ? parts.slice(1) : parts).map(splitStop);
  return stops.length >= 2 ? { fn: m[1]!, head: isHead ? first : '', stops } : null;
}

export function formatGradient(g: Gradient): string {
  const stops = g.stops.map((s) => (s.rest ? `${s.color} ${s.rest}` : s.color));
  return `${g.fn}(${[g.head, ...stops].filter(Boolean).join(', ')})`;
}
