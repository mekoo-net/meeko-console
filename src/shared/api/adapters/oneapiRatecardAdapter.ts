import type { z } from 'zod';

import {
  modelPriceRowSchema,
  priceApplyResultSchema,
  priceDeleteResultSchema,
  priceFetchResultSchema,
  priceMakerGroupsSchema,
  priceMappingWriteResultSchema,
  pricePublishResultSchema,
  priceWriteResultSchema,
  type ApplyPriceItem,
  type ModelPriceRow,
  type PriceApplyResult,
  type PriceDeleteResult,
  type PriceFetchResult,
  type PriceMakerGroup,
  type PriceMappingWriteResult,
  type PricePublishResult,
  type PriceWriteResult,
  type SaveMappingInput,
  type UpsertPriceInput,
} from '@/features/platform/components/oneapi/model/ratecard.types';
import type { OneApiRatecardPort } from '@/features/platform/components/oneapi/services/ports/oneapiRatecardPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

/**
 * 价格表（增删改查、同步、接管）是号池后台自己的接口。号池后台自己登记到 Consul、自己声明路由，
 * 平台网关验完身份直接转给它，不经 Bff：`/oneapi/vault` 后面的 `/v1/ratecard/**` 就是它原来的路径。
 * 所以成功的回包就是号池后台的 JSON（不包信封），失败也是它自己按平台的标准错误回的。
 * 读不用登录（牌价是公开的），写要 Staff 且有 `platform.settings.write`。
 */
const VAULT_RATECARD_BASE = '/oneapi/vault/v1/ratecard';

/** 回包照类型校验一遍：号池后台改了形状，这里就说清楚是哪个接口对不上，而不是页面上某一格悄悄空着。 */
function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

export class OneApiRatecardHttpAdapter implements OneApiRatecardPort {
  async listByMaker(input: { keyword: string }): Promise<AppResult<PriceMakerGroup[]>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/catalog/by-maker`, {
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
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/catalog/${path}`);
    if (!res.success) return res.error.code === 'not_found' ? ok(null) : res;
    return parse(modelPriceRowSchema, res.data, '模型价格');
  }

  async upsert(input: UpsertPriceInput): Promise<AppResult<PriceWriteResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/catalog`, {
      method: 'PUT',
      // reason 只进号池后台的日志
      body: { ...input, reason: '管理端手工录入' },
    });
    return res.success ? parse(priceWriteResultSchema, res.data, '保存牌价') : res;
  }

  async remove(id: string): Promise<AppResult<PriceDeleteResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/catalog/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.success ? parse(priceDeleteResultSchema, res.data, '删除牌价') : res;
  }

  async saveMapping(input: SaveMappingInput): Promise<AppResult<PriceMappingWriteResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/mappings`, { method: 'PUT', body: input });
    return res.success ? parse(priceMappingWriteResultSchema, res.data, '保存映射') : res;
  }

  async removeMapping(id: string): Promise<AppResult<PriceDeleteResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/mappings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.success ? parse(priceDeleteResultSchema, res.data, '删除映射') : res;
  }

  async fetchCandidates(input: { maker: string | null }): Promise<AppResult<PriceFetchResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/sync/fetch`, {
      method: 'POST',
      body: {
        // 来源只拉 models.dev（也是号池后台的默认）；明写出来是为了来源状态里有个看得懂的名字
        sources: [{ kind: 'models_dev', name: 'models.dev' }],
        ...(input.maker ? { makers: [input.maker] } : {}),
      },
    });
    return res.success ? parse(priceFetchResultSchema, res.data, '上游同步') : res;
  }

  async applyCandidates(items: ApplyPriceItem[], removeIds: string[] = []): Promise<AppResult<PriceApplyResult>> {
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/sync/apply`, {
      method: 'POST',
      // 删上游已经不列的行：只给行号，号池后台自己再查一遍是不是手动的、有没有映射
      body: { items, ...(removeIds.length > 0 ? { removeIds } : {}), reason: '管理端上游同步' },
    });
    return res.success ? parse(priceApplyResultSchema, res.data, '套用牌价') : res;
  }

  async takeover(): Promise<AppResult<PricePublishResult>> {
    // 号池后台的 publish 不带 takeover 是「现在就对一遍」，它每次写操作和定时都自己做，页面不去要；
    // 页面只在登记的主人是别的库、要人确认的时候来要这一种
    const res = await request<unknown>(`${VAULT_RATECARD_BASE}/publish`, {
      method: 'POST',
      query: { takeover: true },
    });
    return res.success ? parse(pricePublishResultSchema, res.data, '接管发布') : res;
  }
}
