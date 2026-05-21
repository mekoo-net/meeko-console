# 11 · 调用日志（DemuxAI Logs）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/logs` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/LogQueryView.vue` |
| 抽屉 | `LogDetailDrawer.vue` · `LogReverseDialog.vue` |
| Port | `DemuxaiLogsPort` + 字典：`DemuxaiModelPort` · `DemuxaiProviderPort` · `AccountAdminPort` |

## 业务定义

> 调用日志属于**数据面**（ClickHouse / PG 用量表 / 独立聚合），与控制面目录解耦。
>
> 设计要点（与 `src/features/demuxai/model/log.types.ts` 一致）：
>
> - `id`：本条日志主键（snowflake）。**`uid` 在本系统专指 userId**（见 `account.uid` / `account.iamUserUid`），不用于日志行主键。
> - **`createAt`**：调用发生时间（UTC ISO8601）。类型注释中保留与 `occurredAtUtc` 的对应关系；BFF 序列化建议仍用 `*AtUtc` 命名时在适配层映射。
> - **`account: { uid, iamUserUid }`**：主账户 + IAM 子账户（扣费主体 vs 操作者）。
> - **`providerId`**：Vendor **int 主键**（非 string UID）；展示名由前端 join `DemuxaiProviderPort.list`。
> - **`modelName`**：用户请求体 `model`（通常 = 模型路由 `alias`）。
> - **`convId`**：多轮会话 ID。
> - **`billingType`**：判别字段；`usage` / `cost` 形状见下表。
> - **`tokenLatency`**（ms，`null` 表示失败）：`streamed: true` → TTFT；`streamed: false` → 端到端总耗时。
> - **`success` + `error`**：二元成败；失败必有 `error: { code, message, httpStatus }`。
> - **`bill`**（可选）：关联钱包账单快照；`status === 'reversed'` 时展示已驳回；支持 `DemuxaiLogsPort.reverse`（BFF **待接**）。
> - 不存 prompt / completion 原文。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/demuxai/api/admin/logs` |
| 统计（与 list 同 filter 子集） | `stats(filter)` | GET | `/demuxai/api/admin/logs/stats` |
| 驳回账单 | `reverse(input)` | POST | `/demuxai/api/admin/logs/{logId}/reverse`（**规划，适配器未实现**） |
| Model 字典 | `DemuxaiModelPort.list` | GET | `/demuxai/api/admin/models` |
| Vendor 字典 | `DemuxaiProviderPort.list` | GET | `/demuxai/api/admin/providers` |
| Account 字典 | `AccountAdminPort.listAccounts` | GET | `/accounts` |

> 响应经 **`requestDemuxAi`** → `{ success, data }`。

## 请求 / 响应

### `GET /demuxai/api/admin/logs`
参数：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `p` | int | 是 | 页码，从 1 起（BFF）；前端 Port 仍传 `page` / `pageSize` 由适配器映射 |
| `pageSize` | int | 是 | ≤ 100 |
| `fromUtc` | ISO8601 | **是** | UI 必传，最长 7 天 |
| `toUtc` | ISO8601 | **是** | |
| `accountUid` | string | 否 | = `account.uid`（主账户 userId） |
| `tokenId` / `iamUserUid` | string | 否 | `tokenId` = sk- 令牌实体主键；`iamUserUid` = `account.iamUserUid`（IAM userId）。BFF 过渡期可能仍接受 `tokenUid` 查询参数名。 |
| `modelName` | string | 否 | 模糊匹配 |
| `groupCode` | string | 否 | BFF 已有；可对应模型组 / 路由分组（接入约定） |
| `status` | string | 否 | BFF 用量状态过滤 |
| `providerId` | int | 否 | 前端 filter 有；BFF 待扩展 |
| `apiType` | enum | 否 | 前端 filter |
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
| `createAt` | ISO8601 | 调用时间 |
| `account` | `{ uid, iamUserUid }` | 主账户 `uid` + IAM `iamUserUid`（均为 userId） |
| `convId` | string | |
| `modelName` | string | 对外模型名 |
| `providerId` | int | Vendor 主键 |
| `apiType` | enum | 协议族 |
| `tokenLatency` | int \| null | 见上文 |
| `success` | boolean | |
| `error` | object \| null | 失败时必填 |
| `clientIpV4` | int \| null | 调用方 IPv4，**网络字节序 uint32**（非点分字符串）；展示时格式化为 `a.b.c.d` |
| `streamed` | boolean | 是否流式请求 |
| `bill` | object \| null | 见下 |

`bill` 快照：
```json
{
  "id": "BL-001",
  "status": "completed",
  "reversedAtUtc": null,
  "reversedBy": null,
  "reversedCode": null,
  "reversedRemark": null
}

