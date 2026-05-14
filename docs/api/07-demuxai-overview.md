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

成功响应（`LogStats`）—— 顶层分三块：**KPI / 时间序列 / Top-N**：

```json
{
  "kpi": {
    "calls":   { "total": 12450, "success": 11980, "error": 470, "rpm": 8.65 },
    "tokens":  { "total": 8123456 },
    "cost":    { "total": 312.45, "currency": "CNY" },
    "latency": { "avgMs": 280, "p95Ms": 980 }
  },
  "timeseries": {
    "bucketSizeSec": 3600,
    "buckets": [
      { "tsUtc": "2025-09-12T00:00:00Z", "calls": 520, "errors": 22, "cost": 12.45, "tokens": 412000 },
      { "tsUtc": "2025-09-12T01:00:00Z", "calls": 488, "errors": 18, "cost": 11.92, "tokens": 388700 }
    ]
  },
  "topModels": [
    {
      "model":     { "id": "demux-gpt-4o", "name": "demux-gpt-4o" },
      "calls":     5800,
      "cost":      180.12,
      "errorRate": 0.022
    }
  ],
  "topProviders": [
    {
      "provider":     { "id": 1001, "name": "OpenAI 主线" },
      "calls":        7800,
      "errors":       280,
      "errorRate":    0.0359,
      "avgLatencyMs": 240
    }
  ],
  "topErrors": [
    { "code": "upstream_5xx",     "count": 180 },
    { "code": "upstream_timeout", "count": 100 },
    { "code": "rate_limited",     "count":  80 },
    { "code": "context_too_long", "count":  60 },
    { "code": "other",            "count":  50 }
  ]
}
```

字段说明：

#### `kpi` —— 卡片区聚合数

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kpi.calls` | object | `{ total, success, error, rpm }`。全量计数按 `success` 字段分桶；`rpm` 是平均每分钟调用数（按区间归一）。 |
| `kpi.tokens` | object | `{ total }`。区间内 `billingType === 'per_token'` 类型的 `usage.totalTokens` 求和。非 token 类型（图像 / 视频 / 音频 / 字符）不计入本数。未来扩 `prompt` / `completion` 拆分时此对象无侵入。 |
| `kpi.cost` | object | `{ total, currency }`。区间内全部调用 `cost.total` 求和（元，跨 billingType 可加，单位统一）。`currency` 当前固定为账户币种。 |
| `kpi.latency` | object | `{ avgMs, p95Ms }`，单位 ms。**统计口径**：只取 `streamed && success` 样本进入聚合 —— 非流式 `tokenLatency` 是端到端总耗时，量级与生成长度强相关，混入会污染平均值；失败请求 `tokenLatency = null` 自然不计入。 |

#### `timeseries` —— 时序图区

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `timeseries.bucketSizeSec` | int | 时序桶宽（秒），常见 `3600` / `86400`，由 BFF 按区间跨度自适应。 |
| `timeseries.buckets[]` | `LogStatsBucket[]` | 时序点，按 `tsUtc` 升序。`tokens` 同样只累计 token 类型；`errors` 按 `success === false` 累计。 |

#### `topModels` / `topProviders` / `topErrors` —— 排行榜（各最多 5 条）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `topModels[].model` | object | `{ id, name }`。**id 必返**（前端可直接路由跳转到模型详情 `/demuxai/models?focus=<id>`，不必再 join Models 字典）；`name` 默认 = `id`，未来支持别名时可分化。 |
| `topModels[].errorRate` | number | 0..1，按 `success === false` 比例计算。 |
| `topProviders[].provider` | object | `{ id, name }`。`id` 是 int 主键；`name` 由 BFF join `provider` 表 / 缓存填充（**前端 v1 无需再单独拉 providers 字典做名映射**）。 |
| `topProviders[].errorRate` | number | 直接下发（= `errors / calls`），避免前端各处自算导致口径漂移。 |
| `topProviders[].avgLatencyMs` | int | 同 `kpi.latency.avgMs` 口径，仅取 `streamed && success` 样本；纯图像 / 视频渠道无 TTFT 样本，返回 `0`。 |
| `topErrors[]` | 最多 5 条 + `other` | 仅 `success === false` 的调用按 `error.code` 聚合；超出 Top5 的合并为 `other`。前端"状态分布"环形图直接由 `kpi.calls.success` + 本数组组合渲染（不再单列 `statusBreakdown`）。 |

> **顶层分组动机**：原 12+ 字段平铺顶层让前端读 schema 像"读散文"——卡片区 / 图表区 / 排行榜彼此独立、应用场景不同，分组后：
> - 前端 props 透传更简洁（`<KpiCards :data="stats.kpi"/>`、`<TopList :rows="stats.topModels"/>`）；
> - 未来扩 `cost.byBillingType: {per_token: ..., per_image: ...}` 之类的细分维度，落点明确；
> - 与 Datadog / Cloudflare Analytics 等业界一线 stats schema 的形状一致。

### `GET /api/admin/demuxai/providers`（**v1 已弱化为可选**）

由于 `topProviders[].provider.name` 由 BFF 在 stats 内直接 join 下发，本接口在概览页**不再是必需依赖**。仅当未来需要"全 Provider 选择器"等场景时再调。
参数：`page=1&pageSize=200&keyword=&apiType=all&status=all`。响应见 [`08-demuxai-providers.md`](./08-demuxai-providers.md)。

## 交互流程

```
onMounted → fetchStats()                        // stats 内已含 provider/model 显示名，无需再拉字典
DateRangeBar 改变 dateRange → fetchStats()       // 必填，最长 7 天
任一时序图组件订阅 timeseries.buckets；环形/Top 卡片订阅 kpi / topX
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
