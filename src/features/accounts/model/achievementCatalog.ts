/**
 * 勋章库（前后端共识常量，不入库）。
 *
 * 详情页"授予勋章"对话框从中筛选当前账户尚未获得的勋章。每个 code 仅可获得一次，
 * 取消即彻底移除（不保留授予历史）。
 */
export interface AchievementDef {
  /** 业务 code，与 Achievement.code 主键对齐。 */
  code: string;
  name: string;
  description: string;
  /** emoji 或图标标识。优先 emoji，方便跨端展示。 */
  icon: string;
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDef[] = [
  { code: 'first-recharge', name: '首充用户', description: '完成首笔充值', icon: '🎉' },
  { code: 'spend-1k', name: '消费达人', description: '累计消费满 ¥1,000', icon: '💎' },
  { code: 'early-bird', name: '早期用户', description: '内测期注册', icon: '🌅' },
  { code: 'vip', name: 'VIP 客户', description: '运营授予的 VIP 标识', icon: '👑' },
  { code: 'multi-business', name: '业务大户', description: '同时开通 3 个以上业务', icon: '🏢' },
  { code: 'loyal', name: '忠实用户', description: '连续 3 个月活跃', icon: '🔥' },
  { code: 'beta-tester', name: '内测先锋', description: '参与新功能内测', icon: '🧪' },
  { code: 'invoice-king', name: '票据达人', description: '开具发票满 10 张', icon: '🧾' },
] as const;

export function findAchievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENT_CATALOG.find((a) => a.code === code);
}
