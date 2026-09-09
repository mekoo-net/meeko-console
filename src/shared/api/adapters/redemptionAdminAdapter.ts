import { z } from 'zod';

import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

import {
  redemptionSchema,
  type CreateRedemptionsInput,
  type ListRedemptionsFilter,
  type RedemptionStatus,
} from '@/features/platform/redemption/model/redemption.types';
import type {
  ListRedemptionsPage,
  RedemptionPort,
} from '@/features/platform/redemption/services/ports/redemptionPort';

/** 平台 BFF：兑换码属于 Billing，不挂产品前缀。 */
const BASE = '/api/admin/billing/redemption';

/** 后端 query 绑定的是枚举名（Unused / Used / Disabled / Expired）。 */
const statusQuery: Record<RedemptionStatus, string> = {
  unused: 'Unused',
  used: 'Used',
  disabled: 'Disabled',
  expired: 'Expired',
};

interface PageDto {
  items?: unknown[];
  total?: number;
}

export class RedemptionAdminHttpAdapter implements RedemptionPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionsFilter;
  }): Promise<AppResult<ListRedemptionsPage>> {
    const status = input.filter.status && input.filter.status !== 'all' ? statusQuery[input.filter.status] : undefined;
    const res = await request<PageDto>(BASE, {
      query: {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.filter.keyword?.trim() || undefined,
        status,
      },
    });
    if (!res.success) return res;

    const parsed = z.array(redemptionSchema).safeParse(res.data?.items ?? []);
    if (!parsed.success) return fail({ code: 'validation', message: '兑换码响应格式错误' });
    return ok({ items: parsed.data, total: res.data?.total ?? parsed.data.length });
  }

  async create(input: CreateRedemptionsInput): Promise<AppResult<{ keys: string[] }>> {
    const res = await request<{ keys?: string[] }>(BASE, {
      method: 'POST',
      body: {
        name: input.name.trim(),
        quota: input.quota,
        count: input.count,
        maxRedemptions: input.maxRedemptions,
        expiresAtUtc: input.expiresAtUtc ? new Date(input.expiresAtUtc).toISOString() : null,
      },
    });
    if (!res.success) return res;
    return ok({ keys: res.data?.keys ?? [] });
  }

  async disable(id: string): Promise<AppResult<void>> {
    const res = await request<unknown>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.success ? ok(undefined) : res;
  }
}
