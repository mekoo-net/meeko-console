import { errorText, kindOfStatus, readApiError } from '@platform/contracts';

import type { AppError, ErrorCode } from './httpTypes';

/**
 * 平台的失败怎么变成这边的 `AppError`。
 *
 * 平台回的失败里**没有给人看的那句话**（ProblemDetails 不带 `detail`，信封不带 `message`），只有：
 * - 种类 `code`（`GEN_01` 校验不过、`GEN_02` 没找到……）；
 * - 原因码 `reason`（`role_in_use`、`voucher_template_archived`……），操作的人改一下就能过去的失败都有；
 * - 逐字段的错 `errors`。
 *
 * 界面上说什么按原因码（没有就按种类）从 `@platform/contracts` 的 i18n 里取——和各产品前端是同一套文案。
 * 以前这里读的是 `detail`，后端那句话写成什么样界面上就是什么样（有中文有英文）。
 */

/** 平台的种类 → 这边界面逻辑用的名字（`error.code === 'not_found'` 这种判断认它）。 */
const KIND_TO_CODE: Record<string, ErrorCode> = {
  GEN_01: 'validation',
  GEN_02: 'not_found',
  GEN_03: 'conflict',
  GEN_04: 'unauthorized',
  GEN_05: 'forbidden',
  GEN_06: 'too_many_requests',
  GEN_07: 'upstream',
  GEN_08: 'dependency_down',
  GEN_09: 'timeout',
};

/**
 * 一次失败的回复（ProblemDetails，或者失败的信封）→ `AppError`。
 * 回复读不出来（空的、不是 JSON、网关挡的）时只按 HTTP 状态码算种类。
 */
export function failureToAppError(body: unknown, status: number): AppError {
  const error = readApiError(body) ?? {};
  const kind = error.code ?? kindOfStatus(status);
  return {
    code: (kind ? KIND_TO_CODE[kind] : undefined) ?? 'unknown',
    message: errorText({ code: kind, reason: error.reason }, { locale: 'zh-CN' }),
    ...(error.reason !== undefined ? { reason: error.reason } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}
