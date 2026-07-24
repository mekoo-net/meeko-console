import { z } from 'zod';

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const storageBackendUsageSchema = z.object({
  backendId: idString,
  name: z.string(),
  providerType: z.enum(['local', 'aliyun-oss']).or(z.string()),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  objectCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  orphanedCount: z.number().int().nonnegative(),
  activeRefCount: z.number().int().nonnegative(),
  pendingUploadCount: z.number().int().nonnegative(),
});

export const storageOverviewSchema = z.object({
  backendCount: z.number().int().nonnegative(),
  activeBackendCount: z.number().int().nonnegative(),
  totalObjectCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  orphanedObjectCount: z.number().int().nonnegative(),
  pendingUploadCount: z.number().int().nonnegative(),
  activeRefCount: z.number().int().nonnegative(),
  backends: z.array(storageBackendUsageSchema),
});

export type StorageBackendUsage = z.infer<typeof storageBackendUsageSchema>;
export type StorageOverview = z.infer<typeof storageOverviewSchema>;
