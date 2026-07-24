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
import type { StorageOverview } from '../../model/storageOverview.types';
import type {
  BrowseStorageObjectsParams,
  ListStorageObjectsParams,
  StorageBrowseResult,
  StorageObjectItem,
  StorageObjectList,
  StorageObjectRef,
  StorageObjectRefsResult,
} from '../../model/storageObject.types';
import type { StorageAdminPort } from '../ports/storageAdminPort';

const genId = createUidSeq(9_200_000);
const genObjId = createUidSeq(9_300_000);
const genRefId = createUidSeq(9_400_000);

interface MockObjectBundle {
  item: StorageObjectItem;
  refs: StorageObjectRef[];
}

function shaHex(seed: number): string {
  return seed.toString(16).padStart(64, 'a').slice(0, 64);
}

function buildMockObjects(backendId: string, backendName: string): MockObjectBundle[] {
  const purposes = ['avatar', 'persona-avatar', 'chat-image', 'chat-video'] as const;
  const products = ['platform', 'tavern'] as const;
  const bundles: MockObjectBundle[] = [];

  for (let i = 0; i < 36; i++) {
    const sha = shaHex(i + 1);
    const purpose: string = purposes[i % purposes.length]!;
    const product: string = purpose === 'avatar' ? 'platform' : products[i % 2]!;
    const isPrivate = purpose === 'chat-image' || purpose === 'chat-video';
    const prefix = isPrivate ? 'store/blobs' : 'static/blobs';
    const storageKey = `${prefix}/${sha.slice(0, 2)}/${sha}`;
    const mime =
      purpose === 'chat-video'
        ? 'video/mp4'
        : purpose === 'chat-image'
          ? 'image/jpeg'
          : 'image/png';
    const createdByUid = String(10_001 + (i % 8));
    const status = i === 34 || i === 35 ? 'orphaned' : 'committed';
    const createdAt = new Date(Date.UTC(2026, 4, 1 + (i % 28), 10, i % 60)).toISOString();

    const item: StorageObjectItem = {
      id: genObjId(),
      storageKey,
      sha256: sha,
      backendId,
      backendName,
      createdByUid,
      mime,
      size: 102_400 + i * 8192,
      status,
      createdAtUtc: createdAt,
      activeRefCount: status === 'orphaned' ? 0 : 1 + (i % 3),
      totalRefCount: status === 'orphaned' ? 1 : 1 + (i % 4),
      products: [product],
      purposes: [purpose],
      publicUrl: isPrivate ? null : `https://picsum.photos/seed/${sha.slice(0, 8)}/200`,
    };

    const refs: StorageObjectRef[] = [
      {
        id: genRefId(),
        accountUid: createdByUid,
        product,
        purpose,
        refKey: purpose.startsWith('chat') ? `msg-${1000 + i}` : null,
        status: status === 'orphaned' ? 'released' : 'committed',
        createdAtUtc: createdAt,
        lastSeenAtUtc: createdAt,
        releasedAtUtc: status === 'orphaned' ? createdAt : null,
      },
    ];

    if (i === 0) {
      refs.push({
        id: genRefId(),
        accountUid: '10002',
        product: 'tavern',
        purpose: 'chat-image',
        refKey: 'msg-shared-001',
        status: 'committed',
        createdAtUtc: new Date(Date.UTC(2026, 4, 5, 12, 0)).toISOString(),
        lastSeenAtUtc: new Date(Date.UTC(2026, 4, 10, 8, 30)).toISOString(),
        releasedAtUtc: null,
      });
      item.activeRefCount = 2;
      item.totalRefCount = 2;
      item.products = ['platform', 'tavern'];
      item.purposes = ['avatar', 'chat-image'];
    }

    if (i === 5) {
      refs.push({
        id: genRefId(),
        accountUid: '10003',
        product: 'tavern',
        purpose: 'chat-image',
        refKey: 'msg-dedup-005',
        status: 'released',
        createdAtUtc: new Date(Date.UTC(2026, 3, 20, 9, 0)).toISOString(),
        lastSeenAtUtc: new Date(Date.UTC(2026, 4, 1, 9, 0)).toISOString(),
        releasedAtUtc: new Date(Date.UTC(2026, 4, 15, 9, 0)).toISOString(),
      });
      item.totalRefCount = 2;
    }

    bundles.push({ item, refs });
  }

  return bundles;
}

function filterObjects(
  bundles: MockObjectBundle[],
  params: ListStorageObjectsParams,
): StorageObjectItem[] {
  return bundles
    .map((b) => b.item)
    .filter((row) => {
      if (params.accountUid && !bundles.some(
        (b) =>
          b.item.storageKey === row.storageKey
          && b.refs.some((r) => r.accountUid === params.accountUid),
      )) {
        return false;
      }
      if (params.product && !row.products.includes(params.product)) return false;
      if (params.purpose && !row.purposes.includes(params.purpose)) return false;
      if (params.sha256 && !row.sha256.startsWith(params.sha256.toLowerCase())) return false;
      if (params.mimePrefix && !row.mime.startsWith(params.mimePrefix)) return false;
      if (params.status && row.status !== params.status) return false;
      if (params.backendId && row.backendId !== params.backendId) return false;
      return true;
    });
}

