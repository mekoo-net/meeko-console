import {
  FALLBACK_LOCALES,
  applyPatch,
  invalidMessageKey,
  messageKeys,
  messageLimit,
  type ActivityMessages,
  type MessagesPatch,
} from '../../model/activityMessages';
import { renameFieldMessages, type FieldRenames } from '../../model/activityReward.types';

/**
 * 活动 mock 与奖励 mock 共用的语言包，模拟后端 activity_locales：随活动保存，奖励名下的 key
 * 只认本活动已有的奖励；奖励改 key、删条件、删除时由奖励 mock 搬 / 清它名下的 key。
 */
const bundles = new Map<string, ActivityMessages>();

// 奖励在奖励 mock 里，活动保存时校验语言包、判断能否上架要知道本活动有哪些奖励。
let rewardsOf: (activityId: string) => readonly { key: string; isEnabled: boolean }[] = () => [];

function bundleOf(activityId: string): ActivityMessages {
  let m = bundles.get(activityId);
  if (!m) {
    m = Object.fromEntries(FALLBACK_LOCALES.map((l) => [l, {}]));
    bundles.set(activityId, m);
  }
  return m;
}

export const mockActivityMessages = {
  useRewards(fn: (activityId: string) => readonly { key: string; isEnabled: boolean }[]): void {
    rewardsOf = fn;
  },

  rewardKeys(activityId: string): ReadonlySet<string> {
    return new Set(rewardsOf(activityId).map((r) => r.key));
  },

  enabledRewardKeys(activityId: string): string[] {
    return rewardsOf(activityId).filter((r) => r.isEnabled).map((r) => r.key);
  },

  read(activityId: string): ActivityMessages {
    return structuredClone(bundleOf(activityId));
  },

  /** 与后端 ActivityMessagesWriter.Validate 一致：不支持的语言、不认识的 key、超长都拒绝。 */
  validate(patch: MessagesPatch | undefined, rewardKeys: ReadonlySet<string>): string | null {
    for (const [locale, changes] of Object.entries(patch ?? {})) {
      if (!FALLBACK_LOCALES.includes(locale)) return `不支持的语言「${locale}」，可用：${FALLBACK_LOCALES.join(', ')}。`;
      for (const [k, v] of Object.entries(changes)) {
        const invalid = invalidMessageKey(k, rewardKeys);
        if (invalid) return invalid;
        if (v && v.trim().length > messageLimit(k)) return `「${k}」最长 ${messageLimit(k)} 字。`;
      }
    }
    return null;
  },

  apply(activityId: string, patch: MessagesPatch | undefined): void {
    if (patch) bundles.set(activityId, applyPatch(bundleOf(activityId), patch));
  },

  renameReward(activityId: string, from: string, to: string): void {
    if (from === to) return;
    const fromPrefix = messageKeys.rewardPrefix(from);
    const toPrefix = messageKeys.rewardPrefix(to);
    for (const texts of Object.values(bundleOf(activityId))) {
      for (const [k, v] of Object.entries(texts)) {
        if (!k.startsWith(fromPrefix)) continue;
        delete texts[k];
        texts[toPrefix + k.slice(fromPrefix.length)] = v;
      }
    }
  },

  /** 登记项、选项改了 id 时文字跟着搬，与后端一致。 */
  renameFields(activityId: string, reward: string, renames: FieldRenames | null | undefined): void {
    const all = bundleOf(activityId);
    for (const [locale, texts] of Object.entries(all)) all[locale] = renameFieldMessages(texts, reward, renames);
  },

  /** 删奖励时清掉它名下全部文案；给了 keep 时只清掉它说用不上的（参数是去掉 reward.{key}. 后的部分）。 */
  pruneReward(activityId: string, reward: string, keep?: (field: string) => boolean): void {
    const prefix = messageKeys.rewardPrefix(reward);
    for (const texts of Object.values(bundleOf(activityId))) {
      for (const k of Object.keys(texts)) {
        if (k.startsWith(prefix) && !keep?.(k.slice(prefix.length))) delete texts[k];
      }
    }
  },

  text(activityId: string, locale: string, key: string): string | null {
    return bundleOf(activityId)[locale]?.[key] ?? null;
  },

  titles(activityId: string): Record<string, string> {
    return Object.fromEntries(Object.entries(bundleOf(activityId)).flatMap(([l, m]) => (m[messageKeys.title] ? [[l, m[messageKeys.title]!]] : [])));
  },

  remove(activityId: string): void {
    bundles.delete(activityId);
  },
};
