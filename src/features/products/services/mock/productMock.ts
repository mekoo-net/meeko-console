import type { AppResult } from '@/shared/api/httpTypes';
import { ok } from '@/shared/api/httpTypes';

import type {
  BillingProduct,
  DiscoveredProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../../model/product.types';
import type { ProductPort } from '../ports/productPort';

const discoveredSeed: DiscoveredProduct[] = [
  {
    code: 'demux',
    domain: 'demux',
    suggestedDisplayName: 'DemuxAI',
    alreadyRegistered: false,
    serviceName: 'demuxai',
  },
];

const seed: BillingProduct[] = [];

export class ProductMock implements ProductPort {
  private items = [...seed];

  async discover(): Promise<AppResult<DiscoveredProduct[]>> {
    const registered = new Set(this.items.map((p) => p.code));
    return ok(
      discoveredSeed.map((item) => ({
        ...item,
        alreadyRegistered: registered.has(item.code),
      })),
    );
  }

  async list(includeInactive = false): Promise<AppResult<BillingProduct[]>> {
    const rows = includeInactive ? this.items : this.items.filter((p) => p.active);
    return ok([...rows]);
  }

  async get(code: string): Promise<AppResult<BillingProduct>> {
    const item = this.items.find((p) => p.code === code);
    if (!item) return { success: false, error: { code: 'not_found', message: '产品不存在' } };
    return ok({ ...item });
  }

  async register(input: RegisterProductInput): Promise<AppResult<BillingProduct>> {
    if (this.items.some((p) => p.code === input.code)) {
      return { success: false, error: { code: 'conflict', message: '产品已注册' } };
    }
    const discovered = discoveredSeed.find((p) => p.code === input.code);
    if (!discovered) {
      return { success: false, error: { code: 'validation', message: 'Consul 未发现该产品' } };
    }
    const now = Date.now();
    const item: BillingProduct = {
      code: input.code,
      domain: discovered.domain,
      displayName: input.displayName?.trim() || discovered.suggestedDisplayName,
      active: true,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    this.items.push(item);
    return ok({ ...item });
  }

  async update(code: string, input: UpdateProductInput): Promise<AppResult<BillingProduct>> {
    const idx = this.items.findIndex((p) => p.code === code);
    if (idx < 0) return { success: false, error: { code: 'not_found', message: '产品不存在' } };
    const current = this.items[idx]!;
    const next: BillingProduct = {
      ...current,
      displayName: input.displayName ?? current.displayName,
      metadataJson: input.metadataJson ?? current.metadataJson,
      updatedAtUtc: Date.now(),
    };
    this.items[idx] = next;
    return ok({ ...next });
  }

  async unregister(code: string): Promise<AppResult<boolean>> {
    const idx = this.items.findIndex((p) => p.code === code);
    if (idx < 0) return { success: false, error: { code: 'not_found', message: '产品不存在' } };
    this.items.splice(idx, 1);
    return ok(true);
  }
}
