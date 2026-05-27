# 08 · 供应商组与模型别名（DemuxAI Providers）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由（已接入） | `/demuxai/providers`（主入口） |
| 路由（接入流程） | `/demuxai/catalog/import` |
| 重定向 | `/demuxai/models`、`/demuxai/model-routes`、`/demuxai/channels` → 已接入 |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/ProviderGroupListView.vue`、`CatalogImportView.vue` |
| 布局 | `ProviderWorkspaceLayout` + `ProviderGroupSidebar` + `ProviderDetailPanel` |
| Port | `DemuxaiCatalogPort` + `DemuxaiModelRoutePort` |

## 标识约定

| 字段 | 语义 |
| --- | --- |
| `queueGroup` | 供应商组逻辑名（如 `kiro` / `codex` / `gemini`） |
| `upstreamModelId` | 上游 HTTP 请求体 `model` 技术名（如 `claude-sonnet-4-6`） |
| `alias` | 用户可见模型名（ModelRoute 主键，= 计费 / 日志 `modelName`） |
| `uid` | **仅 userId**（账户 / IAM，见 [`11-demuxai-logs.md`](./11-demuxai-logs.md)） |

REST 路径参数写 `{queueGroup}` / `{id}`；前端 Port 方法参数名可能仍叫 `uid`，映射到 JSON `id`。

## 业务定义

> **责任划分**：控制面（DemuxAi）只维护「**已审批**」的目录（QueueGroup × UpstreamModel × Alias × Price）；
> 不维护 LLM 网关实例存活、不做路由 / 健康检查 / 熔断。当上游模型不可达时，由 LLM 网关返错。

| 概念 | 含义 | 与网关对齐 |
| --- | --- | --- |
| **供应商组** | `queueGroup`（如 `kiro`、`gemini`、`codex`） | demuxai-api `QueueGroup` / NATS `gateway.chat.{queueGroup}` |
| **上游模型** | 组内技术注册名 `upstreamModelId` | 网关本地配置/反代识别到的模型 ID |
| **对外别名（模型路由）** | 用户请求体 `model` 字段 / 计费主键 `alias` | `ModelRoute`：`alias` → `channelKey` + `upstreamModelId` |

### 双向 pull，无 push

```
[Admin Console] ── admin 点「拉取」 ──▶ [DemuxAi 控制面] ── HTTP GET ──▶ [LLM 网关] (报告 catalog)
                                          │                                                                                 
                                          │ ← admin 勾选模型「创建」 ──── HTTP POST ──── [Admin Console]                       
                                          │                                                                                 
                                          │ ← MagicOnion 增量快照 ────────────────── [LLM 网关] (路由时拉)                      
                                          ▼                                                                                 
                                      [入库 PG]                                                                              
