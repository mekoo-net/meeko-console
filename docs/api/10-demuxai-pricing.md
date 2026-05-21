# 10 · 模型定价（DemuxAI Pricing）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/pricing` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/PricingView.vue`（Tab：**已配置** / **未配置**） |
| 布局 | 与供应商组相同的左右分栏：`ProviderGroupSidebar` + 定价表 |
| 对话框 | `src/features/demuxai/components/PricingEditDialog.vue` |
| Port | `DemuxaiPricingPort` + `DemuxaiCatalogPort` + `DemuxaiModelRoutePort` + `DemuxaiModelPort`（过渡） |

## 标识约定

| 字段 | 语义 |
| --- | --- |
| `id` | 实体主键（如定价行 `PRC-*`、模型路由 `MR-*`、Vendor `1001`） |
| `uid` | **仅 userId**：账户 `account.uid`、IAM `iamUserUid`、操作人 `updatedBy.iamUserUid` 等 |

与 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 一致；勿用 `uid` 表示定价 / 路由 / Vendor 行主键。

## 业务定义

> 模型定价与对外模型名 **1..1** —— 每个 **`modelId`**（= 模型路由 **`alias`**）一条现行价记录。
>
> **按供应商组筛选**：左侧选 `queueGroup`（或「全部」）时，仅展示 `alias` 所属 `channelKey` 匹配的路由及其定价。
>
> **discriminated union**：顶层 `billingType` 判别，`pricing` 嵌套形状随类型变化（六种计费类型不变，详见下文）。
>
> 金额单位、`multiplier`、`tierMultipliers`、`effectiveFromUtc`、历史价只增不改等约定与旧版一致。

### `modelId` 来源（2026-05）

| 来源 | 说明 |
| --- | --- |
| **主** | `ModelRoute.alias`（`status === 'enabled'`） |
| **过渡** | `DemuxaiModelPort.list` 中的 `modelId`（无路由时仍可出现） |

「未配置」Tab：

```ts
// 1) 所有 enabled 路由的 alias 减去已定价 modelId
// 2) 再合并 legacy models（按 channel 过滤）
// 未配置行用 modelFromAlias() 合成最小 Model 占位，点开即 upsert

```

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 | 投影 |
| --- | --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/demuxai/api/admin/pricing` | 行级（含 `summary` 或完整 `pricing`，以实现为准） |
| 按 modelId 取现行价 | `get(modelId)` | GET | `/demuxai/api/admin/pricing/{modelId}` | 全字段 |
| 历史价 | `listHistory` | GET | `/demuxai/api/admin/model-routes/{modelId}/history` 等 | **前端 Port 有定义；BFF 待接** |
| upsert | `upsert(input)` | PUT | `/demuxai/api/admin/pricing/{modelId}` | 全字段 |
| 删除 | `delete(modelId)` | DELETE | `/demuxai/api/admin/pricing/{modelId}?groupCode=default` | — |
| 供应商组字典 | `DemuxaiCatalogPort.listProviderGroups` | GET | 见 [`08`](./08-demuxai-providers.md) | 左侧栏 |
| 别名列表 | `DemuxaiModelRoutePort.list` | GET | 见 [`08`](./08-demuxai-providers.md) | 筛选 / 未配置 |

> DemuxAi 响应经 **`requestDemuxAi`** 解包 `{ success, data }`。
查询参数（列表）：`p`、`pageSize`、`keyword`（HttpAdapter）。

## 请求 / 响应
### 列表 `GET /demuxai/api/admin/pricing`
参数：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `p` | int | 是 | 页码，从 1 起 |
| `pageSize` | int | 是 | 默认 20 |
| `keyword` | string | 否 | 模糊匹配 `modelId`（alias） |
响应示例（**轻投影**推荐；完整 `pricing` 见详情）：

```json
{
  "items": [
    {
      "id": "PRC-001",
      "modelId": "demux-gpt-4o",
      "billingType": "per_token",
      "summary": {
        "inputPerMToken": 25,
        "outputPerMToken": 75
      },
      "multiplier": 1.2,
      "currency": "CNY",
      "tierMultipliers": { "3": 0.9, "5": 0.7 },
      "effectiveFromUtc": "2025-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-01T00:00:00Z",
      "updatedBy": { "iamUserUid": "200000099" }
    }
  ],
  "total": 12
}

