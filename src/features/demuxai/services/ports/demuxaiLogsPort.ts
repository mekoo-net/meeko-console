import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ChannelConsumptionRow,
  ListLogsFilter,
  LogEntry,
  LogStats,
  ReverseLogInput,
  ReverseLogResult,
} from '../../model/log.types';

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
 *
 * 关于 `reverse(...)`：虽然账单实体属于 billing 域，但驳回的**操作发起点**永远是
 * 调用日志页（运维直接在排障现场决定"这条扣费要驳"），故方法落在 LogsPort 而非
 * BillingPort。HttpAdapter 真接 BFF 时由 BFF 内部 join `Bill` 表完成事务。
 */
export interface DemuxaiLogsPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListLogsFilter;
  }): Promise<AppResult<ListLogsPage>>;

  /** 与 list 同 filter 的聚合统计（用于 KPI 卡片） */
  stats(filter: ListLogsFilter): Promise<AppResult<LogStats>>;

  /**
   * 按渠道（供应商组）聚合的消费统计。
   *
   * 归集口径来自每条日志关联的定价快照绑定（`channelKey`），故"调用当时命中的渠道"
   * 即使别名/供应商事后被删也能完整统计。`filter.channelKey` 非空时只统计该渠道。
   */
  statByChannel(filter: ListLogsFilter): Promise<AppResult<ChannelConsumptionRow[]>>;

  /**
   * 驳回单条调用日志对应的账单（actualAmount → 0，钱包余额反向冲账）。
   *
   * 业务校验：
   *  - 日志必须存在；不存在 → 404 `not_found`
   *  - 日志必须有关联账单（`bill != null`）；无账单 → 400 `validation`
   *  - 账单当前 status 必须是 `completed`；已驳回 → 409 `conflict`
   *
   * 成功回执包含**当前操作人**（BFF 端从 session 取，前端 mock 用约定 admin UID），
   * 前端拿到回执后**就地更新行**，避免重新拉列表丢失滚动 / 过滤上下文。
   */
  reverse(input: ReverseLogInput): Promise<AppResult<ReverseLogResult>>;
}
