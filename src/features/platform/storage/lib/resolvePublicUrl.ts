/** 后端 publicUrl 不含 scheme；管理台预览/外链统一补 https。 */
export function resolvePublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}
