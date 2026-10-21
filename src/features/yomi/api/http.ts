import { apiUrl, yomiApiUrl } from '@/shared/api/apiBase';
import { requestApiEnvelope, type ItemsEnvelope, type RequestOptions } from '@/shared/api/httpClient';
import type { AppResult } from '@/shared/api/httpTypes';

export type { ItemsEnvelope, RequestOptions };

export function requestYomi<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(apiUrl, path, options);
}

export function requestYomiGateway<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(yomiApiUrl, path, options);
}