function browseObjects(
  bundles: MockObjectBundle[],
  params: BrowseStorageObjectsParams,
): StorageBrowseResult {
  const prefix = params.prefix ?? '';
  const delimiter = '/';
  const folderSet = new Set<string>();
  const files: StorageObjectItem[] = [];

  for (const b of bundles) {
    if (params.backendId && b.item.backendId !== params.backendId) continue;
    const key = b.item.storageKey;
    if (!key.startsWith(prefix)) continue;

    if (key.length <= prefix.length) {
      files.push(b.item);
      continue;
    }

    const remainder = key.slice(prefix.length);
    const idx = remainder.indexOf(delimiter);
    if (idx >= 0) {
      folderSet.add(prefix + remainder.slice(0, idx + delimiter.length));
    } else {
      files.push(b.item);
    }
  }

  const page = params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize > 0 ? params.pageSize : 50;
  const start = (page - 1) * pageSize;

  return {
    prefix,
    commonPrefixes: [...folderSet].sort(),
    items: files.slice(start, start + pageSize),
    total: files.length,
  };
}

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
  private readonly objectBundles: MockObjectBundle[] = [];
  private defaultBackendId = '';

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
      cdnStaticBaseUrl: 'http://localhost:7000/api/storage/files',
      cdnStoreBaseUrl: null,
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
      cdnStaticBaseUrl: 'https://static.oss.meeyo.org',
      cdnStoreBaseUrl: 'https://store.oss.meeyo.org',
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
    this.defaultBackendId = localId;
    this.objectBundles.push(...buildMockObjects(localId, local.name));
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

  async getOverview(): Promise<AppResult<StorageOverview>> {
    await delay();
    const backends = [...this.rows.values()];
    const rows = backends.map((b) => ({
      backendId: b.id,
      name: b.name,
      providerType: b.providerType,
      isActive: b.isActive,
      isDefault: b.isDefault,
      objectCount: b.id === this.defaultBackendId ? this.objectBundles.length : 0,
      totalBytes: b.id === this.defaultBackendId
        ? this.objectBundles.reduce((s, b) => s + b.item.size, 0)
        : 0,
      orphanedCount: b.id === this.defaultBackendId
        ? this.objectBundles.filter((b) => b.item.status === 'orphaned').length
        : 0,
      activeRefCount: b.id === this.defaultBackendId
        ? this.objectBundles.reduce((s, b) => s + b.item.activeRefCount, 0)
        : 0,
      pendingUploadCount: b.isDefault ? 3 : 0,
    }));
    return ok({
      backendCount: backends.length,
      activeBackendCount: backends.filter((b) => b.isActive).length,
      totalObjectCount: rows.reduce((s, r) => s + r.objectCount, 0),
      totalBytes: rows.reduce((s, r) => s + r.totalBytes, 0),
      orphanedObjectCount: rows.reduce((s, r) => s + r.orphanedCount, 0),
      pendingUploadCount: rows.reduce((s, r) => s + r.pendingUploadCount, 0),
      activeRefCount: rows.reduce((s, r) => s + r.activeRefCount, 0),
      backends: rows,
    });
  }

  async listObjects(params: ListStorageObjectsParams): Promise<AppResult<StorageObjectList>> {
    await delay();
    const filtered = filterObjects(this.objectBundles, params);
    const page = params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize > 0 ? params.pageSize : 20;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return ok({ items, total: filtered.length });
  }

  async browseObjects(params: BrowseStorageObjectsParams): Promise<AppResult<StorageBrowseResult>> {
    await delay();
    return ok(browseObjects(this.objectBundles, params));
  }

  async getObjectRefs(storageKey: string): Promise<AppResult<StorageObjectRefsResult>> {
    await delay();
    const bundle = this.objectBundles.find((b) => b.item.storageKey === storageKey);
    if (!bundle) {
      return ok({
        found: false,
        storageKey,
        refs: [],
      });
    }
    return ok({
      found: true,
      storageKey: bundle.item.storageKey,
      sha256: bundle.item.sha256,
      createdByUid: bundle.item.createdByUid,
      createdAtUtc: bundle.item.createdAtUtc,
      size: bundle.item.size,
      mime: bundle.item.mime,
      refs: bundle.refs,
    });
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
      cdnStaticBaseUrl: payload.cdnStaticBaseUrl ?? null,
      cdnStoreBaseUrl: payload.cdnStoreBaseUrl ?? null,
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
      cdnStaticBaseUrl: payload.cdnStaticBaseUrl ?? null,
      cdnStoreBaseUrl: payload.cdnStoreBaseUrl ?? null,
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
