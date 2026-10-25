import { z } from 'zod';

import {
  ACTIVITY_LIMITS,
  IMAGE_MIMES,
  activityListSchema,
  yomiActivitySchema,
  type ActivityInput,
  type ActivityListQuery,
  type ActivityListResult,
  type ActivityImage,
  type YomiActivity,
} from '@/features/yomi/model/activity.types';
import type { ActivityMessages } from '@/features/yomi/model/activityMessages';
import type { YomiActivityPort } from '@/features/yomi/services/ports/yomiActivityPort';
import { requestYomi } from '@/features/yomi/api/http';
import { yomiPlatformPaths } from '@/features/yomi/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = yomiPlatformPaths.adminActivities;

interface ImageSignResult {
  uploadUrl: string | null;
  uploadMethod: string;
  uploadHeaders: Record<string, string>;
  storageKey: string;
}

const messagesSchema = z.record(z.string(), z.record(z.string(), z.string()));

function parseActivity(value: unknown): AppResult<YomiActivity> {
  const r = yomiActivitySchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '活动响应格式错误' });
}

export function validateImageFile(file: File): string | null {
  if (!(IMAGE_MIMES as readonly string[]).includes(file.type)) return `「${file.name}」不是 JPG / PNG / WebP / GIF`;
  if (file.size > ACTIVITY_LIMITS.imageBytes) return `「${file.name}」超过 5MB`;
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// 存储返回的直传地址不带协议头；本地开发的 local 后端可能是 http，跟随当前页面协议。
function withScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.protocol}//${url.replace(/^\/+/, '')}`;
}

export class YomiActivityHttpAdapter implements YomiActivityPort {
  async list(query: ActivityListQuery): Promise<AppResult<ActivityListResult>> {
    const res = await requestYomi<unknown>(BASE, {
      query: {
        page: query.page,
        pageSize: query.pageSize,
        status: query.status === 'all' ? undefined : query.status,
        isPublished: query.isPublished ?? undefined,
      },
    });
    if (!res.success) return res;
    const r = activityListSchema.safeParse(res.data);
    return r.success ? ok(r.data) : fail({ code: 'validation', message: '活动列表格式错误' });
  }

  async get(id: string): Promise<AppResult<YomiActivity>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(id)}`);
    return res.success ? parseActivity(res.data) : res;
  }

  async messages(id: string): Promise<AppResult<ActivityMessages>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(id)}/messages`);
    if (!res.success) return res;
    const r = messagesSchema.safeParse(res.data);
    return r.success ? ok(r.data) : fail({ code: 'validation', message: '语言包格式错误' });
  }

  async create(input: ActivityInput): Promise<AppResult<YomiActivity>> {
    const res = await requestYomi<unknown>(BASE, { method: 'POST', body: input });
    return res.success ? parseActivity(res.data) : res;
  }

  async update(id: string, input: ActivityInput): Promise<AppResult<YomiActivity>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
    return res.success ? parseActivity(res.data) : res;
  }

  async setPublished(id: string, isPublished: boolean): Promise<AppResult<YomiActivity>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      body: { isPublished },
    });
    return res.success ? parseActivity(res.data) : res;
  }

  async remove(id: string): Promise<AppResult<void>> {
    const res = await requestYomi<unknown>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.success ? ok(undefined) : res;
  }

  async uploadImage(file: File): Promise<AppResult<ActivityImage>> {
    const invalid = validateImageFile(file);
    if (invalid) return fail({ code: 'validation', message: invalid });

    const sign = await requestYomi<ImageSignResult>(`${BASE}/images/sign`, {
      method: 'POST',
      body: { mime: file.type, size: file.size, sha256: await sha256Hex(file) },
    });
    if (!sign.success) return sign;

    // uploadUrl 为空说明同内容已在存储里（按哈希去重），直接确认即可。
    if (sign.data.uploadUrl) {
      // 直传对象存储用原生 fetch：不能带管理台的 Authorization 头，否则签名校验失败。
      const put = await fetch(withScheme(sign.data.uploadUrl), {
        method: sign.data.uploadMethod || 'PUT',
        headers: sign.data.uploadHeaders,
        body: file,
      }).catch(() => null);
      if (!put?.ok) return fail({ code: 'upstream', message: `「${file.name}」上传到对象存储失败${put ? `（${put.status}）` : ''}` });
    }

    return requestYomi<ActivityImage>(`${BASE}/images/confirm`, {
      method: 'POST',
      body: { storageKey: sign.data.storageKey },
    });
  }
}
