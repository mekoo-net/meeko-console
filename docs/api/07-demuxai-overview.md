# 07 · DemuxAI 概览页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demux/overview` |
| 角色 | **Admin** |
| 视图 | `src/features/demux/views/OverviewView.vue` |
| 子组件 | `DateRangeBar` / `OverviewKpi` / `OverviewTrafficChart` / `OverviewStatusDonut` / `OverviewCostTokensChart` / `OverviewErrorTop` / `OverviewTopModels` / `OverviewTopProviders` |
| Port | `DemuxaiLogsPort.stats` + `DemuxaiProviderPort.list`（Vendor 字典，仅用于 Top 渠道名映射） |

## 业务定义

> 全局观测页：从调用日志服务拉取一段时间内的聚合统计，渲染 KPI 卡片与图表。
>
> **数据面与控制面解耦**：
> - **运营控制面**（供应商组目录、模型别名、定价、激活码）走 `demuxai/api/admin/*`（经 Vite 代理到 Demux 服务）。
> - **数据面**（日志 + 统计）走 `demuxai/api/admin/logs`（当前 BFF 的 `stats` 仅返回日聚合行，完整 KPI 结构见下方「接入状态」）。
> **架构说明（2026-05）**：供应商组 / 对外别名已迁到 [`08-demuxai-providers.md`](./08-demuxai-providers.md) 的「目录 + 模型路由」模型；本页 Top 渠道仍通过 **遗留 Vendor 列表**（`Provider.id` → `name`）做 int 主键到展示名的映射，与日志里的 `providerId` 对齐。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 统计聚合（KPI + 时序 + Top + 错误码 + 延迟） | `DemuxaiLogsPort.stats(filter)` | GET | `/demux/api/admin/logs/stats` 及 `…/stats/by/{model,provider,errorcode}`、`…/stats/latency` |
| Vendor 字典（Top 渠道名映射） | `DemuxaiProviderPort.list` | GET | `/demux/api/admin/providers` |

> Demux 管理端接口统一包在 **`{ success, message?, data }` 信封**内（HTTP 200），前端经 `requestDemuxAi` 解包。详见 [`00-conventions.md`](./00-conventions.md)。

## 请求 / 响应

### `GET /demux/api/admin/logs/stats`
查询参数（与 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 的 `ListLogsFilter` 共用子集）：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fromUtc` | number | 是 | Unix 毫秒；区间起点（inclusive）。 |
| `toUtc` | number | 是 | Unix 毫秒；区间终点（inclusive）；UI 最长 7 天。 |
| `accountUid` | string | 否 | 主账户 UID。 |
| `tokenId` | string | 否 | sk- 令牌实体主键（`id`）；与 `iamUserUid`（用户）勿混用。 |
| `modelName` | string | 否 | 模糊匹配对外模型名（= 用户请求体 `model` / 别名 `alias`）。 |
**目标响应**（`LogStats`，与 `src/features/demux/model/log.types.ts` 一致）—— 顶层字段供各子组件直接订阅：

```json
{
  "totalCalls": 12450,
  "successCalls": 11980,
  "errorCalls": 470,
  "rpm": 8.65,
  "avgTokenLatency": 280,
  "p95TokenLatency": 980,
  "totalTokens": 8123456,
  "totalCost": 312.45,
  "bucketSizeSec": 3600,
  "buckets": [
    {
      "tsUtc": "2025-09-12T00:00:00Z",
      "calls": 520,
      "errors": 22,
      "cost": 12.45,
      "tokens": 412000
    }
  ],
  "topModels": [
    {
      "modelName": "demux-gpt-4o",
      "calls": 5800,
      "cost": 180.12,
      "errorRate": 0.022
    }
  ],
  "topProviders": [
    {
      "providerId": 1001,
      "calls": 7800,
      "errors": 280,
      "avgTokenLatency": 240
    }
  ],
  "errorCodes": [
    { "code": "upstream_5xx", "count": 180 },
    { "code": "upstream_timeout", "count": 100 },
    { "code": "other", "count": 50 }
  ]
}

