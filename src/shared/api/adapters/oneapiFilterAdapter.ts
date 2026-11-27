import type { z } from 'zod';

import {
  filterDocumentResponseSchema,
  filterSchemaResponseSchema,
  filterValidationResponseSchema,
  type FilterDoc,
  type FilterProblem,
  type FilterSchema,
  type FilterSnapshot,
} from '@/features/platform/components/oneapi/model/filter.types';
import type { OneApiFilterPort } from '@/features/platform/components/oneapi/services/ports/oneapiFilterPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

/**
 * 过滤器是号池后台的接口，和模型价格一样由平台网关验完身份直接转给它（不经 Bff）：
 * `/oneapi/vault` 后面的 `/v1/filter/**` 就是它原来的路径。成功的回包是它的 JSON（不包信封），
 * 失败是它按平台的标准错误回的。读要 Staff 且有 `platform.settings.read`，写和校验要 `platform.settings.write`。
 */
const VAULT_FILTER_BASE = '/oneapi/vault/v1/filter';

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

function toSnapshot(value: unknown): AppResult<FilterSnapshot> {
  const parsed = parse(filterDocumentResponseSchema, value, '过滤器');
  if (!parsed.success) return parsed;
  return ok({ doc: parsed.data.value ?? {}, version: parsed.data.version ?? null });
}

export class OneApiFilterHttpAdapter implements OneApiFilterPort {
  async load(): Promise<AppResult<FilterSnapshot>> {
    const res = await request<unknown>(VAULT_FILTER_BASE);
    return res.success ? toSnapshot(res.data) : res;
  }

  async save(doc: FilterDoc, version: string | null): Promise<AppResult<FilterSnapshot>> {
    const res = await request<unknown>(VAULT_FILTER_BASE, {
      method: 'PUT',
      // 还没有文档时不带版本号：号池后台把「不带」当成「只在还没有的时候写」
      body: version === null ? { value: doc } : { value: doc, version },
    });
    return res.success ? toSnapshot(res.data) : res;
  }

  async validate(doc: FilterDoc): Promise<AppResult<FilterProblem[]>> {
    const res = await request<unknown>(`${VAULT_FILTER_BASE}/validate`, {
      method: 'POST',
      body: { value: doc },
    });
    if (!res.success) return res;
    const parsed = parse(filterValidationResponseSchema, res.data, '过滤器校验');
    return parsed.success ? ok(parsed.data.problems) : parsed;
  }

  async schema(): Promise<AppResult<FilterSchema>> {
    const res = await request<unknown>(`${VAULT_FILTER_BASE}/schema`);
    return res.success ? parse(filterSchemaResponseSchema, res.data, '过滤器选项') : res;
  }
}
