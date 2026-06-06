import type {
  BillingProduct,
  BillingModeCode,
  RegisterProductInput,
  SubscriptionPeriodCode,
  UpdateProductInput,
} from '@/features/products/model/product.types';
import type { ProductPort } from '@/features/products/services/ports/productPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/api/admin/billing/products';

function parseBillingMode(value: unknown): BillingModeCode {
  const raw = String(value ?? 'payg_call').toLowerCase();
  if (raw === 'one_shot' || raw === 'oneshot') return 'one_shot';
  if (raw === 'subscription') return 'subscription';
  if (raw === 'payg_hour' || raw === 'payghour') return 'payg_hour';
  return 'payg_call';
}

function parsePeriod(value: unknown): SubscriptionPeriodCode | null {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'monthly') return 'monthly';
  if (raw === 'yearly') return 'yearly';
  return null;
}

function mapProduct(raw: Record<string, unknown>): BillingProduct {
  return {
    code: String(raw.code ?? ''),
    domain: String(raw.domain ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    billingMode: parseBillingMode(raw.billingMode ?? raw.billing_mode),
    unitPrice: Number(raw.unitPrice ?? raw.unit_price ?? 0),
    unit: String(raw.unit ?? ''),
    period: parsePeriod(raw.period),
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

export class ProductHttpAdapter implements ProductPort {
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
    const res = await request<unknown>(BASE, { method: 'POST', body: input });
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

  async setActive(code: string, active: boolean): Promise<AppResult<BillingProduct>> {
    const res = await request<unknown>(`${BASE}/${encodeURIComponent(code)}/active`, {
      method: 'PATCH',
      body: { active },
    });
    if (!res.success) return res;
    return parseOne(res.data);
  }
}
