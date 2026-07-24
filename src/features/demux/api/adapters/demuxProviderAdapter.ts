import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { requestDemux, type ItemsEnvelope } from '@/features/demux/api/http';
import { demuxPlatformPaths } from '@/features/demux/api/routes';
import type { Uid } from '@/shared/lib/id';
import { asEpochMillis } from '@/shared/lib/epoch';

import type { ApiType, ProviderStatus } from '@demux/common';
import type {
  CreateProviderInput,
  FetchUpstreamModelsResult,
  ListProvidersFilter,
  Provider,
  ProviderTestResult,
  UpdateProviderInput,
} from '@demux/common';
import type {
  DemuxProviderPort,
  ListProvidersPage,
} from '@/features/demux/services/ports/demuxProviderPort';

const BASE = demuxPlatformPaths.adminProviders;

/** Demux VendorWireDto（camelCase JSON）。 */
interface VendorDtoRaw {
  id: number | string;
  uid?: number | string;
  queueGroup?: string;
  name?: string;
  vendorSlug?: string | null;
  status?: string | number;
  createdTime?: number | string;
  updatedTime?: number | string;
}

interface UpsertVendorBody {
  name: string;
  status?: string;
}

function mapVendorStatus(raw: VendorDtoRaw['status']): ProviderStatus {
  if (raw === 2 || raw === 'disabled' || raw === 'Disabled') return 'disabled';
  return 'enabled';
}

function wireEpochToMillis(value: unknown): number | undefined {
  const ms = asEpochMillis(value);
  if (ms === undefined) return undefined;
  return ms > 0 && ms < 1_000_000_000_000 ? ms * 1000 : ms;
}

function vendorToProvider(raw: VendorDtoRaw, draft?: Partial<CreateProviderInput>): Provider {
  const uid = String(raw.id ?? raw.uid);
  const numericUid = typeof raw.id === 'number' ? raw.id : Number.parseInt(uid, 10);
  const now = Date.now();
  return {
    id: Number.isFinite(numericUid) ? (numericUid % 2_147_483_647) || 1 : 1,
    uid,
    name: raw.queueGroup ?? raw.name ?? '',
    apiType: draft?.apiType ?? 'openai',
    baseUrl: draft?.baseUrl ?? '',
    apiKeyMasked: '***',
    notes: draft?.notes ?? null,
    status: mapVendorStatus(raw.status),
    autoDisabledCode: null,
    testLatencyMs: null,
    testSucceededAtUtc: null,
    providerModels: (draft?.providerModels ?? []) as Provider['providerModels'],
    modelMappings: (draft?.modelMappings ?? []) as Provider['modelMappings'],
    createdAtUtc: wireEpochToMillis(raw.createdTime) ?? now,
    updatedAtUtc: wireEpochToMillis(raw.updatedTime ?? raw.createdTime) ?? now,
  };
}

function upsertBody(input: { name: string }, status: string = 'active'): UpsertVendorBody {
  return { name: input.name.trim(), status };
}

function vendorWireName(raw: VendorDtoRaw): string {
  return raw.queueGroup ?? raw.name ?? '';
}

export class DemuxProviderHttpAdapter implements DemuxProviderPort {
  async list(_input: {
    page: number;
    pageSize: number;
    filter: ListProvidersFilter;
  }): Promise<AppResult<ListProvidersPage>> {
    const result = await requestDemux<ItemsEnvelope<VendorDtoRaw>>(BASE);
    if (!result.success) return result;
    const items = result.data.items.map((row) => vendorToProvider(row));
    return { success: true, data: { items, total: result.data.total } };
  }

  async get(uid: Uid): Promise<AppResult<Provider>> {
    const result = await requestDemux<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data) };
  }

  async create(input: CreateProviderInput): Promise<AppResult<Provider>> {
    const result = await requestDemux<VendorDtoRaw>(BASE, {
      method: 'POST',
      body: upsertBody({ name: input.name }),
    });
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data, input) };
  }

  async update(uid: Uid, input: UpdateProviderInput): Promise<AppResult<Provider>> {
    const existing = await requestDemux<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!existing.success) return existing;

    const result = await requestDemux<VendorDtoRaw>(`${BASE}/${uid}`, {
      method: 'PUT',
      body: upsertBody({ name: input.name?.trim() ?? vendorWireName(existing.data) }),
    });
    if (!result.success) return result;
    return {
      success: true,
      data: vendorToProvider(result.data, {
        name: input.name ?? vendorWireName(existing.data),
        apiType: 'openai',
        baseUrl: input.baseUrl ?? '',
        notes: input.notes,
        apiKey: '',
        providerModels: input.providerModels ?? [],
        modelMappings: input.modelMappings ?? [],
      }),
    };
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    return requestDemux<void>(`${BASE}/${uid}`, { method: 'DELETE' });
  }

  async setStatus(uid: Uid, status: ProviderStatus): Promise<AppResult<Provider>> {
    const existing = await requestDemux<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!existing.success) return existing;
    const wireStatus = status === 'enabled' ? 'active' : 'disabled';
    const result = await requestDemux<VendorDtoRaw>(`${BASE}/${uid}`, {
      method: 'PUT',
      body: upsertBody({ name: vendorWireName(existing.data) }, wireStatus),
    });
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data) };
  }

  async test(uid: Uid): Promise<AppResult<ProviderTestResult>> {
    return requestDemux<ProviderTestResult>(`${BASE}/${uid}/test`, { method: 'POST' });
  }

  async fetchUpstreamModels(input: {
    apiType: ApiType;
    baseUrl: string;
    apiKey?: string;
    providerUid?: Uid;
  }): Promise<AppResult<FetchUpstreamModelsResult>> {
    const result = await requestDemux<FetchUpstreamModelsResult>(`${BASE}/upstream/models`, {
      method: 'POST',
      body: input,
    });
    if (!result.success) {
      const msg = result.error.message.toLowerCase();
      if (msg.includes('not implemented') || msg.includes('scaffolded')) {
        return fail({
          code: 'upstream',
          message:
            '上游模型拉取接口尚未实现。请改用「供应商目录 → 从网关发现」导入模型，或在 Mock 模式下调试。',
        });
      }
    }
    return result;
  }
}
