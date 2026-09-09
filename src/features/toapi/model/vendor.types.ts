import { z } from 'zod';

/**
 * 供应商（vendor）发现 / 接入。
 *
 * 供应商 = OneApi.Gateway 能服务的一个 vendor_key（cursor / kiro / …）。目录由 Meeko.ToApi 控制面
 * 从运行时侧 Consul KV 读（网关发布的 provider catalog，与 Meeko.Demux 同源），并标出哪些已接入。
 *
 * 一个供应商只落成一个分组，分组 key 就是 vendor_key，令牌的 VendorKey 绑的也是它。
 * 接入时勾选要放进分组的模型；未接入的模型即使网关能跑也不对外。
 */

export const discoveredVendorModelSchema = z.object({
  vendorModel: z.string(),
  alreadyImported: z.boolean(),
});
export type DiscoveredVendorModel = z.infer<typeof discoveredVendorModelSchema>;

export const discoveredVendorSchema = z.object({
  /** vendor_key，= 分组 key */
  vendorKey: z.string(),
  displayName: z.string(),
  /** 该供应商是否已落成分组 */
  alreadyImported: z.boolean(),
  models: z.array(discoveredVendorModelSchema),
});
export type DiscoveredVendor = z.infer<typeof discoveredVendorSchema>;

export const discoverVendorsResultSchema = z.object({
  vendors: z.array(discoveredVendorSchema),
  discoveredAtUtc: z.number(),
});
export type DiscoverVendorsResult = z.infer<typeof discoverVendorsResultSchema>;

export const vendorModelSchema = z.object({
  id: z.string(),
  vendorKey: z.string(),
  vendorModel: z.string(),
});
export type VendorModel = z.infer<typeof vendorModelSchema>;

export interface ImportVendorInput {
  vendorKey: string;
  /** 首次接入时的分组显示名；已接入的供应商补模型时忽略 */
  name?: string | null;
  models: string[];
}

export const importVendorResultSchema = z.object({
  vendorKey: z.string(),
  importedModelCount: z.number().int().nonnegative(),
});
export type ImportVendorResult = z.infer<typeof importVendorResultSchema>;
