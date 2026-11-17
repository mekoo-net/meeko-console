import { z } from 'zod';

import { requestJastalk, type ItemsEnvelope } from '@/features/jastalk/api/http';
import { jastalkPaths } from '@/features/jastalk/api/routes';
import {
  catalogBoardSchema,
  catalogModelSchema,
  jastalkUserSchema,
  pointAccountSchema,
  pointBalanceSchema,
  pointRateSchema,
  usageLogSchema,
  type CatalogBoard,
  type CatalogModel,
  type CatalogModelEdit,
  type JastalkUser,
  type PageQuery,
  type Paged,
  type PointAccount,
  type PointAdjust,
  type PointBalance,
  type PointRate,
  type PointRateEdit,
  type UsageLog,
  type UsageLogQuery,
  type UserQuery,
} from '@/features/jastalk/model/jastalk.types';
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
    return res.success ? parse(z.array(pointRateSchema), res.data, '定价表') : res;
  }

  async saveRate(input: PointRateEdit): Promise<AppResult<PointRate>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogRates, { method: 'PUT', body: input });
    return res.success ? parse(pointRateSchema, res.data, '保存定价') : res;
  }

  async deleteRate(id: number): Promise<AppResult<true>> {
    const res = await requestJastalk<unknown>(jastalkPaths.catalogRate(id), { method: 'DELETE' });
    return res.success ? ok(true) : res;
  }

  async usageLogs(query: UsageLogQuery, page: PageQuery): Promise<AppResult<Paged<UsageLog>>> {
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
    return res.success ? parsePage(usageLogSchema, res.data, '用量明细') : res;
  }
}
