import type { AppResult } from '@/shared/api/httpTypes';
import { ok } from '@/shared/api/httpTypes';

import type {
  BillingProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../../model/product.types';
import type { ProductPort } from '../ports/productPort';

const seed: BillingProduct[] = [
  {
    code: 'demuxai.credit',
    domain: 'demuxai',
    displayName: 'DemuxAI',
    active: true,
    createdAtUtc: Date.now(),
    updatedAtUtc: Date.now(),
  },
];

export class ProductMock implements ProductPort {
  private items = [...seed];

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
      return { success: false, error: { code: 'conflict', message: '产品代码已存在' } };
    }
    const now = Date.now();
    const item: BillingProduct = {
      ...input,
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

  async setActive(code: string, active: boolean): Promise<AppResult<BillingProduct>> {
    const idx = this.items.findIndex((p) => p.code === code);
    if (idx < 0) return { success: false, error: { code: 'not_found', message: '产品不存在' } };
    this.items[idx] = { ...this.items[idx]!, active, updatedAtUtc: Date.now() };
    return ok({ ...this.items[idx]! });
  }
}
