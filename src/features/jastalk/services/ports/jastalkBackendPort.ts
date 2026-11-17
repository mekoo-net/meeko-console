import type { AppResult } from '@/shared/api/httpTypes';

import type { IssuedBackendCredentials } from '@/features/platform/gateway/model/backend.types';

/**
 * 给 Jastalk.Gateway 签发调业务（Meeko.Jastalk 的 BackendRpc 端口）用的凭据。
 * ClientSecret 自带签名、不落库，只在签发时出现这一次；后端不收名字（名字只留在本控制台这次会话的清单里）。
 */
export interface JastalkBackendPort {
  issue(): Promise<AppResult<IssuedBackendCredentials>>;
}
