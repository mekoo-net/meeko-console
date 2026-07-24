import type {
  BillingProduct,
  DiscoveredProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '@/features/platform/products/model/product.types';
import type { ProductPort } from '@/features/platform/products/services/ports/productPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/api/admin/billing/products';

function mapProduct(raw: Record<string, unknown>): BillingProduct {
  return {
    code: String(raw.code ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    metadataJson:
      typeof raw.metadataJson === 'string'
        ? raw.metadataJson
        : typeof raw.metadata_json === 'string'
          ? raw.metadata_json
          : null,
    active: Boolean(raw.active ?? true),
    createdAtUtc: asEpochMillis(raw.createdAtUtc ?? raw.created_at_utc) ?? Date.now(),
    updatedAtUtc: asEpochMillis(raw.updatedAtUtc ?? raw.updated_at_utc) ?? Date.now(),
  };
}

function mapDiscovered(raw: Record<string, unknown>): DiscoveredProduct {
  return {
    code: String(raw.code ?? ''),
    suggestedDisplayName: String(
      raw.suggestedDisplayName ?? raw.suggested_display_name ?? raw.displayName ?? '',
    ),
    alreadyRegistered: Boolean(raw.alreadyRegistered ?? raw.already_registered ?? false),
    serviceName: String(raw.serviceName ?? raw.service_name ?? ''),
  };
}

function parseOne(value: unknown): AppResult<BillingProduct> {
  if (!value || typeof value !== 'object') {
    return fail({ code: 'validation', message: '产品数据格式错误' });
  }
  const item = mapProduct(value as Record<string, unknown>);
  if (!item.code) return fail({ code: 'validation', message: '产品代码缺失' });
  return ok(item);
}

function parseList(value: unknown): AppResult<BillingProduct[]> {
  const rows = Array.isArray(value) ? value : [];
  return ok(rows.map((row) => mapProduct((row ?? {}) as Record<string, unknown>)));
}

function parseDiscoveredList(value: unknown): AppResult<DiscoveredProduct[]> {
  const rows = Array.isArray(value) ? value : [];
  return ok(rows.map((row) => mapDiscovered((row ?? {}) as Record<string, unknown>)));
}

export class ProductHttpAdapter implements ProductPort {
  async discover(): Promise<AppResult<DiscoveredProduct[]>> {
    const res = await request<unknown>(`${BASE}/discovery`);
    if (!res.success) return res;
    return parseDiscoveredList(res.data);
  }

  async list(includeInactive = false): Promise<AppResult<BillingProduct[]>> {
    const qs = includeInactive ? '?includeInactive=true' : '';
    const res = await request<unknown>(`${BASE}${qs}`);
    if (!res.success) return res;
    return parseList(res.data);
  }

  async get(code: string): Promise<AppResult<BillingProduct>> {
    const res = await request<unknown>(`${BASE}/${encodeURIComponent(code)}`);
    if (!res.success) return res;
    return parseOne(res.data);
  }

  async register(input: RegisterProductInput): Promise<AppResult<BillingProduct>> {
    const res = await request<unknown>(`${BASE}/register`, { method: 'POST', body: input });
    if (!res.success) return res;
    return parseOne(res.data);
  }

  async update(code: string, input: UpdateProductInput): Promise<AppResult<BillingProduct>> {
    const res = await request<unknown>(`${BASE}/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: input,
    });
    if (!res.success) return res;
    return parseOne(res.data);
  }

  async unregister(code: string): Promise<AppResult<boolean>> {
    const res = await request<boolean>(`${BASE}/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (!res.success) return res;
    return ok(Boolean(res.data));
  }
}
