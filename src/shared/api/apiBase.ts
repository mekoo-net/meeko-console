/**
 * 拼接 API 绝对或相对路径。
 * - `VITE_API_BASE=http://localhost:7000` → 直连 Gateway
 * - 未设置 → 相对路径，由 Vite dev proxy 转发到 Gateway
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
