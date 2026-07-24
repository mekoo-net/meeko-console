/** Strip http(s)://; persist host (and optional path) only. */
export function normalizeCdnHost(value: string | null | undefined): string {
  let s = (value ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
  return s.replace(/\/+$/, '');
}

/** For edit form: legacy rows may still have https:// in API response. */
export function formatCdnHostForInput(value: string | null | undefined): string {
  return normalizeCdnHost(value);
}
