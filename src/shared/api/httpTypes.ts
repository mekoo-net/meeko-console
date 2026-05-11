/**
 * Meeko BFF/Keystone 统一返回模型在前端的镜像。
 *
 * 后端约定（Meeko.Common.Results）：
 * - 成功 ToHttp() → 200 + 原始 JSON body（即 `T`）。
 * - 失败 ToHttp() → RFC 7807 ProblemDetails，状态码与 `code` extension 对应到 `ErrorCode`。
 *
 * 前端只暴露离散的 `AppResult<T>`：调用方对“失败”的处理永远走同一分支，
 * 不必关心传输层是 fetch reject 还是 200/4xx/5xx。
 */
export type ErrorCode =
  | 'unknown'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_many_requests'
  | 'upstream'
  | 'dependency_down'
  | 'timeout';

export interface AppError {
  code: ErrorCode;
  message: string;
  /** RFC 7807 ProblemDetails 的 errors 字段：字段级校验错误。 */
  details?: Record<string, string[]>;
  /** 用于 OTP / Recharge 等 4xx Retry-After 场景。 */
  retryAfterSeconds?: number;
}

export interface AppOk<T> {
  success: true;
  data: T;
}

export interface AppFail {
  success: false;
  error: AppError;
}

export type AppResult<T> = AppOk<T> | AppFail;

export const ok = <T>(data: T): AppOk<T> => ({ success: true, data });
export const fail = (error: AppError): AppFail => ({ success: false, error });

/**
 * 标准化失败：把任意原因塞入统一错误体。
 * 业务代码用 `mapUnknownError` 收尾 try/catch，禁止把原始 Error 暴露到 store / view。
 */
export function mapUnknownError(reason: unknown, fallback: ErrorCode = 'unknown'): AppError {
  if (reason instanceof Error) {
    return { code: fallback, message: reason.message };
  }
  if (typeof reason === 'string') {
    return { code: fallback, message: reason };
  }
  return { code: fallback, message: '未知错误' };
}
