# 09 · 模型别名与元数据（DemuxAI Models）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由（独立页） | `/demux/models` → **重定向**至 [`/demux/providers`](./08-demuxai-providers.md) |
| 运营主路径 | 在 **供应商组** 页的上游模型抽屉内维护 **对外别名**（`ModelRoute`） |
| 定价 / 未配置 | [`10-demuxai-pricing.md`](./10-demuxai-pricing.md) 按 `alias` 管理 |
| Port（遗留） | `DemuxaiModelPort` → `/demux/api/admin/models` |
| Port（主） | `DemuxaiModelRoutePort` → 见 [`08-demuxai-providers.md`](./08-demuxai-providers.md) § 模型路由 |

> **标识**：`ModelMeta` / 过渡 `Model` 行主键 JSON 字段为 **`id`**；`uid` 仅用于账户 / IAM（见 [`11-demuxai-logs.md`](./11-demuxai-logs.md)）。

## 业务定义

> **2026-05 架构收敛**：
>
> 1. **对外模型名** = 模型路由的 **`alias`**（用户请求 `model`、计费 `modelId`、日志 `modelName` 通常一致）。
> 2. **调度绑定** = `channelKey`（QueueGroup）+ `upstreamModelId`，在供应商组页维护。
> 3. **平台 Model 表**（`DemuxaiModelPort`）与旧版「mapping 驱动自动建删 Model」流程**降级为过渡**：定价页「未配置」Tab 仍会合并 `models` 与 `modelRoutes`，BFF 真接后逐步以 **`ModelMeta`** 为准。

### 与旧文档的差异（勿再按此实现 BFF）

| 旧约定 | 现状态 |
| --- | --- |
| `modelId` = `displayName` = mapping 驱动生命周期 | 由 **`ModelRoute.alias`** + 运营显式 CRUD 取代 |
| 独立 `ModelListView` 编辑元数据 | 路由重定向；元数据走 `ModelMeta` API（可选） |
| `capabilities[]` 含 `streaming` / `function_call` | 前端 `Model` zod 仍保留 `supportsStreaming` / `supportsFunctionCall` boolean（过渡） |
| `limits: { contextTokens, outputTokens }` | 前端改为顶层 `maxContextTokens` / `maxOutputTokens` |

---

## 一、模型路由（主）

完整 CRUD 见 [`08-demuxai-providers.md`](./08-demuxai-providers.md)。

核心类型：`src/features/demux/model/modelRoute.types.ts`。

```ts
// 用户请求体 model 字段 / 计费主键
alias: string;
channelKey: string;      // = ProviderGroup.queueGroup
upstreamModelId: string;
weight: number;
priority: number;
status: 'enabled' | 'disabled' | 'hidden';

```

同一 `alias` 可有多条记录（不同上游或权重）；启用态路由参与定价页「未配置」推导。
---
## 二、平台 Model 元数据（遗留 Port）
> BFF：`ModelAdminController`，`/demux/api/admin/models`。契约见 `Meeko.Contracts` / `ModelMetaAdminDto`。

### 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/demux/api/admin/models` 或 `.../search?keyword=` |
| 详情 | `get(id)` | GET | `/demux/api/admin/models/{id}` |
| 编辑 | `update(id, payload)` | PUT | `/demux/api/admin/models`（body 含 `id`） |
查询参数（BFF）：`p`、`size`；可选 `vendorId` 过滤。

### 列表项（BFF 目标形状 · `ModelMetaAdminDto`）

```json
{
  "id": "42",
  "modelName": "gpt-4o",
  "vendorName": "OpenAI 主线",
  "displayName": "GPT-4o 旗舰",
  "description": "…",
  "endpointTypes": ["chat"],
  "status": "active",
  "tags": ["flagship"],
  "createdAtUtc": "2024-09-01T00:00:00Z",
  "updatedAtUtc": "2025-09-01T00:00:00Z"
}

```

| 字段 | 说明 |
| --- | --- |
| `modelName` | 技术模型名（上游侧）。 |
| `vendorName` | 关联 Vendor **名称**（已移除 vendor `code`）。 |
| `displayName` | 控制台展示名（可与路由 `alias` 不同）。 |
| `endpointTypes` | 端点类型枚举数组。 |
| `status` | `active` / `disabled` 等。 |

### 前端 `Model` 类型（Mock / 适配层）
控制台 zod 仍使用简化 `Model`（`src/features/demux/model/model.types.ts`），供定价页与日志字典：

```json
{
  "id": "MD-001",
  "modelId": "demux-gpt-4o",
  "displayName": "demux-gpt-4o",
  "family": "gpt",
  "capabilities": ["chat", "tool_use", "vision"],
  "visibleMinTier": 1,
  "maxContextTokens": 128000,
  "maxOutputTokens": 16384,
  "supportsStreaming": true,
  "supportsFunctionCall": false,
  "description": null,
  "createdAtUtc": "2024-09-01T00:00:00Z",
  "updatedAtUtc": "2025-09-01T00:00:00Z"
}

```

`UpdateModelInput`：上述字段均可选 PATCH；**不可改** `modelId`。

### 「承载于」反向派生（仅遗留 Mock / 旧 Provider 模型）
若仍加载全量 `Provider`（含 `modelMappings`），前端可按：
```ts
provider.modelMappings[].displayName === model.modelId

```

聚合「承载于哪些 Vendor」。新架构下应改为：**别名 → `ModelRoute` → `channelKey` + `upstreamModelId`**。

## 交互流程

```

主路径：/demux/providers → 选组 → 编辑上游模型 → 别名表（ModelRoute）
定价：/demux/pricing → 未配置 Tab 来自 enabled routes 的 alias \ priced modelIds
日志/概览：modelName 显示 alias；字典可仍用 DemuxaiModelPort.list（过渡）

```

## 错误码
| HTTP / 信封 | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段非法 |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | `id` 不存在 |
| 409 | `conflict` | 并发编辑 |

## 备注
- 独立模型列表视图 `ModelListView.vue` 仍保留于仓库，路由已重定向，勿再扩展。
- 枚举：`modelFamilyValues`、`modelCapabilityValues`（`enums.ts`）。
