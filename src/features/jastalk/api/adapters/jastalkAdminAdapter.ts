import { z } from 'zod';

import { requestJastalk, type ItemsEnvelope } from '@/features/jastalk/api/http';
import { jastalkPaths } from '@/features/jastalk/api/routes';
import {
  catalogBoardSchema,
  catalogModelSchema,
  channelBoardSchema,
  channelDetailSchema,
  channelSavedSchema,
  jastalkUserSchema,
  modelImportResultSchema,
  pointAccountSchema,
  pointBalanceSchema,
  pointRateSchema,
  rateCompileResultSchema,
  usageLogSchema,
  type CatalogBoard,
  type CatalogModel,
  type CatalogModelEdit,
  type ChannelBoard,
  type ChannelDetail,
  type ChannelEdit,
  type ChannelSaved,
  type JastalkUser,
  type ModelCategory,
  type ModelImport,
  type ModelImportResult,
  type PageQuery,
  type Paged,
  type PointAccount,
  type PointAdjust,
  type PointBalance,
  type PointRate,
  type PointRateEdit,
  type RateCompileResult,
  type UsageLogQuery,
  type UserQuery,
} from '@/features/jastalk/model/jastalk.types';
import { groupUsageActions, type UsageAction } from '@/features/jastalk/model/usageActions';
import type { JastalkAdminPort } from '@/features/jastalk/services/ports/jastalkAdminPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

/** 回包照类型校验一遍：后端改了形状，这里就说清楚是哪个接口对不上，而不是页面上某一格悄悄空着。 */
function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

function parsePage<T>(schema: z.ZodType<T>, res: ItemsEnvelope<unknown>, what: string): AppResult<Paged<T>> {
  const items = parse(z.array(schema), res.items ?? [], what);
  return items.success ? ok({ items: items.data, total: res.total ?? items.data.length }) : items;
}

const pageQuery = (page: PageQuery) => ({ p: page.p, pageSize: Math.min(page.pageSize, 100) });

export class JastalkAdminHttpAdapter implements JastalkAdminPort {
  async listUsers(query: UserQuery, page: PageQuery): Promise<AppResult<Paged<JastalkUser>>> {
    const res = await requestJastalk<ItemsEnvelope<unknown>>(jastalkPaths.users, {
      query: { accountUid: query.accountUid, blocked: query.blocked, ...pageQuery(page) },
    });
    return res.success ? parsePage(jastalkUserSchema, res.data, '用户列表') : res;
  }

  async setBlocked(accountUid: number, blocked: boolean): Promise<AppResult<true>> {
    const res = await requestJastalk<unknown>(blocked ? jastalkPaths.blockUser(accountUid) : jastalkPaths.unblockUser(accountUid), {
      method: 'POST',
    });
    return res.success ? ok(true) : res;
  }

  async pointAccount(accountUid: number, page: PageQuery): Promise<AppResult<PointAccount>> {
    const res = await requestJastalk<unknown>(jastalkPaths.pointAccount(accountUid), { query: pageQuery(page) });
    return res.success ? parse(pointAccountSchema, res.data, '积分账户') : res;
  }

  async adjustPoints(accountUid: number, input: PointAdjust): Promise<AppResult<PointBalance>> {
    const res = await requestJastalk<unknown>(jastalkPaths.adjustPoints(accountUid), { method: 'POST', body: input });
    return res.success ? parse(pointBalanceSchema, res.data, '调整积分') : res;
  }

  async channels(): Promise<AppResult<ChannelBoard>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogChannels);
    return res.success ? parse(channelBoardSchema, res.data, '渠道列表') : res;
  }

  async channel(vendorKey: string, previewCategory?: ModelCategory): Promise<AppResult<ChannelDetail>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogChannel(vendorKey), { query: { category: previewCategory } });
    return res.success ? parse(channelDetailSchema, res.data, '渠道') : res;
  }

  async saveChannel(vendorKey: string, input: ChannelEdit): Promise<AppResult<ChannelSaved>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogChannel(vendorKey), { method: 'PUT', body: input });
    return res.success ? parse(channelSavedSchema, res.data, '保存渠道') : res;
  }

  async importModels(vendorKey: string, input: ModelImport): Promise<AppResult<ModelImportResult>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogChannelModels(vendorKey), { method: 'POST', body: input });
    return res.success ? parse(modelImportResultSchema, res.data, '接入模型') : res;
  }

  async compileRates(vendorKey?: string): Promise<AppResult<RateCompileResult>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogCompile, { method: 'POST', query: { vendorKey } });
    return res.success ? parse(rateCompileResultSchema, res.data, '重算价格') : res;
  }

  async catalog(): Promise<AppResult<CatalogBoard>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogModels);
    return res.success ? parse(catalogBoardSchema, res.data, '模型目录') : res;
  }

  async saveModel(input: CatalogModelEdit): Promise<AppResult<CatalogModel>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogModels, { method: 'PUT', body: input });
    return res.success ? parse(catalogModelSchema, res.data, '保存模型') : res;
  }

  async deleteModel(id: number): Promise<AppResult<true>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogModel(id), { method: 'DELETE' });
    return res.success ? ok(true) : res;
  }

  async rates(): Promise<AppResult<PointRate[]>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogRates);
    return res.success ? parse(z.array(pointRateSchema), res.data, '价格表') : res;
  }

  async saveRate(input: PointRateEdit): Promise<AppResult<PointRate>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogRates, { method: 'PUT', body: input });
    return res.success ? parse(pointRateSchema, res.data, '保存价格') : res;
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogRate(id), { method: 'DELETE' });
    return res.success ? ok(true) : res;
  }

  /**
   * TODO(网关)：后端的用量明细还是一次结算一行、按结算分页（`/admin/usage-logs`）。这里把拿到的这一页按 actionId 归并成一件事一行：
   * 一件事的几次结算正好跨在两页之间时，它在两页各出现一次、各只有一部分调用；总条数也还是结算的条数。
   * 要后端照用户那边的使用日志（`UsageQueries.ActionsAsync`）按一件事分页，这里才准。「结果」的筛选现在也是按每一次结算筛的。
   */
  async usageActions(query: UsageLogQuery, page: PageQuery): Promise<AppResult<Paged<UsageAction>>> {
    const res = await requestJastalk<ItemsEnvelope<unknown>>(jastalkPaths.usageLogs, {
      query: {
        accountUid: query.accountUid,
        purpose: query.purpose || undefined,
        status: query.status,
        from: query.from,
        to: query.to,
        ...pageQuery(page),
      },
    });
    if (!res.success) return res;
    const parsed = parsePage(usageLogSchema, res.data, '用量明细');
    return parsed.success ? ok({ items: groupUsageActions(parsed.data.items), total: parsed.data.total }) : parsed;
  }
}
