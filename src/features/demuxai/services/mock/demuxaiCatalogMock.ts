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
  genProviderGroupUid,
  genVendorModelUid,
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
      .sort((a, b) => a.vendorModel.localeCompare(b.vendorModel));
    return ok(items);
  }

  async discoverFromGateway(): Promise<AppResult<DiscoverCatalogResult>> {
    await delay(400);
    const groups: DiscoveredProviderGroup[] = Object.entries(gatewayDiscoveryCatalog)
      .map(([queueGroup, info]) => {
        const importedModelIds = new Set(
          this.store.upstreamModels
            .filter((m) => m.queueGroup === queueGroup)
            .map((m) => m.vendorModel),
        );
        const models: DiscoveredUpstreamModel[] = info.models.map((vendorModel) => ({
          vendorModel,
          alreadyImported: importedModelIds.has(vendorModel),
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
    const vendorSlug = input.vendorSlug?.trim() || null;
    if (vendorSlug && !/^[a-z][a-z0-9_-]{1,62}$/.test(vendorSlug)) {
      return fail({ code: 'validation', message: '对外通道 slug 格式无效' });
    }
    if (vendorSlug) {
      const taken = this.store.providerGroups.some(
        (g) => g.vendorSlug === vendorSlug && g.queueGroup !== queueGroup,
      );
      if (taken) {
        return fail({ code: 'conflict', message: `slug「${vendorSlug}」已被其它组占用` });
      }
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
        id: genProviderGroupUid(),
        queueGroup,
        vendorSlug,
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
      if (vendorSlug !== null) group.vendorSlug = vendorSlug;
      if (input.notes !== undefined) group.notes = input.notes?.trim() || null;
      group.updatedAtUtc = t;
    }

    let importedCount = 0;
    for (const m of input.models) {
      const vendorModel = m.vendorModel.trim();
      if (!vendorModel) continue;
      if (!knownIds.has(vendorModel)) {
        return fail({
          code: 'validation',
          message: `网关未报告模型「${vendorModel}」，请刷新后重试`,
        });
      }
      const dup = this.store.upstreamModels.some(
        (x) => x.queueGroup === queueGroup && x.vendorModel === vendorModel,
      );
      if (dup) continue;
      const row: ProviderUpstreamModel = {
        id: genVendorModelUid(),
        queueGroup,
        vendorModel,
        label: vendorModel,
      };
      const p = parseModel(row);
      if (!p.success) return p;
      this.store.upstreamModels.push(p.data);
      importedCount += 1;
    }
    recomputeGroupModelCounts(this.store.providerGroups, this.store.upstreamModels);

    return ok({ queueGroup, importedModelCount: importedCount, importedAtUtc: t });
  }

  async deleteProviderGroup(id: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.providerGroups.findIndex((g) => g.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: '供应商组不存在' });
    const key = this.store.providerGroups[idx]!.queueGroup;
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
    _queueGroup: string,
    modelId: string,
  ): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.upstreamModels.findIndex((m) => m.id === modelId);
    if (idx < 0) return fail({ code: 'not_found', message: '上游模型不存在' });
    const target = this.store.upstreamModels[idx]!;
    this.store.upstreamModels.splice(idx, 1);
    // Cascade: removing the upstream model removes the aliases pointing at it.
    for (let i = this.store.modelRoutes.length - 1; i >= 0; i -= 1) {
      const r = this.store.modelRoutes[i]!;
      if (r.vendorKey === target.queueGroup && r.vendorModel === target.vendorModel) {
        this.store.modelRoutes.splice(i, 1);
      }
    }
    recomputeGroupModelCounts(this.store.providerGroups, this.store.upstreamModels);
    return ok(undefined);
  }
}
