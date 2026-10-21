import { ElMessage } from 'element-plus';

import type { PriceCompileResult } from '@yomi/common';

/**
 * 把一次编译结果压成一句话。写基准价 / 改倍率之后后端都会返回它，
 * 管理员最关心的是「有几条有效价真的变了」以及「有没有模型还没定价」。
 */
export function describeCompile(r: PriceCompileResult): string {
  const parts: string[] = [];
  parts.push(r.compiled > 0 ? `已重算 ${r.compiled} 条有效价` : '有效价无变化');
  if (r.unchanged > 0) parts.push(`${r.unchanged} 条数值相同未动`);
  if (r.unmatchedModelKeys.length > 0) parts.push(`${r.unmatchedModelKeys.length} 个模型无基准价`);
  if (r.newVersion != null) parts.push(`版本 → v${r.newVersion}`);
  return parts.join('，');
}

/** 成功提示：有未定价模型时用 warning，否则 success。 */
export function notifyCompile(prefix: string, r: PriceCompileResult): void {
  const text = `${prefix}：${describeCompile(r)}`;
  if (r.unmatchedModelKeys.length > 0) ElMessage.warning(text);
  else ElMessage.success(text);
}
