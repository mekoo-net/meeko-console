import { z } from 'zod';

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const storageObjectItemSchema = z.object({
  id: idString,
  storageKey: z.string(),
  sha256: z.string(),
  backendId: idString,
  backendName: z.string(),
  createdByUid: z.union([z.string(), z.number()]).transform((v) => String(v)),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  status: z.enum(['committed', 'orphaned']).or(z.string()),
  createdAtUtc: z.string(),
  activeRefCount: z.number().int().nonnegative(),
  totalRefCount: z.number().int().nonnegative(),
  products: z.array(z.string()),
  purposes: z.array(z.string()),
  publicUrl: z.string().nullable().optional(),
});

export const storageObjectListSchema = z.object({
  items: z.array(storageObjectItemSchema),
  total: z.number().int().nonnegative(),
});

export const storageBrowseSchema = z.object({
  prefix: z.string(),
  commonPrefixes: z.array(z.string()),
  items: z.array(storageObjectItemSchema),
  total: z.number().int().nonnegative(),
});

export const storageObjectRefSchema = z.object({
  id: idString,
  accountUid: z.union([z.string(), z.number()]).transform((v) => String(v)),
  product: z.string(),
  purpose: z.string(),
  refKey: z.string().nullable().optional(),
  status: z.enum(['committed', 'released', 'pending']).or(z.string()),
  createdAtUtc: z.string(),
  lastSeenAtUtc: z.string(),
  releasedAtUtc: z.string().nullable().optional(),
});

export const storageObjectRefsSchema = z.object({
  found: z.boolean(),
  storageKey: z.string(),
  sha256: z.string().nullable().optional(),
  createdByUid: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  createdAtUtc: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().optional(),
  refs: z.array(storageObjectRefSchema),
});

export type StorageObjectItem = z.infer<typeof storageObjectItemSchema>;
export type StorageObjectList = z.infer<typeof storageObjectListSchema>;
export type StorageBrowseResult = z.infer<typeof storageBrowseSchema>;
export type StorageObjectRef = z.infer<typeof storageObjectRefSchema>;
export type StorageObjectRefsResult = z.infer<typeof storageObjectRefsSchema>;

export interface ListStorageObjectsParams {
  page: number;
  pageSize: number;
  accountUid?: string;
  product?: string;
  purpose?: string;
  sha256?: string;
  mimePrefix?: string;
  status?: string;
  backendId?: string;
}

export interface BrowseStorageObjectsParams {
  prefix?: string;
  page: number;
  pageSize: number;
  backendId?: string;
}

export const PURPOSE_LABELS: Record<string, string> = {
  avatar: '平台头像',
  'persona-avatar': '角色头像',
  'chat-image': '聊天图片',
  'chat-video': '聊天视频',
};

export const PRODUCT_LABELS: Record<string, string> = {
  platform: '平台',
  tavern: 'Tavern',
};

export function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS[purpose] ?? purpose;
}

export function productLabel(product: string): string {
  return PRODUCT_LABELS[product] ?? product;
}
