import { apiUrl } from '@/shared/api/apiBase';
import { requestApiEnvelope, type ItemsEnvelope, type RequestOptions } from '@/shared/api/httpClient';
import type { AppResult } from '@/shared/api/httpTypes';

export type { ItemsEnvelope, RequestOptions };

/**
 * Jastalk 的业务（Meeko.Jastalk）经平台 Gateway 的 `/jastalk/**` 前缀访问，与 Yomi / Tavern 同一套 ApiEnvelope。
 * 管理接口先要员工身份，每个动作再要一个 `jastalk:*` 权限码；没有权限时后端回 403。
 * Jastalk 的网关（WebSocket）不在这里：管理端不连它。
 */
export function requestJastalk<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(apiUrl, path, options);
}
