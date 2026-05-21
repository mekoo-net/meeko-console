/**
 * IPv4 ↔ uint32（网络字节序 / 大端），与 PostgreSQL `inet`、ClickHouse IPv4 数值列惯例一致。
 *
 * - 存库：4 字节或 `bigint`，范围查询 `BETWEEN` / CIDR 转区间
 * - API：JSON number（≤ 2^32-1，在 JS safe integer 内）
 * - 展示：`formatIpv4(n)` 再渲染为点分十进制
 */

/** 将点分十进制 IPv4 编码为 uint32；非法输入返回 null。 */
export function parseIpv4(text: string): number | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const octet = Number(p);
    if (octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

/** uint32 → `a.b.c.d` */
export function formatIpv4(value: number): string {
  const n = value >>> 0;
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}
