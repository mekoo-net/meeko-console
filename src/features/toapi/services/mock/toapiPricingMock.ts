import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  emptyRateDocument,
  type ModelRate,
  type PublishModelRateInput,
  type SupplyGroup,
  type UpsertSupplyGroupInput,
} from '../../model/pricing.types';
import type {
  DiscoveredVendor,
  DiscoverVendorsResult,
  ImportVendorInput,
  ImportVendorResult,
  VendorModel,
} from '../../model/vendor.types';
import type { ToApiPricingPort } from '../ports/toapiPricingPort';

const now = Date.now();

/** 模拟运行时侧 Consul KV 里网关发布的 provider catalog：vendor_key → 声明能服务的模型。 */
const gatewayCatalog: Readonly<Record<string, { displayName: string; models: readonly string[] }>> = {
  cursor: {
    displayName: 'Cursor',
    models: ['claude-sonnet-4', 'claude-opus-4', 'gpt-5', 'gpt-image-1', 'sora-2', 'cursor-small'],
  },
  kiro: {
    displayName: 'Kiro',
    models: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5', 'claude-opus-4-7-preview'],
  },
  antigravity: {
    displayName: 'Antigravity',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp'],
  },
  'claude-code': {
    displayName: 'Claude Code',
    models: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5'],
  },
  codex: {
    displayName: 'Codex',
    models: ['gpt-5', 'gpt-5-codex', 'o3', 'o4-mini'],
  },
  gemini: {
    displayName: 'Gemini CLI',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  windsurf: {
    displayName: 'Windsurf',
    models: ['swe-1', 'claude-sonnet-4', 'gpt-5'],
  },
  trae: {
    displayName: 'Trae',
    models: ['claude-sonnet-4', 'gpt-5', 'deepseek-v3'],
  },
};

const groups: SupplyGroup[] = [
  { id: '1', key: 'kiro', name: 'Kiro', status: 'live', sortOrder: 10, notes: null, createdAtUtc: now - 86_400_000 * 20, updatedAtUtc: now - 86_400_000 * 2 },
  { id: '2', key: 'cursor', name: 'Cursor', status: 'beta', sortOrder: 20, notes: '灰度中', createdAtUtc: now - 86_400_000 * 9, updatedAtUtc: now - 86_400_000 },
  { id: '3', key: 'openai-direct', name: 'OpenAI 直连', status: 'soon', sortOrder: 30, notes: '目录外的供应商', createdAtUtc: now - 86_400_000 * 3, updatedAtUtc: now - 86_400_000 * 3 },
];

let nextModelId = 1000;
const vendorModels: VendorModel[] = [
  { id: String(nextModelId++), vendorKey: 'kiro', vendorModel: 'claude-sonnet-4' },
  { id: String(nextModelId++), vendorKey: 'kiro', vendorModel: 'claude-opus-4' },
  { id: String(nextModelId++), vendorKey: 'cursor', vendorModel: 'gpt-5' },
  { id: String(nextModelId++), vendorKey: 'cursor', vendorModel: 'gpt-image-1' },
  { id: String(nextModelId++), vendorKey: 'cursor', vendorModel: 'sora-2' },
];

let nextRateId = 100;

function rate(groupKey: string, modelId: string, displayName: string, family: string, doc: Partial<ModelRate['rate']>, billingType: ModelRate['billingType'] = 'per_token'): ModelRate {
  return {
    id: String(nextRateId++),
    groupKey,
    modelId,
    billingType,
    rate: { ...emptyRateDocument(), ...doc },
    meta: { displayName, family, tags: [] },
    currency: 'CNY',
    status: 'active',
    effectiveFromUtc: now - 86_400_000 * 5,
    supersededAtUtc: null,
  };
}

const rates: ModelRate[] = [
  rate('kiro', 'claude-sonnet-4', 'Claude Sonnet 4', 'claude', {
    input: { perMToken: 21, cachedRead: 2.1, cachedWrite: 26, reasoning: null },
    output: { perMToken: 105, cachedRead: null, cachedWrite: null, reasoning: null },
  }),
  rate('kiro', 'claude-opus-4', 'Claude Opus 4', 'claude', {
    input: { perMToken: 105, cachedRead: 10.5, cachedWrite: 131, reasoning: null },
    output: { perMToken: 525, cachedRead: null, cachedWrite: null, reasoning: 525 },
  }),
  rate('cursor', 'gpt-5', 'GPT-5', 'gpt', {
    input: { perMToken: 9, cachedRead: 0.9, cachedWrite: null, reasoning: null },
    output: { perMToken: 70, cachedRead: null, cachedWrite: null, reasoning: 70 },
  }),
  rate('cursor', 'gpt-image-1', 'GPT Image 1', 'gpt', {
    image: { pricePerImage: 0.3, tiers: [{ key: '1024x1024/high', price: 1.2 }, { key: '1024x1024/low', price: 0.1 }] },
  }, 'per_image'),
  rate('cursor', 'sora-2', 'Sora 2', 'sora', {
    video: { pricePerSecond: 0.7, tiers: [{ key: '1080p', price: 1.4 }] },
  }, 'per_video'),
];

export class ToApiPricingMock implements ToApiPricingPort {
  async listGroups(): Promise<AppResult<SupplyGroup[]>> {
    await delay(120);
    return ok([...groups].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async upsertGroup(input: UpsertSupplyGroupInput): Promise<AppResult<SupplyGroup>> {
    await delay(150);
    const key = input.key.trim().toLowerCase();
    if (!/^[a-z0-9._-]{1,64}$/.test(key)) return fail({ code: 'validation', message: 'key 只能包含 a-z0-9-_.' });
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      Object.assign(existing, { name: input.name.trim(), status: input.status, sortOrder: input.sortOrder, notes: input.notes ?? null, updatedAtUtc: Date.now() });
      return ok({ ...existing });
    }
    const created: SupplyGroup = {
      id: String(groups.length + 1),
      key,
      name: input.name.trim(),
      status: input.status,
      sortOrder: input.sortOrder,
      notes: input.notes ?? null,
      createdAtUtc: Date.now(),
      updatedAtUtc: Date.now(),
    };
    groups.push(created);
    return ok({ ...created });
  }

  async disableGroup(key: string): Promise<AppResult<void>> {
    await delay(100);
    const g = groups.find((x) => x.key === key);
    if (!g) return fail({ code: 'not_found', message: '分组不存在' });
    g.status = 'disabled';
    g.updatedAtUtc = Date.now();
    return ok(undefined);
  }

  async discoverVendors(): Promise<AppResult<DiscoverVendorsResult>> {
    await delay(400);
    const vendors: DiscoveredVendor[] = Object.entries(gatewayCatalog)
      .map(([vendorKey, info]) => {
        const imported = new Set(vendorModels.filter((m) => m.vendorKey === vendorKey).map((m) => m.vendorModel));
        return {
          vendorKey,
          displayName: info.displayName,
          alreadyImported: groups.some((g) => g.key === vendorKey),
          models: info.models.map((vendorModel) => ({ vendorModel, alreadyImported: imported.has(vendorModel) })),
        };
      })
      .sort((a, b) => a.vendorKey.localeCompare(b.vendorKey));
    return ok({ vendors, discoveredAtUtc: Date.now() });
  }

  async listVendorModels(vendorKey?: string): Promise<AppResult<VendorModel[]>> {
    await delay(100);
    return ok(
      vendorModels
        .filter((m) => !vendorKey || m.vendorKey === vendorKey)
        .map((m) => ({ ...m }))
        .sort((a, b) => a.vendorModel.localeCompare(b.vendorModel)),
    );
  }

  async importVendor(input: ImportVendorInput): Promise<AppResult<ImportVendorResult>> {
    await delay(200);
    const key = input.vendorKey.trim().toLowerCase();
    const catalog = gatewayCatalog[key];
    if (!catalog) return fail({ code: 'not_found', message: `网关没有供应商 '${key}'` });
    const unknown = input.models.filter((m) => !catalog.models.includes(m));
    if (unknown.length > 0) {
      return fail({ code: 'validation', message: `网关未报告模型：${unknown.join(', ')}` });
    }
    if (!groups.some((g) => g.key === key)) {
      groups.push({
        id: String(groups.length + 1),
        key,
        name: input.name?.trim() || catalog.displayName,
        status: 'live',
        sortOrder: groups.length * 10,
        notes: null,
        createdAtUtc: Date.now(),
        updatedAtUtc: Date.now(),
      });
    }
    let count = 0;
    for (const vendorModel of input.models) {
      if (vendorModels.some((m) => m.vendorKey === key && m.vendorModel === vendorModel)) continue;
      vendorModels.push({ id: String(nextModelId++), vendorKey: key, vendorModel });
      count += 1;
    }
    return ok({ vendorKey: key, importedModelCount: count });
  }

  async removeVendorModel(vendorKey: string, modelId: string): Promise<AppResult<void>> {
    await delay(100);
    const idx = vendorModels.findIndex((m) => m.vendorKey === vendorKey && m.id === modelId);
    if (idx < 0) return fail({ code: 'not_found', message: '模型不存在' });
    vendorModels.splice(idx, 1);
    return ok(undefined);
  }

  async listRates(input: { groupKey?: string; history: boolean }): Promise<AppResult<ModelRate[]>> {
    await delay(120);
    return ok(
      rates
        .filter((r) => (input.groupKey ? r.groupKey === input.groupKey : true))
        .filter((r) => input.history || r.status === 'active')
        .map((r) => ({ ...r })),
    );
  }

  async publishRate(input: PublishModelRateInput): Promise<AppResult<ModelRate>> {
    await delay(160);
    if (!groups.some((g) => g.key === input.groupKey)) return fail({ code: 'not_found', message: `分组 '${input.groupKey}' 不存在` });
    for (const r of rates) {
      if (r.groupKey === input.groupKey && r.modelId === input.modelId && r.status === 'active') {
        r.status = 'superseded';
        r.supersededAtUtc = Date.now();
      }
    }
    const created: ModelRate = {
      id: String(nextRateId++),
      groupKey: input.groupKey,
      modelId: input.modelId.trim(),
      billingType: input.billingType,
      rate: input.rate,
      meta: { ...input.meta, displayName: input.meta.displayName || input.modelId.trim() },
      currency: 'CNY',
      status: 'active',
      effectiveFromUtc: input.effectiveFromUtc ?? Date.now(),
      supersededAtUtc: null,
    };
    rates.push(created);
    return ok({ ...created });
  }

  async retireRate(groupKey: string, modelId: string): Promise<AppResult<void>> {
    await delay(100);
    let hit = false;
    for (const r of rates) {
      if (r.groupKey === groupKey && r.modelId === modelId && r.status === 'active') {
        r.status = 'superseded';
        r.supersededAtUtc = Date.now();
        hit = true;
      }
    }
    return hit ? ok(undefined) : fail({ code: 'not_found', message: '没有生效中的定价行' });
  }
}
