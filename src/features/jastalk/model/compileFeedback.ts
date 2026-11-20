import { h } from 'vue';
import { ElMessage } from 'element-plus';

import { describeCompile, unmatchedLines } from './channelPricing';
import type { RateCompileResult } from './jastalk.types';

/**
 * 改倍率、接入模型、手动重算之后的提示：后端每次都回一份重算结果。
 * 有对不上牌价的模型时把名字和原因列出来（它们要去单独定价），提示条留久一点、能手动关；
 * 模型名是后端回的原文，用节点拼而不是拼 HTML。
 */
export function notifyCompile(prefix: string, r: RateCompileResult): void {
  const text = `${prefix}：${describeCompile(r)}`;
  if (r.unmatched.length === 0) {
    if (r.listPricesEmpty) ElMessage.warning(text);
    else ElMessage.success(text);
    return;
  }
  ElMessage({
    type: 'warning',
    duration: 8000,
    showClose: true,
    message: h('div', { style: 'line-height: 1.6' }, [
      h('div', text),
      ...unmatchedLines(r).map((line) => h('div', { style: 'font-size: 12px; word-break: break-all' }, line)),
    ]),
  });
}