```

两条 pull、零 push：

- **DemuxAi ← Gateway**：admin 触发时拉取，**不**轮询、**不**心跳。
- **Gateway → DemuxAi**：网关按 `ILlmCatalogService.GetRatioSnapshotAsync` / `GetModelSnapshotAsync` 增量拉路由 + 倍率。

### 调用门控（fail-closed 三态机）

```
未入库              ─ admin 通过「接入供应商」勾选 → ─▶ 已入库 / 未定价 ─ admin 配 RatioEntry ─▶ 已入库 / 已定价
（不可调用）                                            （不可调用：ratio_missing）         （可调用）
```

- 用户请求传入 `alias` → DemuxAi 路由表查 `alias → (queueGroup, upstreamModelId)`，缺失返 `alias_not_found`。
- 检查目标模型已入库（在 `model_meta` 表），缺失返 `model_unavailable`。
- 检查 (token.groupCode, alias) 有 `RatioEntry`，缺失返 `ratio_missing`。
- 三个都过才进入 `QuotaMeter.Reserve`。

## 接口清单

### 供应商组目录（`DemuxaiCatalogPort`）

| 业务动作 | Port 方法 | HTTP | 说明 |
| --- | --- | --- | --- |
| 列出已入库组 | `listProviderGroups()` | `GET /demuxai/api/admin/providers` | 左侧栏数据源 |
| 列出组内已入库模型 | `listUpstreamModels(queueGroup)` | `GET /demuxai/api/admin/providers/{queueGroup}/models` | 右侧主表 |
| 从网关拉取发现源 | `discoverFromGateway()` | `GET /demuxai/api/admin/providers/discovery` | 接入页拉取；返回 `groups[]` 含 `alreadyImported` |
| 批量入库 | `importProviderGroup(input)` | `POST /demuxai/api/admin/providers/import` | 幂等：组已存在则追加模型 |
| 删除供应商组 | `deleteProviderGroup(qg)` | `DELETE /demuxai/api/admin/providers/{queueGroup}` | v1 无 ModelRoute 引用检查 |
| 删除单上游模型 | `deleteUpstreamModel(qg, id)` | `DELETE /demuxai/api/admin/providers/{queueGroup}/models/{upstreamModelId}` | v1 无 ModelRoute 引用检查 |

> **接入状态**：后端 Phase 3 落地中；开发期可用 **`VITE_USE_MOCK=true`** 预览 UI。

### 模型路由（`DemuxaiModelRoutePort`）

| 业务动作 | Port 方法 | HTTP（规划） | 说明 |
| --- | --- | --- | --- |
| 列表 | `list({ page, pageSize, filter })` | `GET /demuxai/api/admin/routes` | `filter.channelKey` = `queueGroup` |
| 详情 | `get(id)` | `GET /demuxai/api/admin/routes/{id}` | 编辑回填 |
| 新建 | `create(input)` | `POST /demuxai/api/admin/routes` |  |
| 更新 | `update(id, input)` | `PUT /demuxai/api/admin/routes/{id}` |  |
| 删除 | `delete(id)` | `DELETE /demuxai/api/admin/routes/{id}` |  |
| 启停 | `setStatus(id, status)` | `PATCH /demuxai/api/admin/routes/{id}/status` | `enabled` / `disabled` / `hidden` |

> **接入状态**：`DemuxaiModelRouteHttpAdapter` 已对接 `/demuxai/api/admin/routes`。

## 请求 / 响应

### `ProviderGroup`（已入库）

```json
{
  "queueGroup": "kiro",
  "displayName": "Kiro",
  "status": "active",
  "upstreamModelCount": 3,
  "notes": null,
  "importedAtUtc": "2026-05-19T08:00:00Z",
  "updatedAtUtc": "2026-05-19T08:00:00Z"
}

```

| 字段 | 说明 |
| --- | --- |
| `queueGroup` | 全局唯一 QueueGroup；创建后不可改。 |
| `displayName` | 控制台展示名。 |
| `status` | `active` / `disabled`。 |
| `upstreamModelCount` | 组内已入库的上游模型数。 |
| `importedAtUtc` | 首次入库时间。 |

枚举：`providerGroupStatusValues`（`src/features/demuxai/model/enums.ts`）。

### `ProviderUpstreamModel`（已入库）

```json
{
  "queueGroup": "kiro",
  "upstreamModelId": "claude-sonnet-4-6",
  "label": "Claude Sonnet 4.6"
}

```

| 字段 | 说明 |
| --- | --- |
| `upstreamModelId` | 上游 HTTP 请求体 `model` 技术名（与 LLM 网关报告值一致）。 |
| `label` | 可选展示名。 |

### `GET /demuxai/api/admin/providers/discovery` → `DiscoverCatalogResult`

```json
{
  "groups": [
    {
      "queueGroup": "kiro",
      "displayName": "Kiro",
      "alreadyImported": true,
      "models": [
        { "upstreamModelId": "claude-sonnet-4-6", "label": "claude-sonnet-4-6", "alreadyImported": true },
        { "upstreamModelId": "claude-opus-4-7-preview", "label": "claude-opus-4-7-preview", "alreadyImported": false }
      ]
    },
    {
      "queueGroup": "cursor",
      "displayName": "Cursor",
      "alreadyImported": false,
      "models": [
        { "upstreamModelId": "cursor-large", "label": "cursor-large", "alreadyImported": false }
      ]
    }
  ],
  "discoveredAtUtc": "2026-05-19T08:00:00Z"
}

```

后端实现要点：
1. 直接调 LLM 网关侧 Consul：`KV.List("gateway/providers/")` 反序列化每个 ProviderCatalog；
2. 与 `model_meta` 表 join 计算每条 `alreadyImported`；
3. 不缓存（admin 触发频率低，每次都拿最新视图）；
4. 若 `Meeko:DemuxAi:GatewayConsul:Address` 未配置或不可达，返回 `upstream` envelope 失败。

### `POST /demuxai/api/admin/providers/import` → `ImportProviderGroupResult`

入参：

```json
{
  "queueGroup": "kiro",
  "displayName": "Kiro",
  "notes": null,
  "models": [
    { "upstreamModelId": "claude-sonnet-4-6", "label": "claude-sonnet-4-6" },
    { "upstreamModelId": "claude-opus-4-7-preview" }
  ]
}

