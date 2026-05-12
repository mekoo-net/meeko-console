import type { AppResult } from '@/shared/api/httpTypes';

import type { ListLogsFilter, LogEntry, LogStats } from '../../model/log.types';

export interface ListLogsPage {
  items: LogEntry[];
  total: number;
}

/**
 * 调用日志查询端口。数据面 —— 通常对应另一个微服务（ClickHouse / ES 网关）。
 *
 * 与控制面解耦的原因：
 *  - 日志量级远大于控制面，QPS 与延迟模型不同
 *  - 上游可能就是云厂商 SLS / Datadog，HttpAdapter 实现路径不同
 *  - 日志服务挂掉时不应让 Provider / Model / Pricing 列表也跟着挂
 *
 * UI 约定：
 *  - 必须传 `fromUtc/toUtc`，最长 7 天；HttpAdapter 在缺省时拒绝（避免全表扫）
 *  - 默认按 occurredAtUtc DESC，pageSize ≤ 100
 *  - stats 与 list 用同一 filter，便于结果一致
 */
export interface DemuxaiLogsPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListLogsFilter;
  }): Promise<AppResult<ListLogsPage>>;

  /** 与 list 同 filter 的聚合统计（用于 KPI 卡片） */
  stats(filter: ListLogsFilter): Promise<AppResult<LogStats>>;
}
