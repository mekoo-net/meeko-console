# 09 · 模型列表（DemuxAI Models）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/models` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/ModelListView.vue` |
| 抽屉 | `src/features/demuxai/components/ModelEditDrawer.vue`（仅编辑） |
| Port | `src/features/demuxai/services/ports/demuxaiModelPort.ts` |

## 业务定义

> 平台层 Model 是 `provider_model_mappings.display_name` 的全局视图。
>
> **生命周期完全由 Provider 映射驱动**：
> - 新增 `mappings.display_name` → 自动 create 一条平台 Model
> - 不再被任何 mapping 引用 → 自动 delete 平台 Model
> - 因此本页**没有「新建」/「删除」/「启停」**按钮，仅 `编辑` 元数据。
>
> `modelId` = `displayName`，是用户请求体里的 `model` 字段，也是计费 / 配额主键。**不可改**（FK）。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/api/admin/demuxai/models` |
| 详情 | `get(uid)` | GET | `/api/admin/demuxai/models/{uid}` |
| 编辑元数据 | `update(uid, payload)` | PATCH | `/api/admin/demuxai/models/{uid}` |
| Provider 字典（用于「承载于」反向派生） | `DemuxaiProviderPort.list` | GET | `/api/admin/demuxai/providers` |

## 请求 / 响应

### 列表 `GET /api/admin/demuxai/models`

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1 |
| `pageSize` | int | 是 | 默认 20 |
| `keyword` | string | 否 | 模糊匹配 `modelId` / `displayName` |
| `family` | enum/`'all'` | 否 | `gpt` / `claude` / `gemini` / `qwen` / ... |
| `capability` | enum/`'all'` | 否 | `chat` / `embedding` / `vision` / ... |

响应：

```json
{
  "items": [
    {
      "uid": "MD-001",
      "modelId": "demux-gpt-4o",
      "displayName": "demux-gpt-4o",
      "family": "gpt",
      "capabilities": ["chat", "tool_use", "vision", "json_mode"],
      "visibleMinTier": 1,
      "maxContextTokens": 128000,
      "maxOutputTokens": 16384,
      "supportsStreaming": true,
      "supportsFunctionCall": true,
      "description": "GPT-4o，旗舰模型。",
      "createdAtUtc": "2024-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-01T00:00:00Z"
    }
  ],
  "total": 24
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | 平台 Model 主键。 |
| `modelId` | string | = 用户请求里的 `model` 字段，也是计费 / 配额主键，**不可改**。 |
| `displayName` | string | UI 展示名；可与 `modelId` 不同（前端默认等同）。 |
| `family` | enum | UI 分组 / 图标用。 |
| `capabilities[]` | enum[] | 多选能力位。 |
| `visibleMinTier` | int (1..99) | 最低可见 LV。 |
| `maxContextTokens` | int | 上下文窗口，单位 tokens。 |
| `maxOutputTokens` | int \| null | 单次响应上限；省略则 = `maxContextTokens`。 |
| `supportsStreaming` | boolean | 是否支持流式。 |
| `supportsFunctionCall` | boolean | 是否支持函数调用。 |
| `description` | string \| null | 简介。 |

枚举见 `src/features/demuxai/model/enums.ts` 的 `modelFamilyValues`、`modelCapabilityValues`。

### 编辑 `PATCH /api/admin/demuxai/models/{uid}`（`UpdateModelInput`）

所有字段都是可选；前端只传变更项：

```json
{
  "displayName": "demux-gpt-4o",
  "family": "gpt",
  "capabilities": ["chat", "tool_use", "vision", "json_mode"],
  "visibleMinTier": 2,
  "maxContextTokens": 128000,
  "maxOutputTokens": 16384,
  "supportsStreaming": true,
  "supportsFunctionCall": true,
  "description": "更新后的简介"
}
```

成功返回更新后的 `Model` 完整体。

> **不允许**通过此接口修改 `modelId`、`createdAtUtc`、`updatedAtUtc`。

## 「承载于」反向派生（前端逻辑，不调用接口）

前端拉取 `providers.list({pageSize: 200})`，根据：

```ts
provider.modelMappings[].displayName === model.modelId
```

聚合出 `displayName → [{ providerName, modelName, mappingWeight, enabled }]` 关系图，渲染在表格 "承载于" 列与抽屉侧栏。

## 交互流程

```
onMounted → loadProviders() + fetchData()
filter 变化 → page=1 → list()
点击「编辑」 → ModelEditDrawer → update(uid, payload) → list()
点击「承载于」tooltip 中的某个 Provider → router.push({ name: 'demuxai-providers', query: { focus: providerUid } })
```

- "承载于"为 0 时（罕见，应是 reconcile 中间态）UI 把数字标红。
- 编辑 displayName 不会影响 Provider 端的 mapping —— 但平台展示名会变。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段非法值 |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | `uid` 不存在或已 reconcile 删除 |
| 409 | `conflict` | 并发编辑（前端默认不开乐观锁） |
