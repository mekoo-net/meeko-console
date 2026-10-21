import { apiUrl } from '@/shared/api/apiBase';
import { requestApiEnvelope, type ItemsEnvelope, type RequestOptions } from '@/shared/api/httpClient';
import type { AppResult } from '@/shared/api/httpTypes';

export type { ItemsEnvelope, RequestOptions };

/**
 * ToApi 控制面（Meeko.ToApi）经平台 Gateway 的 `/toapi/**` 前缀访问，与 Yomi / Tavern 同一套 ApiEnvelope。
 * 令牌 / 限速这些网关自有数据的管理面等 ToApi.Gateway 接上 Staff 鉴权后再加第二个 base。
 */
export function requestToApi<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(apiUrl, path, options);
}