```

字段说明：
| 字段 | 说明 |
| --- | --- |
| `totalCalls` / `successCalls` / `errorCalls` | 区间内调用量；`errorCalls` = `status !== 'success'`。 |
| `rpm` | 平均每分钟调用数（按 `fromUtc`–`toUtc` 跨度归一）。 |
| `avgTokenLatency` / `p95TokenLatency` | **仅统计** `content.streamed === true` 且成功的 `content.latencyMs`（TTFT，单位 ms）。 |
| `totalTokens` | 仅累加 `billingType === 'per_token'` 的 `usage.totalTokens`。 |
| `totalCost` | 区间内 `cost.total` 求和（元）。 |
| `bucketSizeSec` | 时序桶宽（秒）；由 BFF 按跨度自适应，前端只读。 |
| `buckets[]` | 时序点；`tokens` 同样只累计 token 类型。 |
| `topModels[]` | 最多 5 条；`modelName` 为对外别名快照。 |
| `topProviders[]` | 最多 5 条；`providerId` 为 Vendor int 主键；展示名由前端 join Vendor 字典。 |
| `errorCodes[]` | 失败调用按 `content.error.code` 聚合；超出 Top5 合并为 `other`。 |

#### 接入状态（与当前 BFF 的差异）
| 项 | 现状 |
| --- | --- |
| `DemuxaiLogsHttpAdapter.stats` | 并行拉 5 个端点：`stats`（分桶趋势）+ `stats/by/model` + `stats/by/provider` + `stats/by/errorcode` + `stats/latency`，在前端聚合成完整 `LogStats`。 |
| `rpm` | 后端不下发；适配器按 `fromUtc/toUtc` 跨度（缺失时退化为分桶覆盖跨度）÷ 总调用算出。 |
| `avgTokenLatency` / `p95TokenLatency` | 由 `stats/latency` 提供（仅流式、成功且耗时 > 0 的样本入聚合）。 |
| `errorCodes` | 由 `stats/by/errorcode` 提供；适配器把超出 Top5 的合并为 `other`。 |
| 统计 JOIN 口径 | 后端 stat 系列查询统一 **LEFT JOIN** 定价/别名快照（与日志列表一致），快照缺失的日志不再被整段过滤掉。 |
| Mock | `demuxaiLogsMock` 按过滤后的日志行在本地聚合，字段与上表一致。 |

### `GET /demux/api/admin/providers`（Vendor 字典）
概览页 `loadProviders()` 拉全量 Vendor（`pageSize=200`），构建 `providerId → name` Map，供 `OverviewTopProviders` 展示。
参数：当前 BFF **无分页过滤**，返回 `ItemsEnvelope<VendorDto>`。
响应字段（简化后）：

```json
{
  "items": [
    {
      "id": "1001",
      "name": "OpenAI 主线",
      "status": "active",
      "createdAtUtc": "2024-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-12T03:21:08Z"
    }
  ],
  "total": 8
}

```

> 完整 Vendor CRUD 见 [`08-demuxai-providers.md`](./08-demuxai-providers.md) § 遗留 Vendor 接口。供应商组（QueueGroup）目录**不**在本页使用。

## 交互流程

```

onMounted → loadProviders() + fetchStats()
DateRangeBar 改变 dateRange → fetchStats()   // 必填，最长 7 天
子组件订阅 stats 各字段（非嵌套 kpi/timeseries 分组）

```

- 用户清空 `dateRange` 时刷新按钮置灰，提示「请先选择时间范围」。
- 默认时间范围：最近 24h。

## 错误码

| HTTP / 信封 | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺时间范围 / 跨度 > 7 天 |
| 403 | `forbidden` | 非 Admin |
| 504 | `timeout` | 聚合超时 |
| 503 | `dependency_down` | 日志存储不可用 |

## 备注

- 与 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 共用 `ListLogsFilter` 的时间与账户维度；`stats` 与 `list` 应使用相同过滤语义。
- 新架构下对外模型主键是 **别名 `alias`**（模型路由），日志里的 `modelName` 字段仍存用户请求体中的 `model` 值（通常 = `alias`）。
