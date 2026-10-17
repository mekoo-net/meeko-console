import { h, ref, type VNode } from 'vue';
import { ElMessage, ElMessageBox, ElRadio, ElRadioGroup } from 'element-plus';

import type { ExportedCodes, ExportScope, RedemptionBatch, RedemptionCode } from '../model/redemption.types';
import { batchExportCount, batchUnusedCount, canExportScope, exportScopeValues, ExportScopeLabel } from '../model/redemption.types';
import { getRedemptionPort } from '../services';

/**
 * 批次 / 卡密的变更动作。冻结、作废要原因：它写在受影响的每张卡上，
 * 客服查到一张冻结 / 作废的卡时只看得到这一句话。导出、解冻只需确认。
 * 返回更新后的实体；用户取消或失败时返回 null。
 */
export function useRedemptionActions() {
  const port = getRedemptionPort();

  async function askReason(
    title: string,
    message: string | (() => VNode),
    confirmText: string,
    placeholder: string,
    danger = false,
  ): Promise<string | null> {
    try {
      const { value } = await ElMessageBox.prompt(message, title, {
        confirmButtonText: confirmText,
        cancelButtonText: '取消',
        inputPlaceholder: placeholder,
        inputValidator: (v: string) => (v?.trim() ? true : '请填写原因'),
        confirmButtonClass: danger ? 'el-button--danger' : undefined,
        type: danger ? 'warning' : undefined,
      });
      return value.trim();
    } catch {
      return null;
    }
  }

  async function confirm(title: string, message: string | (() => VNode), confirmText: string): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, title, { confirmButtonText: confirmText, cancelButtonText: '取消' });
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
    if (!(await confirm('导出卡密', message, '导出'))) return null;
    const r = await port.exportBatch(b.id, scope.value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    return r.data;
  }

  async function toggleBatchFrozen(b: RedemptionBatch): Promise<RedemptionBatch | null> {
    const freezing = b.status !== 'frozen';
    let reason: string | undefined;
    if (freezing) {
      const value = await askReason('冻结批次', `冻结「${b.name}」`, '冻结', '原因', true);
      if (!value) return null;
      reason = value;
    } else if (!(await confirm('解除冻结', `解冻「${b.name}」`, '解冻'))) {
      return null;
    }
    const r = await port.setBatchFrozen(b.id, freezing, reason);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(freezing ? '批次已冻结' : '批次已解冻');
    return r.data;
  }

  async function voidBatch(b: RedemptionBatch): Promise<RedemptionBatch | null> {
    const n = batchUnusedCount(b) + b.frozenCount;
    const reason = await askReason(
      '作废批次',
      `作废「${b.name}」${n} 张未兑换卡密，不可恢复`,
      `作废 ${n} 张`,
      '原因',
      true,
    );
    if (!reason) return null;
    const r = await port.voidBatch(b.id, reason);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(`已作废 ${n} 张卡密`);
    return r.data;
  }

  async function toggleCodeFrozen(c: RedemptionCode): Promise<RedemptionCode | null> {
    const freezing = c.status !== 'frozen';
    let reason: string | undefined;
    if (freezing) {
      const value = await askReason('冻结卡密', `冻结 ${c.codeMasked}`, '冻结', '原因', true);
      if (!value) return null;
      reason = value;
    } else if (!(await confirm('解除冻结', `解冻 ${c.codeMasked}`, '解冻'))) {
      return null;
    }
    const r = await port.setCodeFrozen(c.id, freezing, reason);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success(freezing ? '卡密已冻结' : '卡密已解冻');
    return r.data;
  }

  async function voidCode(c: RedemptionCode): Promise<RedemptionCode | null> {
    const reason = await askReason('作废卡密', `作废 ${c.codeMasked}，不可恢复`, '作废', '原因', true);
    if (!reason) return null;
    const r = await port.voidCode(c.id, reason);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return null;
    }
    ElMessage.success('卡密已作废');
    return r.data;
  }

  return { exportBatch, toggleBatchFrozen, voidBatch, toggleCodeFrozen, voidCode };
}
