function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function readEnvBase(key: string): string {
  const raw = import.meta.env[key] as string | undefined;
  return raw !== undefined && raw !== '' ? raw.replace(/\/$/, '') : '';
}

/** Meeko 平台 Gateway（BFF / Keystone / Meeko.Yomi 控制面 `/yomi/api/*`）。 */
export function apiUrl(path: string): string {
  const base = readEnvBase('VITE_API_BASE');
  const normalized = normalizePath(path);
  return base ? `${base}${normalized}` : normalized;
}

/**
 * Yomi.Gateway 业务 API（`/api/*`，如速率限制、sk- 令牌等）。
 * - 生产默认 `https://api.meeyo.org`
 * - 本地默认 `http://localhost:80`
 */
export function yomiApiUrl(path: string): string {
  const base =
    readEnvBase('VITE_YOMI_API_BASE') ||
    (import.meta.env.DEV ? 'http://localhost:80' : 'https://api.meeyo.org');
  return `${base}${normalizePath(path)}`;
}
