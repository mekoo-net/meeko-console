/**
 * 勋章库（前后端共识常量，不入库）。
 *
 * 详情页"授予勋章"对话框从中筛选当前账户尚未获得的勋章。每个 code 仅可获得一次，
 * 取消即彻底移除（不保留授予历史）。
 *
 * 图标策略：
 *  - `image` 优先：URL 形式的勋章插画，SVG / PNG / JPG 都行（设计师产出 128×128）。
 *  - 缺省 fallback：`icon` emoji + tier/hue 程序化绘制的通用奖牌底座。
 *
 * `tier` 用于 fallback 奖牌的金属环颜色（金/银/铜）。
 * `hue` 为 0-360 HSL 色相，决定 fallback 奖牌正面渐变。
 */
import vipBadge from '../assets/badges/vip.svg';
import firstRechargeBadge from '../assets/badges/first-recharge.svg';
import loyalBadge from '../assets/badges/loyal.svg';
import spend10kBadge from '../assets/badges/spend-10k.svg';
import apiPowerBadge from '../assets/badges/api-power.svg';

export type AchievementTier = 'gold' | 'silver' | 'bronze';

export interface AchievementDef {
  /** 业务 code，与 Achievement.code 主键对齐。 */
  code: string;
  name: string;
  description: string;
  /** emoji，作为无定制插画时的核心符号。 */
  icon: string;
  /** 勋章插画 URL（SVG / PNG / JPG 都行），可选，缺省走通用绘制底座。 */
  image?: string;
  /** 勋章稀有度：决定 fallback 奖牌的金属环颜色。 */
  tier: AchievementTier;
  /** 0-360 HSL 色相，决定 fallback 奖牌正面渐变。 */
  hue: number;
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDef[] = [
  { code: 'first-recharge', name: '首充用户', description: '完成首笔充值', icon: '🎉', image: firstRechargeBadge, tier: 'bronze', hue: 28 },
  { code: 'spend-1k', name: '消费达人', description: '累计消费满 ¥1,000', icon: '💎', tier: 'silver', hue: 198 },
  { code: 'spend-10k', name: '消费王者', description: '累计消费满 ¥10,000', icon: '🏆', image: spend10kBadge, tier: 'gold', hue: 45 },
  { code: 'early-bird', name: '早期用户', description: '内测期注册', icon: '🌅', tier: 'silver', hue: 12 },
  { code: 'vip', name: 'VIP 客户', description: '运营授予的 VIP 标识', icon: '👑', image: vipBadge, tier: 'gold', hue: 280 },
  { code: 'multi-business', name: '业务大户', description: '同时开通 3 个以上业务', icon: '🏢', tier: 'silver', hue: 158 },
  { code: 'loyal', name: '忠实用户', description: '连续 3 个月活跃', icon: '🔥', image: loyalBadge, tier: 'gold', hue: 0 },
  { code: 'beta-tester', name: '内测先锋', description: '参与新功能内测', icon: '🧪', tier: 'bronze', hue: 175 },
  { code: 'invoice-king', name: '票据达人', description: '开具发票满 10 张', icon: '🧾', tier: 'silver', hue: 230 },
  { code: 'referrer', name: '推广达人', description: '成功推荐 5 位用户注册', icon: '🤝', tier: 'gold', hue: 95 },
  { code: 'night-owl', name: '夜猫子', description: '凌晨时段持续活跃', icon: '🌙', tier: 'bronze', hue: 250 },
  { code: 'api-power', name: 'API 重度用户', description: '月度 API 调用突破 100 万', icon: '⚡', image: apiPowerBadge, tier: 'gold', hue: 52 },
] as const;

export function findAchievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENT_CATALOG.find((a) => a.code === code);
}
