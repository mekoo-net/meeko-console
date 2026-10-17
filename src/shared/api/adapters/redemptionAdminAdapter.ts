import { z } from 'zod';

import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

import {
  exportedCodeSchema,
  exportScopeValues,
  redemptionAttemptSchema,
  redemptionBatchSchema,
  redemptionCodeSchema,
  redemptionOverviewSchema,
  type AttemptFilter,
  type BatchFilter,
  type CodeFilter,
  type CreateBatchInput,
  type ExportedCodes,
  type ExportScope,
  type PageQuery,
  type Paged,
  type PlainCodes,
  type RedemptionAttempt,
  type RedemptionBatch,
  type RedemptionCode,
  type RedemptionOverview,
  type UpdateBatchInput,
} from '@/features/platform/redemption/model/redemption.types';
import type { RedemptionPort } from '@/features/platform/redemption/services/ports/redemptionPort';

/** 平台 BFF：兑换码是 Billing 下「兑换码」充值渠道的卡密管理，不挂产品前缀。契约见 docs/api/17-billing-redemption.md。 */
const BASE = '/api/admin/billing/redemption';

interface PageDto {
  items?: unknown[];
  total?: number;
}

function parsePage<T>(schema: z.ZodType<T>, dto: PageDto | null | undefined, what: string): AppResult<Paged<T>> {
  const parsed = z.array(schema).safeParse(dto?.items ?? []);
  if (!parsed.success) return fail({ code: 'validation', message: `${what}响应格式错误` });
  return ok({ items: parsed.data, total: dto?.total ?? parsed.data.length });
}

const plainCodesSchema = z.object({ batch: redemptionBatchSchema, codes: z.array(z.string()) });

function parsePlain(data: unknown): AppResult<PlainCodes> {
  const parsed = plainCodesSchema.safeParse(data);
  return parsed.success ? ok(parsed.data) : fail({ code: 'validation', message: '卡密响应格式错误' });
}

const exportedCodesSchema = z.object({
  batch: redemptionBatchSchema,
  scope: z.enum(exportScopeValues),
  items: z.array(exportedCodeSchema),
});

