import { z } from 'zod';

import { modelRouteStatusSchema, type ModelRouteStatus } from './enums';
import { epochMillisSchema } from '@/shared/lib/epoch';

const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));

/**
 * 模型路由：对外别名 → 渠道 + 上游注册名。
 * 同一 alias 可有多条 route（weight 加权分流）；下发网关由 DemuxAi 快照承担（后端待接）。
 */
export const modelRouteSchema = z.object({
  uid: uidString,
  /** 用户请求体 model 字段 / 计费主键 */
  alias: z.string().min(1).max(128),
  channelKey: z.string().min(1).max(64),
  upstreamModelId: z.string().min(1).max(160),
  weight: z.number().int().positive(),
  priority: z.number().int().min(0).max(999),
  status: modelRouteStatusSchema,
  notes: z.string().nullable().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type ModelRoute = z.infer<typeof modelRouteSchema>;

export interface CreateModelRouteInput {
  alias: string;
  channelKey: string;
  upstreamModelId: string;
  weight?: number;
  priority?: number;
  status?: ModelRouteStatus;
  notes?: string | null;
}

export interface UpdateModelRouteInput {
  alias?: string;
  channelKey?: string;
  upstreamModelId?: string;
  weight?: number;
  priority?: number;
  status?: ModelRouteStatus;
  notes?: string | null;
}

export interface ListModelRoutesFilter {
  keyword: string;
  channelKey: string | 'all';
  status: ModelRouteStatus | 'all';
}
