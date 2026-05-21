import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  providerGroupSchema,
  providerUpstreamModelSchema,
  type CreateProviderGroupInput,
  type CreateUpstreamModelInput,
  type ProviderGroup,
  type ProviderUpstreamModel,
  type SyncProviderCatalogResult,
} from '../../model/catalog.types';
import type { DemuxaiCatalogPort } from '../ports/demuxaiCatalogPort';

import {
  getDemuxaiStore,
  seedProviderGroupsFromGateway,
  seedUpstreamModelsFromGateway,
} from './data';

function parseGroup(v: unknown): AppResult<ProviderGroup> {
  const r = providerGroupSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '供应商组格式错误' });
}

function parseModel(v: unknown): AppResult<ProviderUpstreamModel> {
  const r = providerUpstreamModelSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '上游模型格式错误' });
}

function normalizeQueueGroup(raw: string): string {
  return raw.trim().toLowerCase();
}

function recomputeCounts(store: ReturnType<typeof getDemuxaiStore>): void {
  for (const g of store.providerGroups) {
    g.upstreamModelCount = store.upstreamModels.filter(
      (m) => m.queueGroup === g.queueGroup,
    ).length;
  }
}

export class DemuxaiCatalogMock implements DemuxaiCatalogPort {
  private get store() {
    return getDemuxaiStore();
  }

  async listProviderGroups(): Promise<AppResult<ProviderGroup[]>> {
    await delay();
    const parsed: ProviderGroup[] = [];
    for (const row of this.store.providerGroups) {
      const r = parseGroup(row);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok(parsed.sort((a, b) => a.queueGroup.localeCompare(b.queueGroup)));
  }

  async syncFromGateway(): Promise<AppResult<SyncProviderCatalogResult>> {
    await delay(400);
    const syncedAtUtc = new Date().toISOString();
    const gatewayGroups = seedProviderGroupsFromGateway().map((g) => ({
      ...g,
      syncedAtUtc,
      updatedAtUtc: syncedAtUtc,
    }));
    const gatewayModels = seedUpstreamModelsFromGateway(gatewayGroups);

    const manualGroups = this.store.providerGroups.filter((g) => g.source === 'manual');
    const manualModels = this.store.upstreamModels.filter((m) => m.source === 'manual');

    this.store.providerGroups.length = 0;
    this.store.providerGroups.push(...gatewayGroups, ...manualGroups);

    this.store.upstreamModels.length = 0;
    this.store.upstreamModels.push(...gatewayModels, ...manualModels);

    recomputeCounts(this.store);

    return ok({
      providerCount: gatewayGroups.length,
      modelCount: gatewayModels.length,
      syncedAtUtc,
    });
  }

  async listUpstreamModels(queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>> {
    await delay();
    const key = normalizeQueueGroup(queueGroup);
    const items = this.store.upstreamModels
      .filter((m) => m.queueGroup === key)
      .sort((a, b) => a.upstreamModelId.localeCompare(b.upstreamModelId));
    return ok(items);
  }

  async createProviderGroup(
    input: CreateProviderGroupInput,
  ): Promise<AppResult<ProviderGroup>> {
    await delay();
    const queueGroup = normalizeQueueGroup(input.queueGroup);
    if (!/^[a-z][a-z0-9_-]{1,62}$/.test(queueGroup)) {
      return fail({
        code: 'validation',
        message: 'QueueGroup 须小写字母开头，仅含 a-z、0-9、_、-',
      });
    }
    if (this.store.providerGroups.some((g) => g.queueGroup === queueGroup)) {
      return fail({ code: 'conflict', message: `供应商组 ${queueGroup} 已存在` });
    }
    const t = new Date().toISOString();
    const row: ProviderGroup = {
      queueGroup,
      displayName: input.displayName.trim(),
      source: 'manual',
      status: 'active',
      instanceCount: 0,
      upstreamModelCount: 0,
      notes: input.notes?.trim() || null,
      syncedAtUtc: t,
      createdAtUtc: t,
      updatedAtUtc: t,
    };
    const p = parseGroup(row);
    if (!p.success) return p;
    this.store.providerGroups.push(p.data);
    return ok(p.data);
  }

  async addUpstreamModel(
    input: CreateUpstreamModelInput,
  ): Promise<AppResult<ProviderUpstreamModel>> {
    await delay();
    const queueGroup = normalizeQueueGroup(input.queueGroup);
    const upstreamModelId = input.upstreamModelId.trim();
    if (!upstreamModelId) {
      return fail({ code: 'validation', message: '请填写上游模型 ID' });
    }
    if (!this.store.providerGroups.some((g) => g.queueGroup === queueGroup)) {
      return fail({ code: 'not_found', message: `供应商组 ${queueGroup} 不存在` });
    }
    if (
      this.store.upstreamModels.some(
        (m) => m.queueGroup === queueGroup && m.upstreamModelId === upstreamModelId,
      )
    ) {
      return fail({ code: 'conflict', message: '该上游模型已存在' });
    }
    const row: ProviderUpstreamModel = {
      queueGroup,
      upstreamModelId,
      label: input.label?.trim() || upstreamModelId,
      source: 'manual',
    };
    const p = parseModel(row);
    if (!p.success) return p;
    this.store.upstreamModels.push(p.data);
    recomputeCounts(this.store);
    return ok(p.data);
  }

  async removeUpstreamModel(
    queueGroup: string,
    upstreamModelId: string,
  ): Promise<AppResult<void>> {
    await delay();
    const key = normalizeQueueGroup(queueGroup);
    const id = upstreamModelId.trim();
    const idx = this.store.upstreamModels.findIndex(
      (m) => m.queueGroup === key && m.upstreamModelId === id,
    );
    if (idx < 0) return fail({ code: 'not_found', message: '上游模型不存在' });
    if (this.store.upstreamModels[idx]!.source === 'gateway') {
      return fail({
        code: 'validation',
        message: '网关注册模型请通过「从网关同步」更新，不可单独删除',
      });
    }
    this.store.upstreamModels.splice(idx, 1);
    recomputeCounts(this.store);
    return ok(undefined);
  }
}
