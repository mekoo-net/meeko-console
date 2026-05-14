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
      "capabilities": ["chat", "tool_use", "vision", "json_mode", "streaming"],
      "visibleMinTier": 1,
      "limits": {
        "contextTokens": 128000,
        "outputTokens":  16384
      },
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
| `capabilities[]` | enum[] | 多选能力位：`chat` / `embedding` / `vision` / `tool_use` / `json_mode` / `streaming` / `function_call` / ... |
| `visibleMinTier` | int (1..99) | 最低可见 LV。 |
| `limits` | object | 容量限制族：`{ contextTokens, outputTokens }`，单位 tokens。`outputTokens` 为 `null` 时表示 = `contextTokens`。封装后未来加 `maxToolCalls` / `maxBatchSize` / `maxAttachmentMb` 不污染顶层。 |
| `description` | string \| null | 简介。 |

枚举见 `src/features/demuxai/model/enums.ts` 的 `modelFamilyValues`、`modelCapabilityValues`。

> **`supportsStreaming` / `supportsFunctionCall` 已并入 `capabilities[]`**：原两个 boolean 字段与 `capabilities` 表达的是同一份事实——"是否具备某能力"。继续平行存在会造成"两份真相"，前端容易写出 `capabilities.includes('streaming') || supportsStreaming` 这种防御性兜底。统一为枚举位 `'streaming'` / `'function_call'` 后，新增能力只在数组里加值，无需改 schema。

### 编辑 `PATCH /api/admin/demuxai/models/{uid}`（`UpdateModelInput`）

所有字段都是可选；前端只传变更项：

```json
{
  "displayName": "demux-gpt-4o",
  "family": "gpt",
  "capabilities": ["chat", "tool_use", "vision", "json_mode", "streaming"],
  "visibleMinTier": 2,
  "limits": {
    "contextTokens": 128000,
    "outputTokens":  16384
  },
  "description": "更新后的简介"
}
```

成功返回更新后的 `Model` 完整体。

> **不允许**通过此接口修改 `modelId`、`createdAtUtc`、`updatedAtUtc`。
>
> **`limits` 是嵌套对象而非两个顶层数字** —— PATCH 时支持"部分更新"：传 `"limits": { "contextTokens": 200000 }` 而 `outputTokens` 不传，BFF 应保留旧值（按 JSON Merge Patch 语义）；如要清空 outputTokens 传 `null`。

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
