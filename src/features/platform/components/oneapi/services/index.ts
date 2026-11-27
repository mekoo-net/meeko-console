import { OneApiFilterHttpAdapter } from '@/shared/api/adapters/oneapiFilterAdapter';
import { OneApiRatecardHttpAdapter } from '@/shared/api/adapters/oneapiRatecardAdapter';
import { isMockMode } from '@/shared/runtime';

import { OneApiFilterMock } from './mock/oneapiFilterMock';
import { OneApiRatecardMock } from './mock/oneapiRatecardMock';
import type { OneApiFilterPort } from './ports/oneapiFilterPort';
import type { OneApiRatecardPort } from './ports/oneapiRatecardPort';

/** OneApi 这个组件的设置端口，一页一个：模型价格、过滤器。以后网关的别的设置各加一个端口。 */
const ratecard: OneApiRatecardPort = isMockMode
  ? new OneApiRatecardMock()
  : new OneApiRatecardHttpAdapter();

const filter: OneApiFilterPort = isMockMode ? new OneApiFilterMock() : new OneApiFilterHttpAdapter();

export function getOneApiRatecardPort(): OneApiRatecardPort {
  return ratecard;
}

export function getOneApiFilterPort(): OneApiFilterPort {
  return filter;
}
