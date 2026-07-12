import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';
import { createUidSeq } from '@/shared/lib/id';

import {
  adminCommandResultSchema,
  storageBackendDtoSchema,
  testStorageBackendResultSchema,
  type AdminCommandResult,
  type CreateStorageBackendPayload,
  type StorageBackendDto,
  type TestStorageBackendResult,
  type UpdateStorageBackendPayload,
} from '../../model/storageBackend.types';
import type { StorageAdminPort } from '../ports/storageAdminPort';

const genId = createUidSeq(9_200_000);

function parseBackend(v: unknown): AppResult<StorageBackendDto> {
  const r = storageBackendDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'StorageBackendDto 格式错误' });
}

function parseAdminCmd(v: unknown): AppResult<AdminCommandResult> {
  const r = adminCommandResultSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'AdminCommandResult 格式错误' });
}

export class StorageAdminMock implements StorageAdminPort {
  private readonly rows = new Map<string, StorageBackendDto>();
  private readonly secrets = new Map<string, string>();

  constructor() {
    const now = '2026-05-01T10:00:00Z';
    const localId = genId();
    const ossId = genId();

    const local: StorageBackendDto = {
      id: localId,
      name: '本地开发',
      providerType: 'local',
      endpoint: 'local',
      region: 'local',
      bucket: 'dev',
      publicEndpoint: null,
      cdnBaseUrl: 'http://localhost:7000/api/storage/files',
      accessKeyId: 'local',
      accessKeySecretConfigured: false,
      localRoot: 'data/storage',
      isActive: true,
      isDefault: true,
      createdAtUtc: now,
      updatedAtUtc: now,
    };

    const oss: StorageBackendDto = {
      id: ossId,
      name: '阿里云 OSS',
      providerType: 'aliyun-oss',
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      region: 'cn-hangzhou',
      bucket: 'meeko-dev',
      publicEndpoint: null,
      cdnBaseUrl: 'https://cdn.example.com',
      accessKeyId: 'LTAI****',
      accessKeySecretConfigured: true,
      localRoot: null,
      isActive: false,
      isDefault: false,
      createdAtUtc: now,
      updatedAtUtc: now,
    };

    this.rows.set(localId, local);
    this.rows.set(ossId, oss);
    this.secrets.set(ossId, '__stub__');
  }

  async listBackends(): Promise<AppResult<StorageBackendDto[]>> {
    await delay();
    const out: StorageBackendDto[] = [];
    for (const r of this.rows.values()) {
      const p = parseBackend(r);
      if (!p.success) return p;
      out.push(p.data);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return ok(out);
  }

  async getBackend(id: string): Promise<AppResult<StorageBackendDto | null>> {
    await delay();
    const r = this.rows.get(id);
    if (!r) return ok(null);
    return parseBackend(r);
  }

  async createBackend(payload: CreateStorageBackendPayload): Promise<AppResult<AdminCommandResult>> {
    await delay();
    const id = genId();
    const now = new Date().toISOString();
    const row: StorageBackendDto = {
      id,
      name: payload.name,
      providerType: payload.providerType,
      endpoint: payload.endpoint,
      region: payload.region,
      bucket: payload.bucket,
      publicEndpoint: payload.publicEndpoint ?? null,
      cdnBaseUrl: payload.cdnBaseUrl ?? null,
      accessKeyId: payload.accessKeyId,
      accessKeySecretConfigured: Boolean(payload.accessKeySecret),
      localRoot: payload.localRoot ?? null,
      isActive: payload.isActive,
      isDefault: payload.isDefault,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    const pr = parseBackend(row);
    if (!pr.success) return pr;
    if (payload.isDefault) {
      for (const [k, v] of this.rows) {
        if (v.isDefault) this.rows.set(k, { ...v, isDefault: false });
      }
    }
    this.rows.set(id, pr.data);
    if (payload.accessKeySecret) this.secrets.set(id, '[redacted]');
    return parseAdminCmd({ success: true, id });
  }

  async updateBackend(
    id: string,
    payload: UpdateStorageBackendPayload,
  ): Promise<AppResult<AdminCommandResult>> {
    await delay();
    const cur = this.rows.get(id);
    if (!cur) return fail({ code: 'not_found', message: '存储后端不存在' });
    const now = new Date().toISOString();
    const next: StorageBackendDto = {
      ...cur,
      name: payload.name,
      providerType: payload.providerType,
      endpoint: payload.endpoint,
      region: payload.region,
      bucket: payload.bucket,
      publicEndpoint: payload.publicEndpoint ?? null,
      cdnBaseUrl: payload.cdnBaseUrl ?? null,
      accessKeyId: payload.accessKeyId,
      accessKeySecretConfigured: payload.accessKeySecret
        ? true
        : cur.accessKeySecretConfigured,
      localRoot: payload.localRoot ?? null,
      isActive: payload.isActive,
      isDefault: payload.isDefault,
      updatedAtUtc: now,
    };
    const pr = parseBackend(next);
    if (!pr.success) return pr;
    if (payload.isDefault) {
      for (const [k, v] of this.rows) {
        if (k !== id && v.isDefault) this.rows.set(k, { ...v, isDefault: false });
      }
    }
    this.rows.set(id, pr.data);
    if (payload.accessKeySecret) this.secrets.set(id, '[redacted]');
    return parseAdminCmd({ success: true, id });
  }

  async deleteBackend(id: string): Promise<AppResult<AdminCommandResult>> {
    await delay();
    if (!this.rows.has(id)) return fail({ code: 'not_found', message: '存储后端不存在' });
    this.rows.delete(id);
    this.secrets.delete(id);
    return parseAdminCmd({ success: true, id });
  }

  async testBackend(id: string): Promise<AppResult<TestStorageBackendResult>> {
    await delay();
    if (!this.rows.has(id)) return fail({ code: 'not_found', message: '存储后端不存在' });
    const result = {
      success: true,
      elapsedMs: 28,
      failureCode: null,
      failureMessage: null,
    };
    const r = testStorageBackendResultSchema.safeParse(result);
    return r.success
      ? ok(r.data)
      : fail({ code: 'validation', message: 'TestStorageBackendResult 格式错误' });
  }
}
