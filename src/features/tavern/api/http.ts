import { apiUrl } from '@/shared/api/apiBase';
import { requestApiEnvelope, type RequestOptions } from '@/shared/api/httpClient';
import type { AppResult } from '@/shared/api/httpTypes';

export type { RequestOptions };

export function requestTavern<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  return requestApiEnvelope(apiUrl, path, options);
}
