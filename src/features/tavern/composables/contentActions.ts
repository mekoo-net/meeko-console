import { ElMessage } from 'element-plus';

import { confirmDanger, type ConfirmOptions } from '@/shared/composables/useConfirm';
import type { AppResult } from '@/shared/api/httpTypes';

import type { ActionResult, PersonaRow, WorldRow } from '../model/content.types';
import { getTavernContentPort } from '../services';

const port = getTavernContentPort();

/**
 * 处置都一个流程：先确认，做了提示一句，被拒把服务端的原因给员工看。
 * 回执给调用方去重读；取消或被拒为 null。
 */
export async function act(
  confirm: ConfirmOptions,
  run: () => Promise<AppResult<ActionResult>>,
  done: (r: ActionResult) => string = () => '已删除',
): Promise<ActionResult | null> {
  if (!(await confirmDanger(confirm))) return null;
  const r = await run();
  if (!r.success) {
    ElMessage.error(r.error.message);
    return null;
  }
  ElMessage.success(done(r.data));
  return r.data;
}

/** 列表和详情页都能删，确认文案只写在这里。 */
export const deleteWorld = (world: WorldRow) =>
  act(
    {
      title: '删除世界',
      message: `删除世界「${world.title}」？玩家那边会看不到这个世界和里面的会话。`,
      confirmText: '删除',
    },
    () => port.deleteWorld({ accountUid: world.account.uid, worldId: world.id }),
  );

export const deletePersona = (persona: PersonaRow) =>
  act(
    { title: '删除角色卡', message: `删除角色卡「${persona.name}」？玩家那边会看不到这张卡。`, confirmText: '删除' },
    () => port.deletePersona(persona.id),
  );
