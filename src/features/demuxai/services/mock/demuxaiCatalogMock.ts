import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  providerGroupSchema,
  providerUpstreamModelSchema,
  type DiscoverCatalogResult,
  type DiscoveredProviderGroup,
  type DiscoveredUpstreamModel,
  type ImportProviderGroupInput,
  type ImportProviderGroupResult,
  type ProviderGroup,
  type ProviderUpstreamModel,
} from '../../model/catalog.types';
import type { DemuxaiCatalogPort } from '../ports/demuxaiCatalogPort';

import {
  gatewayDiscoveryCatalog,
  getDemuxaiStore,
  recomputeGroupModelCounts,
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

  async listUpstreamModels(queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>> {
    await delay();
    const key = normalizeQueueGroup(queueGroup);
    const items = this.store.upstreamModels
      .filter((m) => m.queueGroup === key)
      .sort((a, b) => a.upstreamModelId.localeCompare(b.upstreamModelId));
    return ok(items);
  }

  async discoverFromGateway(): Promise<AppResult<DiscoverCatalogResult>> {
    await delay(400);
    const groups: DiscoveredProviderGroup[] = Object.entries(gatewayDiscoveryCatalog)
      .map(([queueGroup, info]) => {
        const importedModelIds = new Set(
          this.store.upstreamModels
            .filter((m) => m.queueGroup === queueGroup)
            .map((m) => m.upstreamModelId),
        );
        const models: DiscoveredUpstreamModel[] = info.models.map((upstreamModelId) => ({
          upstreamModelId,
          label: upstreamModelId,
          alreadyImported: importedModelIds.has(upstreamModelId),
        }));
        const groupAlreadyImported = this.store.providerGroups.some(
          (g) => g.queueGroup === queueGroup,
        );
        return {
          queueGroup,
          displayName: info.displayName,
          models,
          alreadyImported: groupAlreadyImported,
        };
      })
      .sort((a, b) => a.queueGroup.localeCompare(b.queueGroup));
    return ok({ groups, discoveredAtUtc: Date.now() });
  }

  async importProviderGroup(
    input: ImportProviderGroupInput,
  ): Promise<AppResult<ImportProviderGroupResult>> {
    await delay(300);
    const queueGroup = normalizeQueueGroup(input.queueGroup);
    if (!/^[a-z][a-z0-9_-]{1,62}$/.test(queueGroup)) {
      return fail({
        code: 'validation',
        message: 'QueueGroup 须小写字母开头，仅含 a-z、0-9、_、-',
      });
    }
    const displayName = input.displayName.trim();
    if (!displayName) {
      return fail({ code: 'validation', message: '请填写展示名' });
    }
    const info = gatewayDiscoveryCatalog[queueGroup];
    if (!info) {
      return fail({
        code: 'validation',
        message: `网关未报告 QueueGroup「${queueGroup}」，请先「重新拉取」`,
      });
    }
    const knownIds = new Set(info.models);
    const t = Date.now();

    let group = this.store.providerGroups.find((g) => g.queueGroup === queueGroup);
    if (!group) {
      const row: ProviderGroup = {
        queueGroup,
        displayName,
        status: 'active',
        upstreamModelCount: 0,
        notes: input.notes?.trim() || null,
        importedAtUtc: t,
        updatedAtUtc: t,
      };
      const p = parseGroup(row);
      if (!p.success) return p;
      group = p.data;
      this.store.providerGroups.push(group);
    } else {
      group.displayName = displayName;
      if (input.notes !== undefined) group.notes = input.notes?.trim() || null;
      group.updatedAtUtc = t;
    }

    let importedCount = 0;
    for (const m of input.models) {
      const upstreamModelId = m.upstreamModelId.trim();
      if (!upstreamModelId) continue;
      if (!knownIds.has(upstreamModelId)) {
        return fail({
          code: 'validation',
          message: `网关未报告模型「${upstreamModelId}」，请刷新后重试`,
        });
      }
      const dup = this.store.upstreamModels.some(
        (x) => x.queueGroup === queueGroup && x.upstreamModelId === upstreamModelId,
      );
      if (dup) continue;
      const row: ProviderUpstreamModel = {
        queueGroup,
        upstreamModelId,
        label: m.label?.trim() || upstreamModelId,
      };
      const p = parseModel(row);
      if (!p.success) return p;
      this.store.upstreamModels.push(p.data);
      importedCount += 1;
    }
    recomputeGroupModelCounts(this.store.providerGroups, this.store.upstreamModels);

    return ok({ queueGroup, importedModelCount: importedCount, importedAtUtc: t });
  }

  async deleteProviderGroup(queueGroup: string): Promise<AppResult<void>> {
    await delay();
    const key = normalizeQueueGroup(queueGroup);
    const idx = this.store.providerGroups.findIndex((g) => g.queueGroup === key);
    if (idx < 0) return fail({ code: 'not_found', message: '供应商组不存在' });
    this.store.providerGroups.splice(idx, 1);
    for (let i = this.store.upstreamModels.length - 1; i >= 0; i -= 1) {
      if (this.store.upstreamModels[i]!.queueGroup === key) {
        this.store.upstreamModels.splice(i, 1);
      }
    }
    // Cascade: removing the group removes all of its outbound aliases too.
    for (let i = this.store.modelRoutes.length - 1; i >= 0; i -= 1) {
      if (this.store.modelRoutes[i]!.vendorKey === key) {
        this.store.modelRoutes.splice(i, 1);
      }
    }
    return ok(undefined);
  }

  async deleteUpstreamModel(
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
    this.store.upstreamModels.splice(idx, 1);
    // Cascade: removing the upstream model removes the aliases pointing at it.
    for (let i = this.store.modelRoutes.length - 1; i >= 0; i -= 1) {
      const r = this.store.modelRoutes[i]!;
      if (r.vendorKey === key && r.vendorModel === id) {
        this.store.modelRoutes.splice(i, 1);
      }
    }
    recomputeGroupModelCounts(this.store.providerGroups, this.store.upstreamModels);
    return ok(undefined);
  }
}