```

返回：

```json
{
  "queueGroup": "kiro",
  "importedModelCount": 1,
  "importedAtUtc": "2026-05-19T08:00:00Z"
}

```

幂等策略：
- `queueGroup` 已存在 → 视为补充模型；可更新 `displayName` / `notes`。
- 已存在的 `(queueGroup, upstreamModelId)` 跳过，不计入 `importedModelCount`。
- 入参里若包含网关未报告的 `upstreamModelId` → 整批拒绝 `validation`（防止 admin 写错）。

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
  "createdAtUtc": "2026-05-01T00:00:00Z",
  "updatedAtUtc": "2026-05-19T08:00:00Z"
}

```

| 字段 | 说明 |
| --- | --- |
| `id` | 路由行主键（如 `MR-001`） |
| `alias` | 用户可见模型名；= 计费 / 日志 `modelName`；**改 alias = 改计费主键**，UI 应禁用编辑。 |
| `channelKey` | = 所属 `queueGroup`。 |
| `upstreamModelId` | 绑定的上游注册名（必须在该 `queueGroup` 下已入库）。 |
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
| 详情 | `get(id)` | `GET /demuxai/api/admin/providers/{id}` |  |
| 新建 | `create` | `POST /demuxai/api/admin/providers` | body `{ name, status? }` |
| 更新 | `update` | `PUT /demuxai/api/admin/providers/{id}` | 当前仅 `name` |
| 删除 | `delete` | `DELETE /demuxai/api/admin/providers/{id}` |  |
| 启停 | `setStatus` | `PUT`（复用 upsert） | BFF：`PATCH .../status` **未实现** |
| 连通测试 | `test` | `POST .../test` | **未实现** |

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
- 已移除 **`code` / `displayName` 双字段**：全局唯一标识改为 **`name`**。
- HttpAdapter 将 JSON `id`（int 字符串）映射为前端 `Provider.id` 供日志 `providerId` join；`providerModels` / `modelMappings` 在真接 BFF 时为空数组。

> 旧文档中的 `connection` / `modelMappings` / 轻投影列表描述适用于 **已废弃的单页 Provider 编辑器**，不再对应当前主界面。

## 交互流程

```
[/demuxai/catalog/import]                  接入流程
  onMounted → discoverFromGateway (silent)
  admin 点「重新拉取」 → discoverFromGateway
  左栏选 QueueGroup → 右栏列模型（带 alreadyImported tag）
  勾选未入库的若干模型 → 「创建并继续」→ importProviderGroup
    └─ 不退出页面；刷新后已勾选模型变成「已入库」
  反复操作可一次接入多组

[/demuxai/providers]                       已接入维护
  onMounted → listProviderGroups + listUpstreamModels(selected) + ModelRoutes(selected)
  「补充模型」/ 「去接入」 → 跳 /demuxai/catalog/import
  行「编辑」 → ProviderUpstreamModelEditDrawer → 别名 CRUD（ModelRoute port）
  行「移除」 → deleteUpstreamModel（先解除别名）
  「删除供应商组」 → deleteProviderGroup（先解除全部别名）

```

定价跳转：[`10-demuxai-pricing.md`](./10-demuxai-pricing.md)（按组筛选 `alias`）。

## 错误码

| code | 含义 |
| --- | --- |
| `validation` | 别名 / 上游 ID 为空；导入了网关未报告的模型；QueueGroup 格式不合法 |
| `not_found` | `queueGroup` / `id` 不存在 |
| `conflict` | `alias` 唯一性冲突；删除时仍有 ModelRoute 引用 |
| `upstream` | LLM 网关 Consul (`Meeko:DemuxAi:GatewayConsul:Address`) 未配置 / 不可达 / KV 反序列化失败 |

## 备注

- 模型元数据（`ModelMeta`）与旧版「平台 Model 列表」见 [`09-demuxai-models.md`](./09-demuxai-models.md)。
- 激活码见路由 `/demuxai/redemption`（`DemuxaiRedemptionPort`，`/demuxai/api/redemption`）。
- 网关 catalog 来源：DemuxAi 直接读 **LLM 网关侧 Consul KV** `gateway/providers/{providerId}/catalog`，无 HTTP / 无 HMAC。配置见 `Meeko:DemuxAi:GatewayConsul`，详见 [`phase3-catalog-pull.md`](../../../product/Meeko.DemuxAi/docs/phase3-catalog-pull.md)。
