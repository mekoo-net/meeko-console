# 08 · 供应商组与模型别名（DemuxAI Providers）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/providers`（**主入口**） |
| 重定向 | `/demuxai/models`、`/demuxai/model-routes`、`/demuxai/channels` → 本页 |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/ProviderGroupListView.vue` |
| 布局 | `ProviderWorkspaceLayout` + `ProviderGroupSidebar` + `ProviderDetailPanel` |
| 子功能 | 上游模型表 / `ProviderUpstreamModelEditDrawer`（维护对外别名） / `ModelRouteEditDrawer` |
| Port | `DemuxaiCatalogPort` + `DemuxaiModelRoutePort` |

## 标识约定

| 字段 | 语义 |
| --- | --- |
| `id` | 实体主键（`ModelRoute.id`、`Vendor.id` 等） |
| `uid` | **仅 userId**（账户 / IAM，见 [`11-demuxai-logs.md`](./11-demuxai-logs.md)） |

REST 路径参数写 `{id}`；前端 Port 方法参数名可能仍叫 `uid`，映射到 JSON `id`。

## 业务定义

> **新架构（控制台主路径）**：运营对象是 **供应商组（ProviderGroup）**，不是旧版「凭据 + providerModels + modelMappings」单体 Provider。
>
> | 概念 | 含义 | 与网关对齐 |
> | --- | --- | --- |
> | **供应商组** | `queueGroup`（如 `kiro`、`gemini`、`codex`） | demuxai-api `QueueGroup` / NATS `gateway.chat.{queueGroup}` |
> | **上游模型** | 组内技术注册名 `upstreamModelId` | 网关实例上报的模型 ID |
> | **对外别名（模型路由）** | 用户请求体 `model` 字段 / 计费主键 `alias` | `ModelRoute`：`alias` → `channelKey` + `upstreamModelId` |
>
> - 供应商组**仅来自网关注册同步**（不可手工新建组）；可手工**登记**组内上游模型（`source=manual`）。
> - 同一 `alias` 可有多条路由（`weight` / `priority` 加权分流）；定价在 [`10-demuxai-pricing.md`](./10-demuxai-pricing.md) 按 `modelId`（= `alias`）维护。
> - 删除上游模型前须先删掉其下全部别名（前端拦截）。
> **遗留 Vendor 接口**（`DemuxaiProviderPort`）：DemuxAi 域内称 **Vendor**，仅保留 `name` + `status`，供概览 / 日志的字典 join 与过渡兼容；**不再**承载上游模型子树。见本文 § 遗留 Vendor。

## 接口清单

### 供应商组目录（`DemuxaiCatalogPort`）

| 业务动作 | Port 方法 | HTTP（规划） | 说明 |
| --- | --- | --- | --- |
| 列出全部组 | `listProviderGroups()` | `GET /demuxai/api/admin/catalog/provider-groups` | 左侧栏数据源 |
| 从网关同步 | `syncFromGateway()` | `POST /demuxai/api/admin/catalog/sync` | 合并网关注册 + 保留 `manual` 登记 |
| 组内上游模型列表 | `listUpstreamModels(queueGroup)` | `GET .../provider-groups/{queueGroup}/upstream-models` | 右侧主表 |
| 手工添加上游模型 | `addUpstreamModel(input)` | `POST .../upstream-models` | `source=manual` |
| 移除手工上游模型 | `removeUpstreamModel(qg, id)` | `DELETE .../upstream-models/{upstreamModelId}` | 仅 `manual` 可删 |

> **接入状态**：`DemuxaiCatalogHttpAdapter` 当前返回 `upstream` 错误；请用 **`VITE_USE_MOCK=true`** 预览 UI。BFF 应对齐 demuxai-api 集群状态 / Provider 注册表。

### 模型路由（`DemuxaiModelRoutePort`）

| 业务动作 | Port 方法 | HTTP（规划） | 说明 |
| --- | --- | --- | --- |
| 列表 | `list({ page, pageSize, filter })` | `GET /demuxai/api/admin/model-routes` | `filter.channelKey` = `queueGroup` |
| 详情 | `get(id)` | `GET /demuxai/api/admin/model-routes/{id}` | 编辑回填 |
| 新建 | `create(input)` | `POST /demuxai/api/admin/model-routes` | |
| 更新 | `update(id, input)` | `PUT /demuxai/api/admin/model-routes/{id}` | |
| 删除 | `delete(id)` | `DELETE /demuxai/api/admin/model-routes/{id}` | |
| 启停 | `setStatus(id, status)` | `PATCH /demuxai/api/admin/model-routes/{id}/status` | `enabled` / `disabled` / `hidden` |

> **接入状态**：`DemuxaiModelRouteHttpAdapter` 同上，Mock 可用。

## 请求 / 响应

### `ProviderGroup`

```json
{
  "queueGroup": "gemini",
  "displayName": "Gemini",
  "source": "gateway",
  "status": "active",
  "instanceCount": 3,
  "upstreamModelCount": 12,
  "notes": null,
  "syncedAtUtc": "2025-09-12T08:00:00Z",
  "createdAtUtc": "2024-09-01T00:00:00Z",
  "updatedAtUtc": "2025-09-12T08:00:00Z"
}

```

| 字段 | 说明 |
| --- | --- |
| `queueGroup` | 全局唯一 QueueGroup；创建后不可改。 |
| `displayName` | 控制台展示名。 |
| `source` | `gateway`（同步）/ `manual`（仅上游模型行可能为 manual）。 |
| `status` | `active` / `disabled`。 |
| `instanceCount` | 网关注册健康实例数。 |
| `upstreamModelCount` | 组内上游模型条数（BFF 或同步后重算）。 |
枚举：`providerCatalogSourceValues`、`providerGroupStatusValues`（`src/features/demuxai/model/enums.ts`）。

### `ProviderUpstreamModel`

```json
{
  "queueGroup": "gemini",
  "upstreamModelId": "gemini-2.5-pro",
  "label": "Gemini 2.5 Pro",
  "source": "gateway"
}

