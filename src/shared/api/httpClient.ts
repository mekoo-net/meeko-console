import { useAuthStore } from '@/stores/auth';

import { apiUrl } from './apiBase';
import { fail, ok, type AppError, type AppResult, type ErrorCode } from './httpTypes';
import { problemDetailsSchema, problemToAppError } from './problemDetails';

const SESSION_KEY = 'meeko.admin.session.v1';

function readAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0
      ? parsed.accessToken
      : null;
  } catch {
    return null;
  }
}

function statusToErrorCode(status: number): ErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'too_many_requests';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'upstream';
  return 'unknown';
}

async function parseFailure(res: Response): Promise<AppError> {
  const fallback = statusToErrorCode(res.status);
  try {
    const body: unknown = await res.json();
    const parsed = problemDetailsSchema.safeParse(body);
    if (parsed.success) {
      return problemToAppError(parsed.data, fallback);
    }
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail?: string }).detail;
      return { code: fallback, message: detail ?? `HTTP ${res.status}` };
    }
  } catch {
    /* empty body */
  }
  return { code: fallback, message: `HTTP ${res.status}` };
}

function handleUnauthorized(): void {
  try {
    useAuthStore().logout();
  } catch {
    localStorage.removeItem(SESSION_KEY);
    window.location.assign('/login');
  }
}

/**
 * 带 Staff JWT 的 fetch；401 时清空会话并跳转登录页。
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<AppResult<T>> {
  const headers = new Headers(init.headers);
  const token = readAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(apiUrl(path), { ...init, headers });
    if (res.status === 401) {
      handleUnauthorized();
      return fail({ code: 'unauthorized', message: '登录已过期，请重新登录' });
    }
    if (!res.ok) {
      return fail(await parseFailure(res));
    }
    if (res.status === 204) {
      return ok(undefined as T);
    }
    const data = (await res.json()) as T;
    return ok(data);
  } catch (err) {
    return fail({
      code: 'unknown',
      message: err instanceof Error ? err.message : '网络错误',
    });
  }
}

/** DemuxAi / BFF 列表分页体（`ApiEnvelope.data` 内层）。 */
export interface ItemsEnvelope<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  if (!qs) return path;
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`;
}

/** BFF / Keystone：HTTP 200 直接返回 `T`；失败走 ProblemDetails。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<AppResult<T>> {
  const { method = 'GET', body, query } = options;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return apiFetch<T>(withQuery(path, query), init);
}

interface DemuxAiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T | null;
}

/**
 * DemuxAi 管理端：`HTTP 200` + `{ success, message?, data }`。
 * 业务失败时 `success === false`，仍可能是 200。
 */
export async function requestDemuxAi<T>(
  path: string,
  options: RequestOptions = {},
): Promise<AppResult<T>> {
  const result = await request<DemuxAiEnvelope<T>>(path, options);
  if (!result.success) return result;

  const envelope = result.data;
  if (!envelope.success) {
    return fail({ code: 'unknown', message: envelope.message || '请求失败' });
  }
  if (envelope.data === undefined || envelope.data === null) {
    return ok(undefined as T);
  }
  return ok(envelope.data);
}

/** Tavern 管理端：与 DemuxAi 相同 `{ success, message?, data }` 信封。 */
export async function requestTavern<T>(
  path: string,
  options: RequestOptions = {},
): Promise<AppResult<T>> {
  return requestDemuxAi<T>(path, options);
}
