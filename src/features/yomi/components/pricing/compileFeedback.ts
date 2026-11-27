import { ElMessage } from 'element-plus';

import type { PriceCompileResult } from '@yomi/common';

/** 提示条放不下一长串：键多了只列前几个，后面报总数。 */
function listKeys(keys: readonly string[], limit = 5): string {
  const shown = keys.slice(0, limit).join('、');
  return keys.length > limit ? `${shown} 等 ${keys.length} 个` : shown;
}

/**
 * 把一次编译结果压成一句话。改分组定价 / 路由定价、手动重算之后后端都会返回它，
 * 管理员最关心的是「有几条有效价真的变了」以及「有没有模型还没定价」。
 *
 * 价格表是号池管理台发布的，这边读它来算，所以多两种要明说的情况：
 * 手上没有牌价（没读到、或者那边还没发布）——那是没法算，不能说成「有效价无变化」；
 * 牌价里有几行形状不对——列出是哪几个键，好让人去那边改。
 */
export function describeCompile(r: PriceCompileResult): string {
  const parts: string[] = [];
  if (r.compiled > 0) parts.push(`已重算 ${r.compiled} 条有效价`);
  // 继承按次 / 积分分组的不看价格表，没有牌价时照样能编出几条；按牌价出价的那些这一遍没碰
  if (r.priceTableEmpty) parts.push(r.compiled > 0 ? '手上没有牌价，按牌价出价的没有重算' : '手上没有牌价，没有重算');
  else if (r.compiled === 0) parts.push('有效价无变化');
  if (r.unchanged > 0) parts.push(`${r.unchanged} 条数值相同未动`);
  if (r.unmatchedModelKeys.length > 0) parts.push(`${r.unmatchedModelKeys.length} 个模型无基准价`);
  if (r.invalidPriceKeys.length > 0) parts.push(`${r.invalidPriceKeys.length} 行牌价用不了：${listKeys(r.invalidPriceKeys)}`);
  if (r.newVersion != null) parts.push(`版本 → v${r.newVersion}`);
  return parts.join('，');
}

/** 成功提示：有没定价的模型、没有牌价、牌价有坏行时用 warning，否则 success。 */
export function notifyCompile(prefix: string, r: PriceCompileResult): void {
  const text = `${prefix}：${describeCompile(r)}`;
  if (r.unmatchedModelKeys.length > 0 || r.priceTableEmpty || r.invalidPriceKeys.length > 0) ElMessage.warning(text);
  else ElMessage.success(text);
}