```

| 字段 | 说明 |
| --- | --- |
| `upstreamModelId` | 上游 HTTP 请求体 `model` 技术名。 |
| `label` | 可选展示名。 |
| `source` | `gateway` / `manual`；仅 `manual` 可在 UI 删除。 |

### `POST .../catalog/sync` → `SyncProviderCatalogResult`

```json
{
  "providerCount": 6,
  "modelCount": 48,
  "syncedAtUtc": "2025-09-12T08:00:00Z"
}

```

同步策略（与 Mock 一致）：
1. 用网关快照**覆盖** `source=gateway` 的组与模型；
2. **保留** `source=manual` 的手工登记；
3. 重算各组 `upstreamModelCount`。

### `ModelRoute`

```json
{
  "id": "MR-001",
  "alias": "demux-gemini-2.5-pro",
  "channelKey": "gemini",
  "upstreamModelId": "gemini-2.5-pro",
  "weight": 100,
  "priority": 100,
  "status": "enabled",
  "notes": null,
  "createdAtUtc": "2025-09-01T00:00:00Z",
  "updatedAtUtc": "2025-09-12T08:00:00Z"
}

```

| 字段 | 说明 |
| --- | --- |
| `id` | 路由行主键（如 `MR-001`） |
| `alias` | 用户可见模型名；= 计费 / 日志 `modelName`；**不可与业务随意改名**（改价 / 日志 join）。 |
| `channelKey` | = 所属 `queueGroup`。 |
| `upstreamModelId` | 绑定的上游注册名。 |
| `weight` | 同 `alias` 多路由时的相对权重（默认 100）。 |
| `priority` | 调度优先级（0..999，默认 100）。 |
| `status` | `enabled` / `disabled` / `hidden`。 |

#### 新建 `CreateModelRouteInput`

```json
{
  "alias": "demux-gemini-2.5-pro",
  "channelKey": "gemini",
  "upstreamModelId": "gemini-2.5-pro",
  "weight": 100,
  "priority": 100,
  "status": "enabled",
  "notes": null
}

```

列表过滤 `ListModelRoutesFilter`：`keyword`、`channelKey`（`'all'` 或具体组）、`status`。
---
## 遗留 Vendor（`DemuxaiProviderPort`）
> 路径前缀：`/demuxai/api/admin/providers`。BFF 实体为 **Vendor**（`VendorDto`），前端类型仍称 `Provider` 以兼容日志 `providerId`。
| 业务动作 | Port 方法 | HTTP | 说明 |
| --- | --- | --- | --- |
| 列表 | `list` | `GET /demuxai/api/admin/providers` | 无查询过滤；返回全量 |
| 详情 | `get(id)` | `GET /demuxai/api/admin/providers/{id}` | |
| 新建 | `create` | `POST /demuxai/api/admin/providers` | body `{ name, status? }` |
| 更新 | `update` | `PUT /demuxai/api/admin/providers/{id}` | 当前仅 `name` |
| 删除 | `delete` | `DELETE /demuxai/api/admin/providers/{id}` | |
| 启停 | `setStatus` | `PUT`（复用 upsert） | BFF：`PATCH .../status` **未实现** |
| 连通测试 | `test` | `POST .../test` | **未实现** |
| 拉上游模型列表 | `fetchUpstreamModels` | `POST .../upstream-models` | **未实现** |

### `VendorDto` / 列表项

```json
{
  "id": "1001",
  "name": "OpenAI 主线",
  "status": "active",
  "createdAtUtc": "2024-09-01T00:00:00Z",
  "updatedAtUtc": "2025-09-12T03:21:08Z"
}

```

- `status`：`active` ↔ 前端 `enabled`，`disabled` ↔ `disabled`。
- 已移除 **`code` / `displayName` 双字段**：全局唯一标识改为 **`name`**（见迁移 `VendorNameInsteadOfDisplayName`）。
- HttpAdapter 将 JSON `id`（int 字符串）映射为前端 `Provider.id` 供日志 `providerId` join；`providerModels` / `modelMappings` 在真接 BFF 时为空数组。

> 旧文档中的 `connection` / `modelMappings` / 轻投影列表描述适用于 **已废弃的单页 Provider 编辑器**（`ProviderListView` / `ProviderEditDrawer`），不再对应当前主界面。

## 交互流程

```

onMounted → syncFromGateway({ silent }) → listProviderGroups
          → 可选：每 60s 自动同步（开关）
选中左侧组 → listUpstreamModels + list model-routes（channelKey=queueGroup）
「添加上游模型」→ addUpstreamModel（manual）
行「编辑」→ ProviderUpstreamModelEditDrawer → 别名 CRUD（ModelRoute port）
移除 manual 上游模型 → 须先无绑定别名

```

定价跳转：[`10-demuxai-pricing.md`](./10-demuxai-pricing.md)（按组筛选 `alias`）。

## 错误码

| code | 含义 |
| --- | --- |
| `validation` | 别名 / 上游 ID 为空；删除仍有关联路由 |
| `not_found` | `queueGroup` / `id` 不存在 |
| `conflict` | `alias` 唯一性（BFF 约定） |
| `upstream` | 目录或路由 API 未接入（HTTP 适配器占位） |

## 备注

- 模型元数据（`ModelMeta`）与旧版「平台 Model 列表」见 [`09-demuxai-models.md`](./09-demuxai-models.md)。
- 激活码见路由 `/demuxai/redemption`（`DemuxaiRedemptionPort`，`/demuxai/api/redemption`）。
