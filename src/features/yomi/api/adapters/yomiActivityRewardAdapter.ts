import { z } from 'zod';

import {
  activityClaimSchema,
  activityRewardSchema,
  claimListSchema,
  codeImportResultSchema,
  rewardFactsSchema,
  voucherTemplateSchema,
  type ActivityClaim,
  type ActivityReward,
  type ClaimListQuery,
  type ClaimListResult,
  type CodeImportResult,
  type RewardFacts,
  type RewardInput,
  type VoucherTemplate,
} from '@/features/yomi/model/activityReward.types';
import type { YomiActivityRewardPort } from '@/features/yomi/services/ports/yomiActivityRewardPort';
import { requestYomi } from '@/features/yomi/api/http';
import { yomiPlatformPaths } from '@/features/yomi/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = yomiPlatformPaths.adminActivities;

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}格式错误` });
}

const rewardsPath = (activityId: string) => `${BASE}/${encodeURIComponent(activityId)}/rewards`;

export class YomiActivityRewardHttpAdapter implements YomiActivityRewardPort {
  async facts(): Promise<AppResult<RewardFacts>> {
    // 管理台是中文界面，不跟浏览器语言走。
    const res = await requestYomi<unknown>(`${BASE}/reward-facts`, { query: { locale: 'zh' } });
    return res.success ? parse(rewardFactsSchema, res.data, '条件目录') : res;
  }

  async voucherTemplates(): Promise<AppResult<VoucherTemplate[]>> {
    const res = await requestYomi<unknown>(`${BASE}/voucher-templates`);
    return res.success ? parse(z.array(voucherTemplateSchema), res.data, '券模板列表') : res;
  }

  async list(activityId: string): Promise<AppResult<ActivityReward[]>> {
    const res = await requestYomi<unknown>(rewardsPath(activityId));
    return res.success ? parse(z.array(activityRewardSchema), res.data, '奖励列表') : res;
  }

  async create(activityId: string, input: RewardInput): Promise<AppResult<ActivityReward>> {
    const res = await requestYomi<unknown>(rewardsPath(activityId), { method: 'POST', body: input });
    return res.success ? parse(activityRewardSchema, res.data, '奖励') : res;
  }

  async update(activityId: string, rewardId: string, input: RewardInput): Promise<AppResult<ActivityReward>> {
    const res = await requestYomi<unknown>(`${rewardsPath(activityId)}/${encodeURIComponent(rewardId)}`, { method: 'PUT', body: input });
    return res.success ? parse(activityRewardSchema, res.data, '奖励') : res;
  }

  async remove(activityId: string, rewardId: string): Promise<AppResult<void>> {
    const res = await requestYomi<unknown>(`${rewardsPath(activityId)}/${encodeURIComponent(rewardId)}`, { method: 'DELETE' });
    return res.success ? ok(undefined) : res;
  }

  async importCodes(activityId: string, rewardId: string, codes: string): Promise<AppResult<CodeImportResult>> {
    const res = await requestYomi<unknown>(`${rewardsPath(activityId)}/${encodeURIComponent(rewardId)}/codes`, {
      method: 'POST',
      body: { codes },
    });
    return res.success ? parse(codeImportResultSchema, res.data, '导入结果') : res;
  }

  async claims(activityId: string, query: ClaimListQuery): Promise<AppResult<ClaimListResult>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(activityId)}/claims`, {
      query: {
        page: query.page,
        pageSize: query.pageSize,
        rewardId: query.rewardId ?? undefined,
        status: query.status ?? undefined,
        accountUid: query.accountUid ?? undefined,
        fromUtc: query.fromUtc ?? undefined,
        toUtc: query.toUtc ?? undefined,
      },
    });
    return res.success ? parse(claimListSchema, res.data, '领取记录') : res;
  }

  async ship(claimId: string, company: string, trackingNo: string): Promise<AppResult<ActivityClaim>> {
    const res = await requestYomi<unknown>(`${BASE}/claims/${encodeURIComponent(claimId)}/ship`, {
      method: 'POST',
      body: { company, trackingNo },
    });
    return res.success ? parse(activityClaimSchema, res.data, '领取记录') : res;
  }

  async retry(claimId: string): Promise<AppResult<ActivityClaim>> {
    const res = await requestYomi<unknown>(`${BASE}/claims/${encodeURIComponent(claimId)}/retry`, { method: 'POST' });
    return res.success ? parse(activityClaimSchema, res.data, '领取记录') : res;
  }
}