function parseOne<T>(schema: z.ZodType<T>, data: unknown, what: string): AppResult<T> {
  const parsed = schema.safeParse(data);
  return parsed.success ? ok(parsed.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

const pageQuery = (q: PageQuery<unknown>) => ({ page: q.page, pageSize: q.pageSize });

export class RedemptionAdminHttpAdapter implements RedemptionPort {
  async overview(): Promise<AppResult<RedemptionOverview>> {
    // 「今日兑换」按看报表的人的本地自然日算，服务端没有业务时区。
    const res = await request<unknown>(`${BASE}/overview`, { query: { dayStartUtc: new Date().setHours(0, 0, 0, 0) } });
    return res.success ? parseOne(redemptionOverviewSchema, res.data, '概览') : res;
  }

  async listBatches(q: PageQuery<BatchFilter>): Promise<AppResult<Paged<RedemptionBatch>>> {
    const res = await request<PageDto>(`${BASE}/batches`, {
      query: {
        ...pageQuery(q),
        batchId: q.filter.batchId,
        name: q.filter.name,
        salesChannel: q.filter.salesChannel,
        status: q.filter.status === 'all' ? undefined : q.filter.status,
        purpose: q.filter.purpose === 'all' ? undefined : q.filter.purpose,
        fromUtc: q.filter.fromUtc,
        toUtc: q.filter.toUtc,
      },
    });
    return res.success ? parsePage(redemptionBatchSchema, res.data, '批次') : res;
  }

  async listBatchOptions(): Promise<AppResult<Pick<RedemptionBatch, 'id' | 'name' | 'faceValue'>[]>> {
    const res = await request<unknown>(`${BASE}/batches/options`);
    if (!res.success) return res;
    const schema = z.array(redemptionBatchSchema.pick({ id: true, name: true, faceValue: true }));
    return parseOne(schema, res.data, '批次选项');
  }

  async createBatch(input: CreateBatchInput): Promise<AppResult<PlainCodes>> {
    const res = await request<unknown>(`${BASE}/batches`, { method: 'POST', body: input });
    return res.success ? parsePlain(res.data) : res;
  }

  async updateBatch(batchId: string, input: UpdateBatchInput): Promise<AppResult<PlainCodes>> {
    const res = await request<unknown>(`${BASE}/batches/${encodeURIComponent(batchId)}`, { method: 'PATCH', body: input });
    return res.success ? parsePlain(res.data) : res;
  }

  async exportBatch(batchId: string, scope: ExportScope): Promise<AppResult<ExportedCodes>> {
    const res = await request<unknown>(`${BASE}/batches/${encodeURIComponent(batchId)}/export`, {
      method: 'POST',
      body: { scope },
    });
    return res.success ? parseOne(exportedCodesSchema, res.data, '导出') : res;
  }

  async setBatchFrozen(batchId: string, frozen: boolean, reason?: string): Promise<AppResult<RedemptionBatch>> {
    const res = await request<unknown>(`${BASE}/batches/${encodeURIComponent(batchId)}/${frozen ? 'freeze' : 'unfreeze'}`, {
      method: 'POST',
      body: frozen ? { reason } : undefined,
    });
    return res.success ? parseOne(redemptionBatchSchema, res.data, '批次') : res;
  }

  async voidBatch(batchId: string, reason: string): Promise<AppResult<RedemptionBatch>> {
    const res = await request<unknown>(`${BASE}/batches/${encodeURIComponent(batchId)}/void`, {
      method: 'POST',
      body: { reason },
    });
    return res.success ? parseOne(redemptionBatchSchema, res.data, '批次') : res;
  }

  async listCodes(q: PageQuery<CodeFilter>): Promise<AppResult<Paged<RedemptionCode>>> {
    // 用 POST：完整卡密是可直接兑换的凭证，不能出现在 URL 里被网关 / 访问日志记下。
    const res = await request<PageDto>(`${BASE}/codes/search`, {
      method: 'POST',
      body: { ...pageQuery(q), ...q.filter, status: q.filter.status === 'all' ? undefined : q.filter.status },
    });
    return res.success ? parsePage(redemptionCodeSchema, res.data, '卡密') : res;
  }

  async getCode(codeId: string): Promise<AppResult<RedemptionCode>> {
    const res = await request<unknown>(`${BASE}/codes/${encodeURIComponent(codeId)}`);
    return res.success ? parseOne(redemptionCodeSchema, res.data, '卡密') : res;
  }

  async setCodeFrozen(codeId: string, frozen: boolean, reason?: string): Promise<AppResult<RedemptionCode>> {
    const res = await request<unknown>(`${BASE}/codes/${encodeURIComponent(codeId)}/${frozen ? 'freeze' : 'unfreeze'}`, {
      method: 'POST',
      body: frozen ? { reason } : undefined,
    });
    return res.success ? parseOne(redemptionCodeSchema, res.data, '卡密') : res;
  }

  async voidCode(codeId: string, reason: string): Promise<AppResult<RedemptionCode>> {
    const res = await request<unknown>(`${BASE}/codes/${encodeURIComponent(codeId)}/void`, {
      method: 'POST',
      body: { reason },
    });
    return res.success ? parseOne(redemptionCodeSchema, res.data, '卡密') : res;
  }

  async listAttempts(q: PageQuery<AttemptFilter>): Promise<AppResult<Paged<RedemptionAttempt>>> {
    const f = q.filter;
    const res = await request<PageDto>(`${BASE}/attempts`, {
      query: {
        ...pageQuery(q),
        result: f.result === 'all' ? undefined : f.result,
        accountUid: f.accountUid?.trim(),
        accountEmail: f.accountEmail?.trim(),
        ip: f.ip?.trim(),
        codeId: f.codeId,
        batchId: f.batchId,
        productCode: f.productCode,
        fromUtc: f.fromUtc,
        toUtc: f.toUtc,
      },
    });
    return res.success ? parsePage(redemptionAttemptSchema, res.data, '兑换日志') : res;
  }
}
