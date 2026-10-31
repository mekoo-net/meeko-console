import type { z } from 'zod';

import { apiUrl } from '@/shared/api/apiBase';
import { requestApiEnvelope, type ItemsEnvelope, type RequestOptions } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

export type { ItemsEnvelope, RequestOptions };

export function requestTavern<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(apiUrl, path, options);
}

/**
 * 按 schema 把响应体解析一次。形状不符算校验失败，不把半截数据交给页面——
 * 后端契约变了要在这里第一时间暴露，而不是在模板里变成一串 undefined。
 */
export function parseTavern<T>(schema: z.ZodType<T>, result: AppResult<unknown>, what: string): AppResult<T> {
  if (!result.success) return result;
  const parsed = schema.safeParse(result.data);
  if (parsed.success) return ok(parsed.data);
  console.warn(`[tavern] ${what}响应格式不符`, parsed.error.issues[0]);
  return fail({ code: 'validation', message: `${what}响应格式错误` });
}
