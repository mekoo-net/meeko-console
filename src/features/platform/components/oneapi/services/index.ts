import { OneApiClassifierHttpAdapter } from '@/shared/api/adapters/oneapiClassifierAdapter';
import { OneApiRatecardHttpAdapter } from '@/shared/api/adapters/oneapiRatecardAdapter';
import { isMockMode } from '@/shared/runtime';

import { OneApiClassifierMock } from './mock/oneapiClassifierMock';
import { OneApiRatecardMock } from './mock/oneapiRatecardMock';
import type { OneApiClassifierPort } from './ports/oneapiClassifierPort';
import type { OneApiRatecardPort } from './ports/oneapiRatecardPort';

/** OneApi 这个组件的设置端口，一页一个：模型价格、请求分类。以后网关的别的设置各加一个端口。 */
const ratecard: OneApiRatecardPort = isMockMode
  ? new OneApiRatecardMock()
  : new OneApiRatecardHttpAdapter();

const classifier: OneApiClassifierPort = isMockMode
  ? new OneApiClassifierMock()
  : new OneApiClassifierHttpAdapter();

export function getOneApiRatecardPort(): OneApiRatecardPort {
  return ratecard;
}

export function getOneApiClassifierPort(): OneApiClassifierPort {
  return classifier;
}
