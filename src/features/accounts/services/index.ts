import { AccountAdminMock } from './mock/accountAdminMock';
import type { AccountAdminPort } from './ports/accountAdminPort';

let cached: AccountAdminPort | null = null;

function shouldUseMock(): boolean {
  const raw = import.meta.env?.VITE_USE_MOCK;
  if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
  return true;
}

/**
 * Service Locator：未来接入 BFF 时只新增 `HttpAccountAdminAdapter`，
 * 这里根据 env 选择实现；视图层不感知。
 */
export function getAccountAdminPort(): AccountAdminPort {
  if (cached !== null) return cached;
  if (shouldUseMock()) {
    cached = new AccountAdminMock();
    return cached;
  }
  throw new Error(
    'HttpAccountAdminAdapter 尚未实现：请创建 services/bff/accountAdminAdapter.ts 并接入 /accounts、/iam/users 端点。',
  );
}
