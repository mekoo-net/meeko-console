import type { z } from 'zod';

import {
  classifierDocumentResponseSchema,
  classifierSchemaResponseSchema,
  classifierValidationResponseSchema,
  type ClassifierDoc,
  type ClassifierProblem,
  type ClassifierSchema,
  type ClassifierSnapshot,
} from '@/features/platform/components/oneapi/model/classifier.types';
import type { OneApiClassifierPort } from '@/features/platform/components/oneapi/services/ports/oneapiClassifierPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

/**
 * 请求分类器的规则是号池后台的接口，和模型价格一样由平台网关验完身份直接转给它（不经 Bff）：
 * `/oneapi/vault` 后面的 `/v1/classifier/**` 就是它原来的路径。成功的回包是它的 JSON（不包信封），
 * 失败是它按平台的标准错误回的。读要 Staff 且有 `platform.settings.read`，写和校验要 `platform.settings.write`。
 */
const VAULT_CLASSIFIER_BASE = '/oneapi/vault/v1/classifier';

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

function toSnapshot(value: unknown): AppResult<ClassifierSnapshot> {
  const parsed = parse(classifierDocumentResponseSchema, value, '请求分类规则');
  if (!parsed.success) return parsed;
  return ok({ doc: parsed.data.value ?? {}, version: parsed.data.version ?? null });
}

export class OneApiClassifierHttpAdapter implements OneApiClassifierPort {
  async load(): Promise<AppResult<ClassifierSnapshot>> {
    const res = await request<unknown>(VAULT_CLASSIFIER_BASE);
    return res.success ? toSnapshot(res.data) : res;
  }

  async save(doc: ClassifierDoc, version: string | null): Promise<AppResult<ClassifierSnapshot>> {
    const res = await request<unknown>(VAULT_CLASSIFIER_BASE, {
      method: 'PUT',
      // 还没有文档时不带版本号：号池后台把「不带」当成「只在还没有的时候写」
      body: version === null ? { value: doc } : { value: doc, version },
    });
    return res.success ? toSnapshot(res.data) : res;
  }

  async validate(doc: ClassifierDoc): Promise<AppResult<ClassifierProblem[]>> {
    const res = await request<unknown>(`${VAULT_CLASSIFIER_BASE}/validate`, {
      method: 'POST',
      body: { value: doc },
    });
    if (!res.success) return res;
    const parsed = parse(classifierValidationResponseSchema, res.data, '规则校验');
    return parsed.success ? ok(parsed.data.problems) : parsed;
  }

  async schema(): Promise<AppResult<ClassifierSchema>> {
    const res = await request<unknown>(`${VAULT_CLASSIFIER_BASE}/schema`);
    return res.success ? parse(classifierSchemaResponseSchema, res.data, '规则选项') : res;
  }
}
