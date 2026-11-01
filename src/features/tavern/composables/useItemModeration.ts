import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import type { AppResult } from '@/shared/api/httpTypes';

import { MarketItemKindLabel, type MarketItemRow, type MarketItemState } from '../model/market.types';
import { getTavernMarketPort } from '../services';

const REASON_MAX = 200;

/**
 * 员工处置一件商品，按状态走：在售 → 下架（写原因，创作者可见）；已下架 → 上架，或删除（不用原因）；已删除 → 恢复（回到已下架）。
 * 卖家自己也能上架、下架，删除只有管理员能做。`actions` 就是这张「状态 → 动作」表，商品列表行上的「⋯」和商品抽屉的底栏
 * 都照它渲染，确认框和提示只写一处；做完回改好的那一行给 `changed`。
 */
export function useItemModeration(changed: (row: MarketItemRow) => void) {
  const port = getTavernMarketPort();
  /** 正在处置的那一件，按钮据此转圈。 */
  const acting = ref<string | null>(null);

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
    const reason = await ElMessageBox.prompt(
      `下架「${item.listing.face.name}」后不可购买，已购买的用户不受影响。`,
      `下架${MarketItemKindLabel[item.listing.kind]}`,
      {
        confirmButtonText: '下架',
        cancelButtonText: '取消',
        inputPlaceholder: '下架原因（创作者可见）',
        inputValidator: (v) => (v?.trim() ? (v.trim().length <= REASON_MAX ? true : `不超过 ${REASON_MAX} 字`) : '请填写原因'),
        type: 'warning',
      },
    ).then(({ value }) => value.trim(), () => null);
    if (reason != null) await act(item, () => port.takeDown(item.itemId, reason), '已下架');
  }

  async function relist(item: MarketItemRow): Promise<void> {
    const ok = await confirmDanger({
      title: '上架',
      message: `将「${item.listing.face.name}」重新上架？`,
      confirmText: '上架',
      type: 'info',
    });
    if (ok) await act(item, () => port.relist(item.itemId), '已上架');
  }

  async function remove(item: MarketItemRow): Promise<void> {
    const ok = await confirmDanger({
      title: `删除${MarketItemKindLabel[item.listing.kind]}`,
      message: `删除「${item.listing.face.name}」？已购买的用户不受影响，删除后可恢复。`,
      confirmText: '删除',
    });
    if (ok) await act(item, () => port.deleteItem(item.itemId), '已删除');
  }

  async function undelete(item: MarketItemRow): Promise<void> {
    const ok = await confirmDanger({
      title: '恢复',
      message: `恢复「${item.listing.face.name}」？恢复后为已下架。`,
      confirmText: '恢复',
      type: 'info',
    });
    if (ok) await act(item, () => port.undelete(item.itemId), '已恢复');
  }

  const actions: Readonly<Record<MarketItemState, readonly ItemAction[]>> = {
    listed: [{ key: 'takeDown', label: '下架', danger: true, run: takeDown }],
    unlisted: [
      { key: 'relist', label: '上架', danger: false, run: relist },
      { key: 'remove', label: '删除', danger: true, run: remove },
    ],
    deleted: [{ key: 'undelete', label: '恢复', danger: false, run: undelete }],
  };

  return { acting, actions };
}

/** 一个处置动作；`danger` 的在菜单里排在分隔线后、标红，在底栏是描边红按钮。 */
export interface ItemAction {
  key: string;
  label: string;
  danger: boolean;
  run: (item: MarketItemRow) => Promise<void>;
}
