import type { z } from 'zod';

import {
  modelPriceRowSchema,
  priceApplyResultSchema,
  priceDeleteResultSchema,
  priceFetchResultSchema,
  priceImportResultSchema,
  priceMakerGroupsSchema,
  pricePublishResultSchema,
  priceWriteResultSchema,
  ratecardRelayStatusSchema,
  type ApplyPriceItem,
  type ImportPricesInput,
  type ModelPriceRow,
  type PriceApplyResult,
  type PriceDeleteResult,
  type PriceFetchResult,
  type PriceImportResult,
  type PriceMakerGroup,
  type PricePublishResult,
  type PriceWriteResult,
  type RatecardRelayStatus,
  type UpsertPriceInput,
} from '@/features/platform/components/oneapi/model/ratecard.types';
import type { OneApiRatecardPort } from '@/features/platform/components/oneapi/services/ports/oneapiRatecardPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

/**
 * Bff 把这个前缀下面的 `{rest}` 原样转到号池后台的 `/v1/ratecard/{rest}`：成功的回包就是号池后台的 JSON（不包信封），
 * 失败由 Bff 转成平台的标准错误。`relay` 例外，是 Bff 自己答的。
 */
const BASE = '/admin/components/oneapi/ratecard';

/** 回包照类型校验一遍：号池后台改了形状，这里就说清楚是哪个接口对不上，而不是页面上某一格悄悄空着。 */
function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

export class OneApiRatecardHttpAdapter implements OneApiRatecardPort {
  async listByMaker(input: { keyword: string }): Promise<AppResult<PriceMakerGroup[]>> {
    const res = await request<unknown>(`${BASE}/catalog/by-maker`, {
      query: { keyword: input.keyword.trim() || undefined },
    });
    if (!res.success) return res;
    const parsed = parse(priceMakerGroupsSchema, res.data, '模型价格');
    return parsed.success ? ok(parsed.data.items) : parsed;
  }

  async find(modelKey: string): Promise<AppResult<ModelPriceRow | null>> {
    const key = modelKey.trim();
    // 空的拼出来是 catalog/，那是另一个接口（分页列表）
    if (!key) return ok(null);
    // 模型名可以带斜杠（渠道前缀）。斜杠原样留在路径里、逐段转义：整个转成 %2F 的话后端的通配路由不还原，就查不到了。
    const path = key.split('/').map(encodeURIComponent).join('/');
    const res = await request<unknown>(`${BASE}/catalog/${path}`);
    if (!res.success) return res.error.code === 'not_found' ? ok(null) : res;
    return parse(modelPriceRowSchema, res.data, '模型价格');
  }

  async upsert(input: UpsertPriceInput): Promise<AppResult<PriceWriteResult>> {
    const res = await request<unknown>(`${BASE}/catalog`, {
      method: 'PUT',
      // reason 只进号池后台的日志
      body: { ...input, reason: '管理端手工录入' },
    });
    return res.success ? parse(priceWriteResultSchema, res.data, '保存牌价') : res;
  }

  async remove(id: string): Promise<AppResult<PriceDeleteResult>> {
    const res = await request<unknown>(`${BASE}/catalog/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.success ? parse(priceDeleteResultSchema, res.data, '删除牌价') : res;
  }

  async fetchCandidates(input: { maker: string | null }): Promise<AppResult<PriceFetchResult>> {
    const res = await request<unknown>(`${BASE}/sync/fetch`, {
      method: 'POST',
      body: {
        // 来源只拉 models.dev（也是号池后台的默认）；明写出来是为了来源状态里有个看得懂的名字
        sources: [{ kind: 'models_dev', name: 'models.dev' }],
        ...(input.maker ? { makers: [input.maker] } : {}),
      },
    });
    return res.success ? parse(priceFetchResultSchema, res.data, '上游同步') : res;
  }

  async applyCandidates(items: ApplyPriceItem[]): Promise<AppResult<PriceApplyResult>> {
    const res = await request<unknown>(`${BASE}/sync/apply`, {
      method: 'POST',
      body: { items, reason: '管理端上游同步' },
    });
    return res.success ? parse(priceApplyResultSchema, res.data, '套用牌价') : res;
  }

  async importPrices(input: ImportPricesInput): Promise<AppResult<PriceImportResult>> {
    const res = await request<unknown>(`${BASE}/import`, {
      method: 'POST',
      body: { overwrite: input.overwrite, items: input.items },
    });
    return res.success ? parse(priceImportResultSchema, res.data, '导入牌价') : res;
  }

  async publish(input?: { takeover?: boolean }): Promise<AppResult<PricePublishResult>> {
    const res = await request<unknown>(`${BASE}/publish`, {
      method: 'POST',
      query: { takeover: input?.takeover ? true : undefined },
    });
    return res.success ? parse(pricePublishResultSchema, res.data, '发布') : res;
  }

  async relayStatus(): Promise<AppResult<RatecardRelayStatus>> {
    const res = await request<unknown>(`${BASE}/relay`);
    return res.success ? parse(ratecardRelayStatusSchema, res.data, '转发状态') : res;
  }
}
