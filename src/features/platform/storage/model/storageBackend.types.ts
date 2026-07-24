import { z } from 'zod';

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const storageBackendDtoSchema = z.object({
  id: idString,
  name: z.string(),
  providerType: z.enum(['local', 'aliyun-oss']),
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  publicEndpoint: z.string().nullable().optional(),
  cdnStaticBaseUrl: z.string().nullable().optional(),
  cdnStoreBaseUrl: z.string().nullable().optional(),
  accessKeyId: z.string(),
  accessKeySecretConfigured: z.boolean(),
  localRoot: z.string().nullable().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type StorageBackendDto = z.infer<typeof storageBackendDtoSchema>;

export interface CreateStorageBackendPayload {
  name: string;
  providerType: 'local' | 'aliyun-oss';
  endpoint: string;
  region: string;
  bucket: string;
  publicEndpoint?: string | undefined;
  cdnStaticBaseUrl?: string | undefined;
  cdnStoreBaseUrl?: string | undefined;
  accessKeyId: string;
  accessKeySecret?: string | undefined;
  localRoot?: string | undefined;
  isActive: boolean;
  isDefault: boolean;
}

export interface UpdateStorageBackendPayload {
  name: string;
  providerType: 'local' | 'aliyun-oss';
  endpoint: string;
  region: string;
  bucket: string;
  publicEndpoint?: string | undefined;
  cdnStaticBaseUrl?: string | undefined;
  cdnStoreBaseUrl?: string | undefined;
  accessKeyId: string;
  /** 非空则更新密钥；undefined 表示表单未填写（保留）。 */
  accessKeySecret?: string | undefined;
  localRoot?: string | undefined;
  isActive: boolean;
  isDefault: boolean;
}

export const testStorageBackendResultSchema = z.object({
  success: z.boolean(),
  elapsedMs: z.number().int(),
  failureCode: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
});

export type TestStorageBackendResult = z.infer<typeof testStorageBackendResultSchema>;

export const adminCommandResultSchema = z.object({
  success: z.boolean(),
  id: idString,
  failureCode: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
});

export type AdminCommandResult = z.infer<typeof adminCommandResultSchema>;
