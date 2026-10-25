import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ActivityClaim,
  ActivityReward,
  ClaimListQuery,
  ClaimListResult,
  CodeImportResult,
  RewardFacts,
  RewardInput,
  VoucherTemplate,
} from '../../model/activityReward.types';

export interface YomiActivityRewardPort {
  /** 条件目录（中文文案）+ 卡密是否可用。 */
  facts(): Promise<AppResult<RewardFacts>>;
  /** 代金券奖励可选的券模板（Billing 里上架、适用于 Yomi、还有余量的）。 */
  voucherTemplates(): Promise<AppResult<VoucherTemplate[]>>;
  list(activityId: string): Promise<AppResult<ActivityReward[]>>;
  create(activityId: string, input: RewardInput): Promise<AppResult<ActivityReward>>;
  update(activityId: string, rewardId: string, input: RewardInput): Promise<AppResult<ActivityReward>>;
  remove(activityId: string, rewardId: string): Promise<AppResult<void>>;
  /** 每行一张；同一张重复导入会被去重。 */
  importCodes(activityId: string, rewardId: string, codes: string): Promise<AppResult<CodeImportResult>>;
  claims(activityId: string, query: ClaimListQuery): Promise<AppResult<ClaimListResult>>;
  ship(claimId: string, company: string, trackingNo: string): Promise<AppResult<ActivityClaim>>;
  retry(claimId: string): Promise<AppResult<ActivityClaim>>;
}
