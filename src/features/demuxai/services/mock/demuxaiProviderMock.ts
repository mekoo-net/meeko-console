import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import type { Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import type { ApiType, ProviderStatus } from '../../model/enums';
import {
  providerSchema,
  type CreateProviderInput,
  type FetchUpstreamModelsResult,
  type ListProvidersFilter,
  type Provider,
  type ProviderModel,
  type ProviderModelDraft,
  type ProviderModelMapping,
  type ProviderModelMappingDraft,
  type ProviderTestResult,
  type UpdateProviderInput,
} from '../../model/provider.types';
import type {
  DemuxaiProviderPort,
  ListProvidersPage,
} from '../ports/demuxaiProviderPort';

import {
  genMappingUid,
  genProviderModelUid,
  genProviderUid,
  getDemuxaiStore,
  reconcilePlatformModels,
  upstreamCatalog,
} from './data';

function parseProvider(v: unknown): AppResult<Provider> {
  const r = providerSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'Provider 格式错误' });
}

function maskKey(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`;
  return `${trimmed.slice(0, 6)}****${trimmed.slice(-4)}`;
}

function applyFilter(rows: Provider[], f: ListProvidersFilter): Provider[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((c) => {
    if (kw && !c.name.toLowerCase().includes(kw) && !c.baseUrl.toLowerCase().includes(kw)) {
      return false;
    }
    if (f.apiType !== 'all' && c.apiType !== f.apiType) return false;
    if (f.status !== 'all' && c.status !== f.status) return false;
    return true;
  });
}

/**
 * 把表单送上来的 ProviderModelDraft[] 落地为最终 ProviderModel[]：
 * - 已有 uid 的保留
 * - uid 为空或前端临时 id（含 `tmp-` 前缀）的，重新分配真 uid
 * - 同时返回「临时 uid → 真 uid」映射，供 mapping 的 providerModelUid 修复
 */
function commitProviderModels(drafts: ProviderModelDraft[]): {
  models: ProviderModel[];
  remap: Map<string, string>;
} {
  const models: ProviderModel[] = [];
  const remap = new Map<string, string>();
  for (const d of drafts) {
    const isTmp = !d.uid || d.uid.startsWith('tmp-') || /[^0-9]/.test(d.uid);
    const finalUid = isTmp ? genProviderModelUid() : d.uid;
    if (isTmp && d.uid) remap.set(d.uid, finalUid);
    models.push({
      uid: finalUid,
      modelName: d.modelName.trim(),
      family: d.family,
      capabilities: [...d.capabilities],
      visibleMinTier: d.visibleMinTier,
      maxContextTokens: d.maxContextTokens,
      maxOutputTokens: d.maxOutputTokens ?? null,
    });
  }
  return { models, remap };
}

/** 把 mapping 草稿与刚刚落地的 providerModels 对齐：providerModelUid 必须存在 */
function commitMappings(
  drafts: ProviderModelMappingDraft[],
  models: ProviderModel[],
  remap: Map<string, string>,
): { mappings: ProviderModelMapping[]; orphaned: ProviderModelMappingDraft[] } {
  const modelIds = new Set(models.map((m) => m.uid));
  const mappings: ProviderModelMapping[] = [];
  const orphaned: ProviderModelMappingDraft[] = [];
  for (const d of drafts) {
    const resolvedRef = remap.get(d.providerModelUid) ?? d.providerModelUid;
    if (!modelIds.has(resolvedRef)) {
      orphaned.push(d);
      continue;
    }
    const isTmp =
      !d.uid || d.uid.startsWith('tmp-') || (typeof d.uid === 'string' && /[^0-9]/.test(d.uid));
    mappings.push({
      uid: isTmp ? genMappingUid() : d.uid!,
      providerModelUid: resolvedRef,
      displayName: d.displayName.trim(),
      enabled: d.enabled,
      notes: d.notes?.trim() || null,
    });
  }
  return { mappings, orphaned };
}

function validateForm(
  providerModels: ProviderModelDraft[],
  mappings: ProviderModelMappingDraft[],
): AppResult<void> {
  // 1) providerModels: modelName 必填且 Provider 内唯一
  const seenNames = new Set<string>();
  for (let i = 0; i < providerModels.length; i += 1) {
    const m = providerModels[i]!;
    const name = m.modelName.trim();
    if (!name) {
      return fail({
        code: 'validation',
        message: `第 ${i + 1} 个渠道模型 modelName 不能为空`,
      });
    }
    if (seenNames.has(name)) {
      return fail({
        code: 'validation',
        message: `渠道模型 "${name}" 重复（同渠道内 modelName 必须唯一）`,
      });
    }
    seenNames.add(name);
    if (!Number.isFinite(m.maxContextTokens) || m.maxContextTokens <= 0) {
      return fail({
        code: 'validation',
        message: `渠道模型 "${name}" 的 maxContextTokens 必须 > 0`,
      });
    }
  }
  // 2) mappings: displayName 必填、必须指向已存在的 ProviderModel
  const knownIds = new Set(providerModels.map((m) => m.uid));
  for (let i = 0; i < mappings.length; i += 1) {
    const m = mappings[i]!;
    if (!m.displayName.trim()) {
      return fail({
        code: 'validation',
        message: `第 ${i + 1} 条上架映射缺少 displayName`,
      });
    }
    if (!m.providerModelUid || !knownIds.has(m.providerModelUid)) {
      return fail({
        code: 'validation',
        message: `上架映射 "${m.displayName}" 的 providerModelUid 无效`,
      });
    }
  }
  return ok(undefined);
}

export class DemuxaiProviderMock implements DemuxaiProviderPort {
  private get store() {
    return getDemuxaiStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListProvidersFilter;
  }): Promise<AppResult<ListProvidersPage>> {
    await delay();
    // MVP 阶段没有 priority/weight，按 createdAtUtc 倒序（新建在前）
    const sorted = [...this.store.providers].sort((a, b) =>
      b.createdAtUtc.localeCompare(a.createdAtUtc),
    );
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: Provider[] = [];
    for (const it of slice) {
      const r = parseProvider(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async get(uid: Uid): Promise<AppResult<Provider>> {
    await delay();
    const row = this.store.providers.find((c) => c.uid === uid);
    if (!row) return fail({ code: 'not_found', message: `模型渠道 ${uid} 不存在` });
    return parseProvider(row);
  }

  async create(input: CreateProviderInput): Promise<AppResult<Provider>> {
    await delay();
    if (!input.apiKey || input.apiKey.trim().length < 8) {
      return fail({
        code: 'validation',
        message: 'API Key 长度过短',
        details: { apiKey: ['至少 8 位'] },
      });
    }
    const v = validateForm(input.providerModels, input.modelMappings);
    if (!v.success) return v;

    const { models, remap } = commitProviderModels(input.providerModels);
    const { mappings, orphaned } = commitMappings(input.modelMappings, models, remap);
    if (orphaned.length > 0) {
      return fail({
        code: 'validation',
        message: `${orphaned.length} 条上架映射引用了不存在的 ProviderModel`,
      });
    }

    const t = new Date().toISOString();
    // 模拟数据库自增主键：从现有 max(id)+1，没有就从 1001 起步
    const nextId = this.store.providers.reduce((m, p) => Math.max(m, p.id), 1000) + 1;
    const row: Provider = {
      id: nextId,
      uid: genProviderUid(),
      name: input.name.trim(),
      apiType: input.apiType,
      baseUrl: input.baseUrl.trim(),
      apiKeyMasked: maskKey(input.apiKey),
      notes: input.notes?.trim() || null,
      status: 'enabled',
      autoDisabledCode: null,
      testLatencyMs: null,
      testSucceededAtUtc: null,
      errorRate24h: 0,
      callCount24h: 0,
      providerModels: models,
      modelMappings: mappings,
      createdAtUtc: t,
      updatedAtUtc: t,
    };
    const p = parseProvider(row);
    if (!p.success) return p;
    this.store.providers.unshift(p.data);
    reconcilePlatformModels(this.store);
    return ok(p.data);
  }

  async update(uid: Uid, input: UpdateProviderInput): Promise<AppResult<Provider>> {
    await delay();
    const idx = this.store.providers.findIndex((c) => c.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `模型渠道 ${uid} 不存在` });
    const cur = this.store.providers[idx]!;

    let nextModels = cur.providerModels;
    let nextMappings = cur.modelMappings;
    if (input.providerModels !== undefined || input.modelMappings !== undefined) {
      const drafts = input.providerModels ?? cur.providerModels;
      const mappingDrafts = input.modelMappings ?? cur.modelMappings;
      const v = validateForm(drafts, mappingDrafts);
      if (!v.success) return v;
      const { models, remap } = commitProviderModels(drafts);
      const { mappings, orphaned } = commitMappings(mappingDrafts, models, remap);
      if (orphaned.length > 0) {
        return fail({
          code: 'validation',
          message: `${orphaned.length} 条上架映射引用了不存在的 ProviderModel`,
        });
      }
      nextModels = models;
      nextMappings = mappings;
    }

    const next: Provider = {
      ...cur,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim() } : {}),
      ...(input.apiKey !== undefined && input.apiKey.trim() !== ''
        ? { apiKeyMasked: maskKey(input.apiKey) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      providerModels: nextModels,
      modelMappings: nextMappings,
      updatedAtUtc: new Date().toISOString(),
    };
    const p = parseProvider(next);
    if (!p.success) return p;
    this.store.providers[idx] = p.data;
    reconcilePlatformModels(this.store);
    return ok(p.data);
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.providers.findIndex((c) => c.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `模型渠道 ${uid} 不存在` });
    this.store.providers.splice(idx, 1);
    reconcilePlatformModels(this.store);
    return ok(undefined);
  }

  async setStatus(uid: Uid, status: ProviderStatus): Promise<AppResult<Provider>> {
    await delay();
    const idx = this.store.providers.findIndex((c) => c.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `模型渠道 ${uid} 不存在` });
    const cur = this.store.providers[idx]!;
    const next: Provider = {
      ...cur,
      status,
      autoDisabledCode:
        status === 'auto_disabled'
          ? cur.autoDisabledCode ?? 'manual_recovery_required'
          : null,
      updatedAtUtc: new Date().toISOString(),
    };
    const p = parseProvider(next);
    if (!p.success) return p;
    this.store.providers[idx] = p.data;
    return ok(p.data);
  }

  async test(uid: Uid): Promise<AppResult<ProviderTestResult>> {
    await delay();
    const idx = this.store.providers.findIndex((c) => c.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `模型渠道 ${uid} 不存在` });
    const cur = this.store.providers[idx]!;
    const ok10 = Math.random() < 0.9;
    const t = new Date().toISOString();
    const latencyMs = 80 + Math.floor(Math.random() * 600);
    const catalog = upstreamCatalog[cur.apiType] ?? [];
    const result: ProviderTestResult = ok10
      ? {
          ok: true,
          latencyMs,
          reachableModelNames: [...catalog],
        }
      : {
          ok: false,
          latencyMs,
          reachableModelNames: [],
          errorCode: 'auth_failed',
          errorMessage: '401 Invalid API Key',
        };
    this.store.providers[idx] = {
      ...cur,
      testLatencyMs: latencyMs,
      testSucceededAtUtc: ok10 ? t : cur.testSucceededAtUtc ?? null,
      updatedAtUtc: t,
    };
    return ok(result);
  }

  async fetchUpstreamModels(input: {
    apiType: ApiType;
    baseUrl: string;
    apiKey?: string;
    providerUid?: Uid;
  }): Promise<AppResult<FetchUpstreamModelsResult>> {
    await delay();
    if (!input.providerUid) {
      if (!input.apiKey || input.apiKey.trim().length < 8) {
        return fail({
          code: 'validation',
          message: '需要 API Key 才能拉取模型列表',
          details: { apiKey: ['至少 8 位'] },
        });
      }
      if (!input.baseUrl.trim()) {
        return fail({ code: 'validation', message: '需要 baseUrl' });
      }
    }
    const catalog = upstreamCatalog[input.apiType] ?? [];
    if (catalog.length === 0) {
      return fail({
        code: 'upstream',
        message: `Mock 暂未为 apiType="${input.apiType}" 配置模型目录`,
      });
    }
    return ok({ upstreamModelNames: [...catalog] });
  }
}
