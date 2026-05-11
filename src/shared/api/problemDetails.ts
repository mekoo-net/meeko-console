import { z } from 'zod';

import type { AppError, ErrorCode } from './httpTypes';

/**
 * 与 Meeko.Common.Results.ResultHttpExtensions 一一对应的 ProblemDetails schema。
 * - `code` 为自定义扩展，已在后端写死；
 * - `errors` 为字段级校验错误，仅在 ErrorCode.Validation 出现。
 *
 * 提供给将来的 HttpAdapter 用；Mock 永远走 `ok/fail`，不会经过这里。
 */
const errorCodeValues: readonly ErrorCode[] = [
  'unknown',
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'too_many_requests',
  'upstream',
  'dependency_down',
  'timeout',
] as const;

const errorCodeSchema = z.enum(errorCodeValues as [ErrorCode, ...ErrorCode[]]);

export const problemDetailsSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  code: errorCodeSchema.optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function problemToAppError(problem: ProblemDetails, fallback: ErrorCode = 'unknown'): AppError {
  return {
    code: problem.code ?? fallback,
    message: problem.detail ?? problem.title ?? '请求失败',
    ...(problem.errors !== undefined ? { details: problem.errors } : {}),
  };
}
