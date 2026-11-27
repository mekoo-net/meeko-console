import type { AppResult } from '@/shared/api/httpTypes';

import type { FilterDoc, FilterProblem, FilterSchema, FilterSnapshot } from '../../model/filter.types';

/**
 * OneApi 网关的过滤器（分类器 + 各 Vendor 的过滤规则）—— 对应号池后台的 `/v1/filter/**`，
 * 对外是 `/oneapi/vault/v1/filter/**`。
 *
 * 是一整份文档，存在 Consul KV 上，OneApi 网关跟着它：这里存进去，网关那边一个来回之内就换上新的。
 * 所以没有「发布」，存成了就是生效了。
 *
 * 整份读、整份存，存的时候带着读到的版本号：别人先存过，这次就被拒掉（`conflict`），重新读了再改。
 */
export interface OneApiFilterPort {
  /** 当前的文档和版本号。还没有文档时是一份空的、版本号为 null。 */
  load(): Promise<AppResult<FilterSnapshot>>;

  /**
   * 存整份文档。号池后台先用网关的编译器过一遍，有一处网关读不懂就不存（`validation`，说明在 `details` 里）；
   * 版本号对不上回 `conflict`。成功回存进去的那一份和新版本号。
   */
  save(doc: FilterDoc, version: string | null): Promise<AppResult<FilterSnapshot>>;

  /** 只查不存：这份文档里网关读不懂什么，一处一条。空数组 = 全都读得懂。 */
  validate(doc: FilterDoc): Promise<AppResult<FilterProblem[]>>;

  /** 条件里能写的字段和运算符，以及有哪些 Vendor。 */
  schema(): Promise<AppResult<FilterSchema>>;
}
