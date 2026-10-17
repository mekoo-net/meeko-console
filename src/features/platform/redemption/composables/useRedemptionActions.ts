import { h, ref, type VNode } from 'vue';
import { ElMessage, ElMessageBox, ElRadio, ElRadioGroup } from 'element-plus';

import type { ExportedCodes, ExportScope, RedemptionBatch, RedemptionCode } from '../model/redemption.types';
import { batchExportCount, batchUnusedCount, canExportScope, exportScopeValues, ExportScopeLabel } from '../model/redemption.types';
import { getRedemptionPort } from '../services';

/**
 * 批次 / 卡密的变更动作，都只确认一次。
 * 返回更新后的实体；用户取消或失败时返回 null。
 */
export function useRedemptionActions() {
  const port = getRedemptionPort();

  async function confirm(title: string, message: string | (() => VNode), danger = false): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, title, {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        confirmButtonClass: danger ? 'el-button--danger' : undefined,
        type: danger ? 'warning' : undefined,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function exportBatch(b: RedemptionBatch): Promise<ExportedCodes | null> {
    const allowed = exportScopeValues.filter((s) => canExportScope(b, s));
    if (allowed.length === 0) {
      ElMessage.warning('该批次没有可导出的卡密');
      return null;
    }
    // 默认选未兑换：补货上架是最常见的导出目的。
    const scope = ref<ExportScope>(allowed[0]!);
    const message = () =>
      h('div', [
        h('div', { style: 'margin-bottom: 8px' }, `导出「${b.name}」`),
        h(
          ElRadioGroup,
          { modelValue: scope.value, 'onUpdate:modelValue': (v: string | number | boolean | undefined) => (scope.value = v as ExportScope) },
          () =>
            exportScopeValues.map((s) =>
              h(ElRadio, { value: s, disabled: !allowed.includes(s) }, () => `${ExportScopeLabel[s]} ${batchExportCount(b, s)} 张`),
            ),
        ),
      ]);
    if (!(await confirm('导出', message))) return null;
    const r = await port.exportBatch(b.id, scope.value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    return r.data;
  }

  async function toggleBatchFrozen(b: RedemptionBatch): Promise<RedemptionBatch | null> {
    const freezing = b.status !== 'frozen';
    const verb = freezing ? '冻结' : '解冻';
    if (!(await confirm(verb, `确定${verb}「${b.name}」？`, freezing))) return null;
    const r = await port.setBatchFrozen(b.id, freezing);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(`已${verb}`);
    return r.data;
  }

  async function voidBatch(b: RedemptionBatch): Promise<RedemptionBatch | null> {
    const n = batchUnusedCount(b) + b.frozenCount;
    if (!(await confirm('作废', `确定作废「${b.name}」剩余的 ${n} 张卡密？作废后不可恢复。`, true))) return null;
    const r = await port.voidBatch(b.id);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(`已作废 ${n} 张卡密`);
    return r.data;
  }

  async function toggleCodeFrozen(c: RedemptionCode): Promise<RedemptionCode | null> {
    const freezing = c.status !== 'frozen';
    const verb = freezing ? '冻结' : '解冻';
    if (!(await confirm(verb, `确定${verb} ${c.codeMasked}？`, freezing))) return null;
    const r = await port.setCodeFrozen(c.id, freezing);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(`已${verb}`);
    return r.data;
  }

  async function voidCode(c: RedemptionCode): Promise<RedemptionCode | null> {
    if (!(await confirm('作废', `确定作废 ${c.codeMasked}？作废后不可恢复。`, true))) return null;
    const r = await port.voidCode(c.id);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success('已作废');
    return r.data;
  }

  return { exportBatch, toggleBatchFrozen, voidBatch, toggleCodeFrozen, voidCode };
}
