/**
 * 与后端/BFF 对齐的通用类型出口（UI 通过 `@/shared/api-types` 引用，避免直连传输细节）。
 */
export type {
  AppError,
  AppFail,
  AppOk,
  AppResult,
  ErrorCode,
} from '../api/httpTypes';
export { fail, mapUnknownError, ok } from '../api/httpTypes';
