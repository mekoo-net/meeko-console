import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 模型别名绑定：对外别名 → 渠道 + 上游注册名。
 */
export const vendorRouteSchema = z.object({
  uid: uidString,
  /** 用户请求体 model 字段 / 计费主键 */
  routeKey: z.string().min(1).max(128),
  vendorKey: z.string().min(1).max(64),
  vendorModel: z.string().min(1).max(160),
  isPublished: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type VendorRoute = z.infer<typeof vendorRouteSchema>;

export interface CreateVendorRouteInput {
  routeKey: string;
  vendorKey: string;
  vendorModel: string;
  isPublished?: boolean;
  notes?: string | null;
}

export interface UpdateVendorRouteInput {
  routeKey?: string;
  vendorKey?: string;
  vendorModel?: string;
  isPublished?: boolean;
  notes?: string | null;
}

export interface ListVendorRoutesFilter {
  keyword: string;
  vendorKey: string | 'all';
  isPublished: boolean | 'all';
  /** 精确匹配上游模型 ID（服务端过滤）；缺省不筛。 */
  vendorModel?: string;
}

/** 按渠道 + 上游模型聚合的别名计数（不含明细行）。 */
export interface VendorRouteStats {
  vendorKey: string;
  total: number;
  byVendorModel: Record<string, number>;
}
