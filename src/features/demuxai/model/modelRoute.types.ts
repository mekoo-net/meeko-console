import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 模型别名绑定：对外别名 → 渠道 + 上游注册名。
 */
export const modelRouteSchema = z.object({
  uid: uidString,
  /** 用户请求体 model 字段 / 计费主键 */
  alias: z.string().min(1).max(128),
  vendorKey: z.string().min(1).max(64),
  vendorModel: z.string().min(1).max(160),
  isPublished: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type ModelRoute = z.infer<typeof modelRouteSchema>;

export interface CreateModelRouteInput {
  alias: string;
  vendorKey: string;
  vendorModel: string;
  isPublished?: boolean;
  notes?: string | null;
}

export interface UpdateModelRouteInput {
  alias?: string;
  vendorKey?: string;
  vendorModel?: string;
  isPublished?: boolean;
  notes?: string | null;
}

export interface ListModelRoutesFilter {
  keyword: string;
  vendorKey: string | 'all';
  isPublished: boolean | 'all';
}