```

| 字段 | 说明 |
| --- | --- |
| `id` | 定价行主键（如 `PRC-001`） |
| `modelId` | = 模型路由 `alias` |
| `updatedBy` | 可选 `{ iamUserUid }`，操作人 IAM userId |

`summary` 按 `billingType` 形状见下表（与实现一致）。

#### `summary` 形状对照表
| `billingType` | `summary` 形状 |
| --- | --- |
| `per_token` | `{ inputPerMToken, outputPerMToken }` |
| `per_call` | `{ pricePerCall }` |
| `per_image` | `{ tierCount, minPricePerImage, maxPricePerImage }` |
| `per_video` | `{ tierCount, minPricePerSecond, maxPricePerSecond }` |
| `per_audio_minute` | `{ pricePerMinute }` |
| `per_character` | `{ pricePerKChar }` |

### `billingType` 与 `pricing` 形状
六种计费类型、`per_token` input/output 嵌套、cache 5m/1h、计费公式、厂家 usage 对齐等**不变**，详见 `src/features/demuxai/model/pricing.types.ts` 与 git 历史版本；BFF 校验规则：
- `pricing` 形状必须严格匹配 `billingType`；
- `per_image` 唯一键 `(size, quality)`；`per_video` 唯一键 `resolution`；
- `multiplier > 0`；`tierMultipliers` 值均 > 0。

### 现行价 `GET /demuxai/api/admin/pricing/{modelId}`
返回 `effectiveFromUtc <= now()` 的最新一条（BFF 约定）。

### upsert `PUT /demuxai/api/admin/pricing/{modelId}`
Body 为 `UpsertPricingInput`（含 `modelId`、`billingType`、`pricing`、`multiplier`、`currency`、`tierMultipliers`、`effectiveFromUtc`）。

`per_token` 示例（单位：元 / 1M tokens）：

```json
{
  "modelId": "demux-gpt-4o",
  "billingType": "per_token",
  "pricing": {
    "input": { "perMToken": 25, "cachedRead": 6.25 },
    "output": { "perMToken": 75 }
  },
  "multiplier": 1.2,
  "currency": "CNY",
  "tierMultipliers": { "3": 0.9, "5": 0.7 },
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}

```

### 删除 `DELETE /demuxai/api/admin/pricing/{modelId}`
Query：`groupCode`（HttpAdapter 默认 `default`）。

## 交互流程

```

onMounted → listProviderGroups + loadAllPricing + listModels + listModelRoutes
左侧切换 queueGroup → 本地过滤 priced / unconfigured（matchesChannel）
编辑/新建 → PricingEditDialog → upsert → refresh
删除 → confirmDanger → delete(modelId)

```

- **已配置** Tab：分页展示 `filteredPriced`。
- **未配置** Tab：由 `modelRoutes`（enabled）+ legacy `models` 减去已配置 `modelId` 派生，前端分页。

## 错误码

| code | 含义 |
| --- | --- |
| `validation` | `pricing` 与 `billingType` 不匹配；`tiers[]` 重复键 |
| `not_found` | `modelId` 无对应模型 / 路由 |
| `conflict` | `effectiveFromUtc` 时间点冲突 |

## 备注

- 接入真 BFF 时建议校验 `effectiveFromUtc` 不早于 `now() - 1min`。
- 修改历史价：新增一条 `effectiveFromUtc=now` 的记录，勿 update 旧行。
- 日志扣费快照形状见 [`11-demuxai-logs.md`](./11-demuxai-logs.md)。
