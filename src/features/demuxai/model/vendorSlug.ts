/** 与后端 Vendor.NormalizeVendorSlug 一致：^[a-z][a-z0-9_-]{1,62}$ */
export const VENDOR_SLUG_PATTERN = /^[a-z][a-z0-9_-]{1,62}$/;

export function isValidVendorSlug(raw: string): boolean {
  return VENDOR_SLUG_PATTERN.test(raw.trim().toLowerCase());
}

export function normalizeVendorSlug(raw: string): string {
  return raw.trim().toLowerCase();
}
