# 07 · DemuxAI 概览页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/overview` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/OverviewView.vue` |
| 子组件 | `DateRangeBar` / `OverviewKpi` / `OverviewTrafficChart` / `OverviewStatusDonut` / `OverviewCostTokensChart` / `OverviewErrorTop` / `OverviewTopModels` / `OverviewTopProviders` |
| Port | `DemuxaiLogsPort.stats` + `DemuxaiProviderPort.list`（仅用于 provider 名映射） |

## 业务定义

> 全局观测页：从「调用日志」服务（独立微服务 / 数据面）拉取一段时间内的聚合统计，渲染卡片 + 图表。
>
> **数据面与控制面解耦**：
> - 控制面（Provider / Model / Pricing）走 `/api/admin/demuxai`。
> - 数据面（日志 + 统计）走独立日志网关（ClickHouse / ES）。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 统计聚合（KPI + 时序 + Top） | `DemuxaiLogsPort.stats(filter)` | GET | `/api/demuxai/logs/stats` |
| Provider 字典（用于 Top 渠道名映射） | `DemuxaiProviderPort.list` | GET | `/api/admin/demuxai/providers` |

## 请求 / 响应

### `GET /api/demuxai/logs/stats`

查询参数（与日志页 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 的 `ListLogsFilter` 共用）：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fromUtc` | ISO8601 | 是 | 必须，最长 7 天。 |
| `toUtc` | ISO8601 | 是 | 同上。 |
| `accountUid` | string | 否 | 精确匹配主账户 UID（= `LogEntry.account.uid`）。 |
| `iamId` | string | 否 | 精确匹配 IAM 子账户 UID（= `LogEntry.account.iamId`）。 |
| `convId` | string | 否 | 精确匹配会话 ID（按对话维度排障 / 看用量）。 |
| `modelName` | string | 否 | 模糊匹配模型名。 |
| `providerId` | int | 否 | 精确匹配渠道 int 主键（= `Provider.id`）。 |
| `apiType` | enum | 否 | 见 `apiTypeValues`。 |
| `errorOnly` | boolean | 否 | 仅看失败调用（`success === false`）。 |
| `errorCode` | string | 否 | 精确过滤 `error.code`，仅对失败调用生效。 |

成功响应（`LogStats`）：

```json
{
  "totalCalls": 12450,
  "successCalls": 11980,
  "errorCalls": 470,
  "totalTokens": 8123456,
  "totalCost": 312.45,
  "avgTokenLatency": 280,
  "p95TokenLatency": 980,
  "rpm": 8.65,
  "bucketSizeSec": 3600,
  "buckets": [
    { "tsUtc": "2025-09-12T00:00:00Z", "calls": 520, "errors": 22, "cost": 12.45, "tokens": 412000 },
    { "tsUtc": "2025-09-12T01:00:00Z", "calls": 488, "errors": 18, "cost": 11.92, "tokens": 388700 }
  ],
  "topModels": [
    { "modelName": "demux-gpt-4o", "calls": 5800, "cost": 180.12, "errorRate": 0.022 }
  ],
  "topProviders": [
    { "providerId": 1001, "calls": 7800, "errors": 280, "avgTokenLatency": 240 }
  ],
  "errorCodes": [
    { "code": "upstream_5xx", "count": 180 },
    { "code": "upstream_timeout", "count": 100 },
    { "code": "rate_limited", "count": 80 },
    { "code": "context_too_long", "count": 60 },
    { "code": "other", "count": 50 }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `totalCalls` / `successCalls` / `errorCalls` | int | 全量计数（按 `success` 字段分桶）。 |
| `totalTokens` | int | 区间内 `billingType === 'per_token'` 类型的 `usage.totalTokens` 求和。非 token 类型（图像 / 视频 / 音频 / 字符）不计入本数。 |
| `totalCost` | number | 区间内全部调用 `cost.total` 求和（元，跨 billingType 可加，单位统一）。 |
| `avgTokenLatency` / `p95TokenLatency` | int | 首字延迟（TTFT）的均值 / P95，单位 ms。**统计口径**：只取 `streamed && success` 样本进入聚合 —— 非流式 `tokenLatency` 是端到端总耗时，量级与生成长度强相关，混入会污染平均值；失败请求 `tokenLatency = null` 自然不计入。 |
| `rpm` | number | 平均每分钟调用数（按区间归一）。 |
| `bucketSizeSec` | int | 时序桶宽（秒），常见 `3600` / `86400`，由 BFF 按区间跨度自适应。 |
| `buckets[]` | `LogStatsBucket[]` | 时序点，按 `tsUtc` 升序。`tokens` 同样只累计 token 类型；`errors` 按 `success === false` 累计。 |
| `topModels[]` | 最多 5 条 | `errorRate` 0..1，按 `success === false` 比例计算。 |
| `topProviders[]` | 最多 5 条 | `avgTokenLatency` 同上口径，仅取 `streamed && success` 样本；纯图像 / 视频渠道无 TTFT 样本，返回 `0`。 |
| `errorCodes[]` | 最多 5 条 + `other` | 仅 `success === false` 的调用按 `error.code` 聚合；超出 Top5 的合并为 `other`。前端"状态分布"环形图直接由 `successCalls` + 本数组组合渲染（不再单列 `statusBreakdown`）。 |

### `GET /api/admin/demuxai/providers`（仅用于名映射）

参数：`page=1&pageSize=200&keyword=&apiType=all&status=all`。
响应见 [`08-demuxai-providers.md`](./08-demuxai-providers.md)。前端只取 `items[].uid`、`items[].name` 做 Map。

## 交互流程

```
onMounted → loadProviders() + fetchStats()
DateRangeBar 改变 dateRange → fetchStats()（必填，最长 7 天）
任一时序图组件订阅 buckets；环形/Top 卡片订阅各自数组
```

- 用户清空 dateRange 时按钮置灰，提示"请先选择时间范围"。
- 默认时间范围：最近 24h。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺时间范围 / 跨度 > 7 天 |
| 403 | `forbidden` | 非 Admin |
| 504 | `timeout` | 聚合超时（缩小时间窗或加索引） |
| 503 | `dependency_down` | ClickHouse / ES 不可用 |

## 备注

- 概览页与 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 共用 `ListLogsFilter`；建议 BFF 同时暴露 `/api/demuxai/logs` 与 `/api/demuxai/logs/stats`，参数完全一致以便复用。
- 时间桶大小由 BFF 决定（不由前端传入），前端按 `bucketSizeSec` 渲染 X 轴。
