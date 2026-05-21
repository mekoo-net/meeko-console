import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import type { Uid } from '@/shared/lib/id';

import type { ApiType, ProviderStatus } from '@/features/demuxai/model/enums';
import type {
  CreateProviderInput,
  FetchUpstreamModelsResult,
  ListProvidersFilter,
  Provider,
  ProviderTestResult,
  UpdateProviderInput,
} from '@/features/demuxai/model/provider.types';
import type {
  DemuxaiProviderPort,
  ListProvidersPage,
} from '@/features/demuxai/services/ports/demuxaiProviderPort';

const BASE = '/demuxai/api/admin/providers';

/** DemuxAi Vendor 契约：name + status（snake_case JSON）。 */
interface VendorDtoRaw {
  uid: number | string;
  name: string;
  status?: string | number;
  created_at_utc?: string;
  updated_at_utc?: string;
}

interface UpsertVendorBody {
  name: string;
  status?: string;
}

function mapVendorStatus(raw: VendorDtoRaw['status']): ProviderStatus {
  if (raw === 2 || raw === 'disabled' || raw === 'Disabled') return 'disabled';
  return 'enabled';
}

function vendorToProvider(raw: VendorDtoRaw, draft?: Partial<CreateProviderInput>): Provider {
  const uid = String(raw.uid);
  const numericUid = typeof raw.uid === 'number' ? raw.uid : Number.parseInt(uid, 10);
  const now = raw.updated_at_utc ?? raw.created_at_utc ?? new Date().toISOString();
  return {
    id: Number.isFinite(numericUid) ? (numericUid % 2_147_483_647) || 1 : 1,
    uid,
    name: raw.name,
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
    createdAtUtc: raw.created_at_utc ?? now,
    updatedAtUtc: raw.updated_at_utc ?? now,
  };
}

function upsertBody(input: { name: string }, status: string = 'active'): UpsertVendorBody {
  return { name: input.name.trim(), status };
}

export class DemuxaiProviderHttpAdapter implements DemuxaiProviderPort {
  async list(_input: {
    page: number;
    pageSize: number;
    filter: ListProvidersFilter;
  }): Promise<AppResult<ListProvidersPage>> {
    const result = await requestDemuxAi<ItemsEnvelope<VendorDtoRaw>>(BASE);
    if (!result.success) return result;
    const items = result.data.items.map((row) => vendorToProvider(row));
    return { success: true, data: { items, total: result.data.total } };
  }

  async get(uid: Uid): Promise<AppResult<Provider>> {
    const result = await requestDemuxAi<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data) };
  }

  async create(input: CreateProviderInput): Promise<AppResult<Provider>> {
    const result = await requestDemuxAi<VendorDtoRaw>(BASE, {
      method: 'POST',
      body: upsertBody({ name: input.name }),
    });
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data, input) };
  }

  async update(uid: Uid, input: UpdateProviderInput): Promise<AppResult<Provider>> {
    const existing = await requestDemuxAi<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!existing.success) return existing;

    const result = await requestDemuxAi<VendorDtoRaw>(`${BASE}/${uid}`, {
      method: 'PUT',
      body: upsertBody({ name: input.name?.trim() ?? existing.data.name }),
    });
    if (!result.success) return result;
    return {
      success: true,
      data: vendorToProvider(result.data, {
        name: input.name ?? existing.data.name,
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
    return requestDemuxAi<void>(`${BASE}/${uid}`, { method: 'DELETE' });
  }

  async setStatus(uid: Uid, status: ProviderStatus): Promise<AppResult<Provider>> {
    const existing = await requestDemuxAi<VendorDtoRaw>(`${BASE}/${uid}`);
    if (!existing.success) return existing;
    const wireStatus = status === 'enabled' ? 'active' : 'disabled';
    const result = await requestDemuxAi<VendorDtoRaw>(`${BASE}/${uid}`, {
      method: 'PUT',
      body: upsertBody({ name: existing.data.name }, wireStatus),
    });
    if (!result.success) return result;
    return { success: true, data: vendorToProvider(result.data) };
  }

  async test(uid: Uid): Promise<AppResult<ProviderTestResult>> {
    return requestDemuxAi<ProviderTestResult>(`${BASE}/${uid}/test`, { method: 'POST' });
  }

  async fetchUpstreamModels(input: {
    apiType: ApiType;
    baseUrl: string;
    apiKey?: string;
    providerUid?: Uid;
  }): Promise<AppResult<FetchUpstreamModelsResult>> {
    return requestDemuxAi<FetchUpstreamModelsResult>(`${BASE}/upstream-models`, {
      method: 'POST',
      body: input,
    });
  }
}
