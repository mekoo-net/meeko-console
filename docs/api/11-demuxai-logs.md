# 11 · 调用日志（DemuxAI Logs）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demux/logs` |
| 角色 | **Admin** |
| 视图 | `src/features/demux/views/LogQueryView.vue` |
| 抽屉 | `LogDetailDrawer.vue` · `LogReverseDialog.vue` |
| Port | `DemuxaiLogsPort` + 字典：`DemuxaiModelPort` · `DemuxaiProviderPort` · `AccountAdminPort` |

## 业务定义

> 调用日志属于**数据面**（ClickHouse / PG 用量表 / 独立聚合），与控制面目录解耦。
>
> 设计要点（与 `src/features/demux/model/log.types.ts` 一致）：
>
> - `id`：本条日志主键（snowflake）。**`uid` 在本系统专指 userId**（见 `account.uid` / `account.iamUserUid`），不用于日志行主键。
> - **`createAt`**：调用发生时间（Unix 毫秒 UTC）。类型注释中保留与 `occurredAtUtc` 的对应关系。
> - **`account: { uid, iamUserUid }`**：主账户 + IAM 子账户（扣费主体 vs 操作者）。
> - **`vendorKey` / `vendorPlug`**：命中渠道的内部键（= `vendors.queue_group`）与它对外公开的
>   slug（= `Vendor.VendorSlug`，如 `nai` / `pa`）。**展示用 `vendorPlug`，过滤用 `vendorKey`**。
>   早期的 `providerId`（Vendor int 主键）已随渠道模型重构下线，后端不再下发。
> - **`modelName` / `vendorModel`**：对外模型别名（= 用户请求体 `model`）与命中的上游真实模型名。
> - **`convId`**：多轮会话 ID；列表页点击 Conv 可钻取过滤同会话调用（不归组）。
> - **`token`**：调用来源令牌快照 `{ id, name }`；sk- 后端调用时有值，PG 页面直发（`/demux/api/pg`）时为 `null`，UI 显示 **PG**。
> - **`billingType`**：判别字段；`usage` / `cost` 形状见下表。定价快照缺失（费率行被删 /
>   日志早于当前定价体系）时后端下发 `unknown`，此时 `usage` / `cost` 仍是 `per_token` 形，
>   只是各维度单价为 0、总额取日志落库金额。
> - **`content`**：请求上下文，后端 `usage_logs.content`（jsonb）的下发镜像，与 `usage` / `cost` 平级
>   —— `{ protocol, statusCode, streamed, convId, latencyMs, clientIp, error }`。
> - **`content.latencyMs`**（ms）：`streamed: true` → TTFT；`streamed: false` → 端到端总耗时；`null` = 未知。
>   失败行也会带值（失败前耗了多久），要区分请看 `status`。
> - **`status`**：成败的唯一真源（`pending` / `success` / `failure` / `cancelled` / `unknown`），
>   没有单独的 `success` 布尔；失败原因见 `content.error: { code, message }`，HTTP 码只在 `content.statusCode` 一处。
> - **`bill`**（可选）：关联钱包账单快照；`status === 'reversed'` 时展示已驳回；支持 `DemuxaiLogsPort.reverse`（BFF **待接**）。
> - 不存 prompt / completion 原文。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/demux/api/admin/logs` |
| 统计（与 list 同 filter 子集） | `stats(filter)` | GET | `/demux/api/admin/logs/stats` |
| 驳回账单 | `reverse(input)` | POST | `/demux/api/admin/logs/{logId}/reverse`（**规划，适配器未实现**） |
| Model 字典 | `DemuxaiModelPort.list` | GET | `/demux/api/admin/models` |
| Vendor 字典 | `DemuxaiProviderPort.list` | GET | `/demux/api/admin/providers` |
| Account 字典 | `AccountAdminPort.listAccounts` | GET | `/accounts` |

> 响应经 **`requestDemuxAi`** → `{ success, data }`。

## 请求 / 响应

### `GET /demux/api/admin/logs`
参数：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `p` | int | 是 | 页码，从 1 起（BFF）；前端 Port 仍传 `page` / `pageSize` 由适配器映射 |
| `pageSize` | int | 是 | ≤ 100 |
| `fromUtc` | number | **是** | Unix 毫秒；UI 必传，最长 7 天 |
| `toUtc` | number | **是** | Unix 毫秒 |
| `accountUid` | string | 否 | = `account.uid`（主账户 userId） |
| `accessTokenId` / `iamUserUid` | string | 否 | `accessTokenId` = sk- 令牌实体主键（0 = 账户级直发）；`iamUserUid` = `account.iamUserUid`（IAM userId）。 |
| `modelName` | string | 否 | 模糊匹配 |
| `groupCode` | string | 否 | BFF 已有；可对应模型组 / 路由分组（接入约定） |
| `status` | string | 否 | BFF 用量状态过滤 |
| `vendorKey` | string | 否 | 渠道精确匹配（= `vendors.queue_group`） |
| `protocol` | enum | 否 | 精确匹配 `content.protocol`，取值见下 |
| `errorOnly` | boolean | 否 | 仅 `success === false` |
| `errorCode` | string | 否 | 精确 `error.code` |
| `convId` | string | 否 | 会话精确匹配 |
响应：

```json
{
  "items": [/* LogEntry */],
  "total": 12450
}

