/**
 * Overview 仪表盘的纯 SVG 图表辅助：路径构造 + 刻度选取 + 数字格式化。
 *
 * 这些函数**无 Vue 依赖**，与组件解耦，便于单测与跨组件复用。
 */
import { formatDateTime, type DateInput } from '@/shared/lib/date';

export interface XY {
  x: number;
  y: number;
}

export interface Padding {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** 等差直线路径 */
export function buildLinePath(points: readonly XY[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/** 闭合面积路径（底部 baseline 至 y=baseY） */
export function buildAreaPath(points: readonly XY[], baseY: number): string {
  if (points.length === 0) return '';
  const head = `M ${points[0]!.x.toFixed(2)} ${baseY.toFixed(2)}`;
  const line = points
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const tail = `L ${points[points.length - 1]!.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
  return `${head} ${line} ${tail}`;
}

/**
 * 把任意正数取整到 1/2/5 × 10^n 的"好看"上界，用于 Y 轴最大刻度。
 * 例：12 → 20，48 → 50，123 → 200。
 */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let pick: number;
  if (norm <= 1) pick = 1;
  else if (norm <= 2) pick = 2;
  else if (norm <= 5) pick = 5;
  else pick = 10;
  return pick * mag;
}

/**
 * 按桶宽自适应时间轴标签格式。
 *
 * `spanMs`（首末桶跨度）用于小时桶跨多天时补上日期，避免横轴出现重复的 "HH:00"
 * 而无法区分是哪一天。
 */
export function formatBucketLabel(
  tsUtc: DateInput,
  bucketSizeSec: number,
  spanMs?: number,
): string {
  if (bucketSizeSec >= 24 * 3600) return formatDateTime(tsUtc, 'MM-DD');
  const multiDay = spanMs != null && spanMs > 36 * 3600 * 1000;
  if (bucketSizeSec >= 3 * 3600 || multiDay) return formatDateTime(tsUtc, 'MM-DD HH:00');
  return formatDateTime(tsUtc, 'HH:mm');
}

/** 紧凑数字（K / M） */
export function shortNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

/** 百分比（保留 1 位小数） */
export function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * 把 X 轴均匀取 N 个 tick；返回每个 tick 在 bucket 数组中的索引和像素 x 坐标。
 * @param n 桶总数
 * @param maxTicks 期望显示的 tick 数（受桶数限制，下限 2）
 */
export function pickXTicks(
  n: number,
  innerLeft: number,
  innerWidth: number,
  maxTicks = 6,
): Array<{ idx: number; x: number }> {
  if (n <= 0) return [];
  const count = Math.min(maxTicks, Math.max(2, n));
  const out: Array<{ idx: number; x: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i / (count - 1)) * (n - 1));
    const x =
      n <= 1 ? innerLeft + innerWidth / 2 : innerLeft + (idx / (n - 1)) * innerWidth;
    out.push({ idx, x });
  }
  return out;
}

/** 给定桶索引，返回像素 x 坐标 */
export function xAt(
  i: number,
  n: number,
  innerLeft: number,
  innerWidth: number,
): number {
  if (n <= 1) return innerLeft + innerWidth / 2;
  return innerLeft + (i / (n - 1)) * innerWidth;
}

export interface BarLayout {
  /** 每个桶占据的槽宽（含间隙） */
  slot: number;
  /** 柱体宽度（已扣除间隙，至少 0.5px） */
  width: number;
  /** 第 i 个桶柱体的左边缘 x */
  left: (i: number) => number;
  /** 第 i 个桶槽位中心 x（用于刻度对齐） */
  center: (i: number) => number;
}

/**
 * 柱状图布局：每个桶分到等宽槽位，柱体居中并按 `gapRatio` 留间隙。
 * 与折线不同，柱体彼此独立——空桶天然画成 0 高（即不画），不会出现跨桶连线。
 */
export function barLayout(
  n: number,
  innerLeft: number,
  innerWidth: number,
  gapRatio = 0.2,
): BarLayout {
  const slot = n > 0 ? innerWidth / n : innerWidth;
  const gap = slot * gapRatio;
  const width = Math.max(0.5, slot - gap);
  return {
    slot,
    width,
    left: (i: number) => innerLeft + i * slot + gap / 2,
    center: (i: number) => innerLeft + (i + 0.5) * slot,
  };
}
