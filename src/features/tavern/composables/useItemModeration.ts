import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import type { AppResult } from '@/shared/api/httpTypes';

import { MarketItemKindLabel, type MarketItemRow } from '../model/market.types';
import { getTavernMarketPort } from '../services';

const REASON_MAX = 200;

/**
 * 员工处置一件商品：下架、恢复上架、删除。商品列表行上的「⋯」和商品抽屉的底栏共用这一份，确认框和提示只写一处。
 * 下架、删除都要写原因（创作者可见）；删除不能恢复。做完回改好的那一行给 `changed`。
 */
export function useItemModeration(changed: (row: MarketItemRow) => void) {
  const port = getTavernMarketPort();
  /** 正在处置的那一件，按钮据此转圈。 */
  const acting = ref<string | null>(null);

  function askReason(title: string, message: string, placeholder: string): Promise<string | null> {
    return ElMessageBox.prompt(message, title, {
      confirmButtonText: title,
      cancelButtonText: '取消',
      inputPlaceholder: placeholder,
      inputValidator: (v) => (v?.trim() ? (v.trim().length <= REASON_MAX ? true : `不超过 ${REASON_MAX} 字`) : '请填写原因'),
      type: 'warning',
    }).then(({ value }) => value.trim(), () => null);
  }

  async function act(item: MarketItemRow, run: () => Promise<AppResult<MarketItemRow>>, done: string): Promise<void> {
    acting.value = item.itemId;
    try {
      const r = await run();
      if (!r.success) {
        ElMessage.error(r.error.message);
        return;
      }
      ElMessage.success(done);
      changed(r.data);
    } finally {
      acting.value = null;
    }
  }

  async function takeDown(item: MarketItemRow): Promise<void> {
    const name = item.listing.face.name;
    const reason = await askReason(
      `下架${MarketItemKindLabel[item.listing.kind]}`,
      `下架「${name}」后不可购买，已购买的用户不受影响。`,
      '下架原因（创作者可见）',
    );
    if (reason != null) await act(item, () => port.takeDown(item.itemId, reason), '已下架');
  }

  async function restore(item: MarketItemRow): Promise<void> {
    const ok = await confirmDanger({
      title: '恢复上架',
      message: `恢复「${item.listing.face.name}」在市场中出售？`,
      confirmText: '恢复',
      type: 'info',
    });
    if (ok) await act(item, () => port.restore(item.itemId), '已恢复上架');
  }

  async function remove(item: MarketItemRow): Promise<void> {
    const name = item.listing.face.name;
    const reason = await askReason(
      `删除${MarketItemKindLabel[item.listing.kind]}`,
      `删除「${name}」后不可恢复，已购买的用户不受影响。`,
      '删除原因（创作者可见）',
    );
    if (reason != null) await act(item, () => port.deleteItem(item.itemId, reason), '已删除');
  }

  return { acting, takeDown, restore, remove };
}