```

#### `LogEntry` 共通字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 日志主键 |
| `createAt` | number | 调用时间（Unix 毫秒 UTC） |
| `traceId` | string \| null | 请求链路 TraceId（幂等键 / 账单 idempotency_key） |
| `account` | `{ uid, iamUserUid }` | 主账户 `uid` + IAM `iamUserUid`（均为 userId） |
| `token` | `{ id, name }` \| null | sk- 令牌快照；PG 直发时为 null |
| `modelName` | string | 对外模型名 |
| `vendorKey` | string \| null | 命中渠道的内部键（= `vendors.queue_group`），过滤维度 |
| `vendorPlug` | string \| null | 该渠道对外公开的 slug（如 `nai`），展示优先用它 |
| `vendorModel` | string \| null | 命中的上游真实模型名 |
| `status` | enum | 结算状态，成败唯一真源 |
| `content` | object | 请求上下文，见下 |
| `bill` | object \| null | 见下 |

#### `content` 请求上下文（= `usage_logs.content` jsonb）
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `protocol` | string \| null | **调用协议端点**：`openai_chat` / `openai_responses` / `anthropic_messages` / `gemini_generate_content`（后端 `ApiProtocol` 常量）。**不是 Provider 的 `apiType`**（`openai` / `anthropic` / …），两套取值空间互不相通，用 `ApiTypeLabel` 查不到。迁移前的老行还可能是协议族写法，故前端按开放 string 解析、经 `logProtocolText()` 展示 |
| `statusCode` | int \| null | 上游 HTTP 响应码；null = 未抵达上游。**失败详情不再重复此码** |
| `streamed` | boolean | 是否流式请求 |
| `convId` | string \| null | 多轮会话 ID；点击可钻取过滤 |
| `latencyMs` | int \| null | 见上文；语义随 `streamed` 切换 |
| `clientIp` | string \| null | 调用方来源 IP，**点分字符串**（与 jsonb 原文一致） |
| `error` | `{ code, message }` \| null | 失败原因；`status === 'success'` 时为 null。`code` 是**开放取值**：平台自判的 `zero_output` / `billing_commit_failed` / `expired`、上游上报的码，以及上游没给码时后端拿 HTTP 状态顶上的纯数字串（`"500"`）。经 `logErrorCodeText()` 展示 |

`bill` 快照（按状态多态）：

`completed` — 仅 `id` + `status`：
```json
{
  "id": "BL20260531000001234",
  "status": "completed"
}
```

`reversed` — 额外嵌套 `reversal` 对象：
```json
{
  "id": "BL20260531000001234",
  "status": "reversed",
  "reversal": {
    "atUtc": 1757679001000,
    "by": "200000099",
    "code": "service_unavailable",
    "remark": "上游 502 仍扣费"
  }
}
```

#### `usage` / `cost` 形状对照表
| `billingType` | `usage` | `cost` |
| --- | --- | --- |
| `per_token` | `{ totalTokens, input: { tokens, cachedReadTokens, cachedWriteTokens, audioTokens }, output: { tokens, reasoningTokens, audioTokens } }` 全必填，未用为 0 | `{ input: { perMToken, amount, cachedRead, cachedWrite, … }, output: { … }, multiplierSnapshot, tierSnapshot, total }` |
| `per_call` | `{ calls }` | `{ pricePerCall, cachedPricePerCall, multiplierSnapshot, tierSnapshot, total }` |
| `per_image` | `{ tier: { size, quality }, count }` | `{ pricePerImage, multiplierSnapshot, tierSnapshot, total }` |
| `per_video` | `{ tier: { resolution }, seconds }` | `{ pricePerSecond, multiplierSnapshot, tierSnapshot, total }` |
| `per_audio_minute` | `{ minutes }` | `{ pricePerMinute, multiplierSnapshot, tierSnapshot, total }` |
| `per_character` | `{ characters }` | `{ pricePerKChar, multiplierSnapshot, tierSnapshot, total }` |

`per_token` 样本（成功）：

```json
{
  "id": "LG-1700000000001",
  "createAt": 1757677201000,
  "account": { "uid": "100000001", "iamUserUid": "200000050" },
  "modelName": "demux-gpt-4o",
  "vendorKey": "openai",
  "vendorPlug": "rong",
  "vendorModel": "gpt-4o-2024-11-20",
  "status": "success",
  "content": {
    "protocol": "openai_chat",
    "statusCode": 200,
    "streamed": true,
    "convId": "CV-050-a3",
    "latencyMs": 320,
    "clientIp": "203.0.113.7",
    "error": null
  },
  "billingType": "per_token",
  "usage": {
    "totalTokens": 787,
    "input": {
      "tokens": 482,
      "cachedReadTokens": 120,
      "cachedWriteTokens": 0,
      "audioTokens": 0
    },
    "output": {
      "tokens": 305,
      "reasoningTokens": 0,
      "audioTokens": 0
    }
  },
  "cost": {
    "input": {
      "perMToken": 25,
      "amount": 0.01205,
      "cachedRead": { "perMToken": 12.5, "amount": 0.0015 },
      "cachedWrite": { "perMToken": 31.25, "amount": 0 },
      "audio": { "perMToken": 0, "amount": 0 }
    },
    "output": {
      "perMToken": 75,
      "amount": 0.02288,
      "reasoning": { "perMToken": 0, "amount": 0 },
      "audio": { "perMToken": 0, "amount": 0 }
    },
    "multiplierSnapshot": 1.2,
    "tierSnapshot": 3,
    "total": 0.03523
  },
  "bill": {
    "id": "BL20260531000008821",
    "status": "completed"
  }
}