```

#### `usage` / `cost` 形状对照表
| `billingType` | `usage` | `cost` |
| --- | --- | --- |
| `per_token` | `{ totalTokens, input: { tokens, cachedReadTokens, cachedWrite5mTokens, cachedWrite1hTokens, audioTokens }, output: { tokens, reasoningTokens, audioTokens } }` 全必填，未用为 0 | `{ input: { perMToken, amount, cachedRead, … }, output: { … }, multiplierSnapshot, tierSnapshot, total }` |
| `per_call` | `{ calls }` | `{ pricePerCall, amount, multiplierSnapshot, tierSnapshot, total }` |
| `per_image` | `{ tier: { size, quality }, count }` | `{ pricePerImage, amount, multiplierSnapshot, tierSnapshot, total }` |
| `per_video` | `{ tier: { resolution }, seconds }` | `{ pricePerSecond, amount, …, total }` |
| `per_audio_minute` | `{ minutes }` | `{ pricePerMinute, amount, …, total }` |
| `per_character` | `{ characters }` | `{ pricePerKChar, amount, …, total }` |

`per_token` 样本（成功）：

```json
{
  "id": "LG-1700000000001",
  "createAt": "2025-09-12T11:00:01Z",
  "account": { "uid": "100000001", "iamUserUid": "200000050" },
  "convId": "CV-050-a3",
  "modelName": "demux-gpt-4o",
  "providerId": 1001,
  "apiType": "openai",
  "tokenLatency": 320,
  "streamed": true,
  "clientIpV4": 3401195783,
  "success": true,
  "error": null,
  "billingType": "per_token",
  "usage": {
    "totalTokens": 787,
    "input": {
      "tokens": 482,
      "cachedReadTokens": 120,
      "cachedWrite5mTokens": 0,
      "cachedWrite1hTokens": 0,
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
      "cachedWrite5m": { "perMToken": 31.25, "amount": 0 },
      "cachedWrite1h": { "perMToken": 50, "amount": 0 },
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
    "id": "BL-8821",
    "status": "completed",
    "reversedAtUtc": null,
    "reversedBy": null,
    "reversedCode": null
  }
}

```

失败行：`tokenLatency: null`，`success: false`，`error` 含 `httpStatus`（无上游时为 `0`）。

> 旧版文档中的 `occurredAtUtc`、`provider: { id, name }`、`latency: { ms, kind }`、`request: { apiType, ip, streamed }` 嵌套尚未在控制台 zod 落地；若 BFF 返回嵌套形，应在 **HttpAdapter 映射**为当前扁平字段。

### `GET /demuxai/api/admin/logs/stats`
见 [`07-demuxai-overview.md`](./07-demuxai-overview.md)。
**目标**：`LogStats`（`totalCalls`、`buckets`、`topModels`、`topProviders`、`errorCodes` 等）。
**当前 BFF**：返回按日聚合的 `AiLogStatDto` 列表；HttpAdapter 临时包装为 `{ dailyRows }`，概览完整 KPI 需 BFF 扩展或 Mock。

### `POST /demuxai/api/admin/logs/{logId}/reverse`（规划）
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

## `clientIpV4` 存储（推荐）
| 层 | 建议 |
| --- | --- |
| 列类型 | PostgreSQL `integer`（4 字节）或 `bigint`；勿用 `varchar` 存点分串 |
| 编码 | **网络字节序** uint32：`203.0.113.7` → `3401195783`（`(a<<24)\|(b<<16)\|(c<<8)\|d`） |
| 查询 | 网段 `203.0.113.0/24` → `WHERE client_ip_v4 BETWEEN lo AND hi`；索引友好 |
| API | JSON number；控制台展示再 `formatIpv4` |
| IPv6 | 另列 `client_ip_v6`（`bytea` / `inet`）或仅存 v4；勿强行塞进 uint32 |
当前 DemuxAI 表 `client_ip varchar(64)`、`AiUsageLogDto.ClientIp` 仍为字符串；BFF 映射到 `clientIpV4` 时由服务端 `parse` 一次即可。

## 备注
- 概览与日志共用时间过滤；`stats` 应与 `list` 过滤语义一致。
- 厂家 usage 字段映射表仍适用 `per_token` 子维度，见 `log.types.ts` 注释。
- 激活码、供应商组文档：[`08-demuxai-providers.md`](./08-demuxai-providers.md)。
