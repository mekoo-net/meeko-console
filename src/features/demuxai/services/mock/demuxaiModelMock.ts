import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import type { Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  modelSchema,
  type ListModelsFilter,
  type Model,
  type ModelCarriersMap,
  type ModelCarrierEntry,
  type UpdateModelInput,
} from '../../model/model.types';
import type { DemuxaiModelPort, ListModelsPage } from '../ports/demuxaiModelPort';

import { getDemuxaiStore } from './data';

function parseModel(v: unknown): AppResult<Model> {
  const r = modelSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'Model 格式错误' });
}

function applyFilter(rows: Model[], f: ListModelsFilter): Model[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((m) => {
    if (
      kw &&
      !m.modelId.toLowerCase().includes(kw) &&
      !m.displayName.toLowerCase().includes(kw)
    ) {
      return false;
    }
    if (f.family !== 'all' && m.family !== f.family) return false;
    if (f.capability !== 'all' && !m.capabilities.includes(f.capability)) return false;
    return true;
  });
}

export class DemuxaiModelMock implements DemuxaiModelPort {
  private get store() {
    return getDemuxaiStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelsFilter;
  }): Promise<AppResult<ListModelsPage>> {
    await delay();
    const sorted = [...this.store.models].sort((a, b) => a.family.localeCompare(b.family));
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: Model[] = [];
    for (const it of slice) {
      const r = parseModel(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async get(uid: Uid): Promise<AppResult<Model>> {
    await delay();
    const row = this.store.models.find((m) => m.uid === uid);
    if (!row) return fail({ code: 'not_found', message: `模型 ${uid} 不存在` });
    return parseModel(row);
  }

  async update(uid: Uid, input: UpdateModelInput): Promise<AppResult<Model>> {
    await delay();
    const idx = this.store.models.findIndex((m) => m.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `模型 ${uid} 不存在` });
    const cur = this.store.models[idx]!;
    const next: Model = {
      ...cur,
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.family !== undefined ? { family: input.family } : {}),
      ...(input.capabilities !== undefined ? { capabilities: [...input.capabilities] } : {}),
      ...(input.visibleMinTier !== undefined ? { visibleMinTier: input.visibleMinTier } : {}),
      ...(input.maxContextTokens !== undefined ? { maxContextTokens: input.maxContextTokens } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.supportsStreaming !== undefined
        ? { supportsStreaming: input.supportsStreaming }
        : {}),
      ...(input.supportsFunctionCall !== undefined
        ? { supportsFunctionCall: input.supportsFunctionCall }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAtUtc: Date.now(),
    };
    const p = parseModel(next);
    if (!p.success) return p;
    this.store.models[idx] = p.data;
    return ok(p.data);
  }

  async carriers(modelIds: string[]): Promise<AppResult<ModelCarriersMap>> {
    await delay();
    if (modelIds.length === 0) return ok({});
    const idSet = new Set(modelIds);
    const map: ModelCarriersMap = {};
    for (const p of this.store.providers) {
      const pmIndex = new Map(p.providerModels.map((x) => [x.uid, x]));
      for (const mp of p.modelMappings) {
        if (!idSet.has(mp.displayName)) continue;
        const pmRef = pmIndex.get(mp.providerModelUid);
        if (!pmRef) continue;
        const entry: ModelCarrierEntry = {
          providerUid: p.uid,
          providerName: p.name,
          modelName: pmRef.modelName,
          mappingWeight: mp.mappingWeight ?? 100,
          enabled: mp.enabled,
        };
        const list = map[mp.displayName] ?? [];
        list.push(entry);
        map[mp.displayName] = list;
      }
    }
    return ok(map);
  }
}