```

失败行：`status: "failure"`，`content.error` 有值，HTTP 码看 `content.statusCode`（未抵达上游时为 `null`）。

`topProviders` 排行行按 `vendorKey` 分组：`{ vendorKey, providerName, calls, errors, avgTokenLatency }`。
`providerName` 是服务端解析的展示名（VendorSlug 优先，回退 queue_group）；曾经的 `providerId` 已下线。

### `GET /demux/api/admin/logs/stats`
见 [`07-demuxai-overview.md`](./07-demuxai-overview.md)。
**目标**：`LogStats`（`totalCalls`、`buckets`、`topModels`、`topProviders`、`errorCodes` 等）。
**当前 BFF**：返回按日聚合的 `AiLogStatDto` 列表；HttpAdapter 临时包装为 `{ dailyRows }`，概览完整 KPI 需 BFF 扩展或 Mock。

### `POST /demux/api/admin/logs/{logId}/reverse`（规划）
Body（`ReverseLogInput`）：

```json
{
  "logId": "LG-1700000000001",
  "reasonCode": "service_unavailable",
  "remark": "上游 502 仍扣费"
}

```

成功（`ReverseLogResult`）：回写 `bill.status = reversed`，`actualAmount = 0`，钱包冲账。枚举见 `billReverseCodeValues`（与 [`05-billing-bills.md`](./05-billing-bills.md) 一致）。

`DemuxaiLogsHttpAdapter.reverse` 当前固定返回「驳回端点尚未实现」。

## 已删除模型 / 渠道的 UI
- **模型**：`modelName` 在 `DemuxaiModelPort` 查不到 → 表格与抽屉显示 `<已删除>` + 历史 `modelName`。
- **渠道**：`providerName` 查不到 → 显示 `#<providerId>`。
建议 BFF 对 Model / Vendor 做软删，便于历史 join。

## 交互流程
```

onMounted → loadDeps()（models / providers / accounts）
            fetchData()（list）
过滤 / 时间窗变化 → page=1 → list
行「查看」→ LogDetailDrawer
行「驳回」→ LogReverseDialog → reverse()（BFF 就绪后）
errorOnly → filter.errorOnly = true

```

KPI 卡片已迁至概览页（`OverviewView`）。

## 错误码
| code | 含义 |
| --- | --- |
| `validation` | 缺时间范围 / 跨度 > 7 天 / `pageSize > 100` / 无关联账单却驳回 |
| `forbidden` | 非 Admin |
| `not_found` | `logId` 不存在 |
| `conflict` | 账单已驳回 |
| `timeout` | 大查询超时 |
| `dependency_down` | 日志存储不可用 |

## `content.clientIp`
存在 `usage_logs.content` jsonb 的 `clientIp` 键里，点分字符串，网关经 ForwardedHeaders 还原为真实用户 IP，
下发时原样透传。前端不再做 uint32 ↔ 点分转换——旧的 `clientIpV4` 与 `formatIpv4` 已随本次折叠一并移除，
IPv6 也照字符串存放，不必另设列。

## 备注
- 概览与日志共用时间过滤；`stats` 应与 `list` 过滤语义一致。
- 厂家 usage 字段映射表仍适用 `per_token` 子维度，见 `log.types.ts` 注释。
- 激活码、供应商组文档：[`08-demuxai-providers.md`](./08-demuxai-providers.md)。
