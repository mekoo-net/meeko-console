import { useAuthStore } from '@/stores/auth';

import { apiUrl } from './apiBase';
import { fail, ok, type AppError, type AppResult } from './httpTypes';
import { failureToAppError } from './problemDetails';

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

/** 失败的回复 → AppError。说什么按平台给的原因码、种类出（见 problemDetails.ts）；回复是空的就只按状态码。 */
async function parseFailure(res: Response): Promise<AppError> {
  const body: unknown = await res.json().catch(() => null);
  return failureToAppError(body, res.status);
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

/** Yomi / BFF 列表分页体（`ApiEnvelope.data` 内层）。 */
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

interface ApiEnvelope<T> {
  success: boolean;
  /** 平台的信封：失败是怎么回事在这里（种类 + 原因码）。 */
  error?: { code?: string; reason?: string };
  /** Yomi / Tavern / ToApi 的后端还没换到 error 对象，失败时只有这一句。它们换过来以后删。 */
  message?: string;
  data?: T | null;
}

export async function requestApiEnvelope<T>(
  resolveUrl: (path: string) => string,
  path: string,
  options: RequestOptions = {},
): Promise<AppResult<T>> {
  const { method = 'GET', body, query } = options;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const headers = new Headers(init.headers);
  const token = readAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(resolveUrl(withQuery(path, query)), { ...init, headers });
    if (res.status === 401) {
      handleUnauthorized();
      return fail({ code: 'unauthorized', message: '登录已过期，请重新登录' });
    }
    if (!res.ok) {
      return fail(await parseFailure(res));
    }
    const envelope = (await res.json()) as ApiEnvelope<T>;
    if (!envelope.success) {
      // 信封的失败 HTTP 是 200，种类在 error.code 里。没有 error 的是还没换过来的产品后端，只有一句 message。
      return fail(
        envelope.error
          ? failureToAppError(envelope, res.status)
          : { code: 'unknown', message: envelope.message || '请求失败' },
      );
    }
    if (envelope.data === undefined || envelope.data === null) {
      return ok(undefined as T);
    }
    return ok(envelope.data);
  } catch (err) {
    return fail({
      code: 'unknown',
      message: err instanceof Error ? err.message : '网络错误',
    });
  }
}
