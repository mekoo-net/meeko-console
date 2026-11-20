import { OneApiRatecardHttpAdapter } from '@/shared/api/adapters/oneapiRatecardAdapter';
import { isMockMode } from '@/shared/runtime';

import { OneApiRatecardMock } from './mock/oneapiRatecardMock';
import type { OneApiRatecardPort } from './ports/oneapiRatecardPort';

/** OneApi 这个组件的设置端口。现在只有模型价格；以后网关的别的设置各加一个端口。 */
const ratecard: OneApiRatecardPort = isMockMode
  ? new OneApiRatecardMock()
  : new OneApiRatecardHttpAdapter();

export function getOneApiRatecardPort(): OneApiRatecardPort {
  return ratecard;
}
