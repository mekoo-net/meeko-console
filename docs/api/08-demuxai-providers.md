# 08 · 模型渠道（DemuxAI Providers）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/providers` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/ProviderListView.vue` |
| 抽屉 | `src/features/demuxai/components/ProviderEditDrawer.vue`（新增 / 编辑） |
| Port | `src/features/demuxai/services/ports/demuxaiProviderPort.ts` |

## 业务定义

> Provider = **一组凭据 + 一种 apiType + 一组 providerModels（上游模型）+ 一组 modelMappings（对外上架映射）**。
>
> 保存（create / update / delete）时，BFF 做原子 reconcile：
>
> - **出现新的 `modelMappings.displayName`** → 自动 create 平台 `Model`（用首条承载它的 ProviderModel 的元数据）；
> - **全局已无任何 mapping 引用某个 displayName** → 自动 delete 平台 `Model`（前端 Mock 硬删，BFF 软删用于日志 join，对前端透明）；
> - 因此前端**不**直接 create / delete Model。

`autoDisabledCode` 是调度侧根据连续错误率自动写入的，恢复必须人工 `setStatus('enabled')`，避免抖动来回切换。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list` | GET | `/api/admin/demuxai/providers` |
| 详情（编辑前回填） | `get(uid)` | GET | `/api/admin/demuxai/providers/{uid}` |
| 新建 | `create(payload)` | POST | `/api/admin/demuxai/providers` |
| 整体覆盖式更新 | `update(uid, payload)` | PUT | `/api/admin/demuxai/providers/{uid}` |
| 删除 | `delete(uid)` | DELETE | `/api/admin/demuxai/providers/{uid}` |
| 切换启停 | `setStatus(uid, status)` | PATCH | `/api/admin/demuxai/providers/{uid}/status` |
| 连通测试 | `test(uid)` | POST | `/api/admin/demuxai/providers/{uid}/test` |
| 拉取上游 `/v1/models` | `fetchUpstreamModels(input)` | POST | `/api/admin/demuxai/providers/upstream-models` |

## 请求 / 响应

### 列表 `GET /api/admin/demuxai/providers`

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1 |
| `pageSize` | int | 是 | 默认 20 |
| `keyword` | string | 否 | 模糊匹配 `name` / `baseUrl` |
| `apiType` | enum/`'all'` | 否 | 见 `apiTypeValues` |
| `status` | enum/`'all'` | 否 | `enabled` / `disabled` / `auto_disabled` |

响应：

```json
{
  "items": [
    {
      "uid": "PR-001",
      "name": "OpenAI 主线",
      "apiType": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyMasked": "sk-***abc1",
      "notes": "主用账户，月预算 $5000",
      "status": "enabled",
      "autoDisabledCode": null,
      "testLatencyMs": 142,
      "testSucceededAtUtc": "2025-09-12T03:21:08Z",
      "errorRate24h": 0.012,
      "callCount24h": 5820,
      "providerModels": [
        {
          "uid": "PM-001",
          "modelName": "gpt-4o-2024-08-06",
          "family": "gpt",
          "capabilities": ["chat", "tool_use", "vision", "json_mode"],
          "visibleMinTier": 1,
          "maxContextTokens": 128000,
          "maxOutputTokens": 16384
        }
      ],
      "modelMappings": [
        {
          "uid": "MM-001",
          "providerModelUid": "PM-001",
          "displayName": "demux-gpt-4o",
          "enabled": true,
          "notes": null,
          "sortOrder": 0,
          "mappingWeight": 100
        }
      ],
      "createdAtUtc": "2024-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-12T03:21:08Z"
    }
  ],
  "total": 8
}
```

`apiKeyMasked` 是脱敏快照（`sk-***abc1`），完整密钥**永不回流到前端**。BFF 入库前 hash + 加密。

### 新建 `POST /api/admin/demuxai/providers` （`CreateProviderInput`）

```json
{
  "name": "DeepSeek 备线",
  "apiType": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "notes": null,
  "providerModels": [
    {
      "uid": "tmp-pm-1",
      "modelName": "deepseek-chat",
      "family": "deepseek",
      "capabilities": ["chat", "tool_use", "json_mode"],
      "visibleMinTier": 1,
      "maxContextTokens": 64000,
      "maxOutputTokens": 8192
    }
  ],
  "modelMappings": [
    {
      "providerModelUid": "tmp-pm-1",
      "displayName": "demux-deepseek-chat",
      "enabled": true,
      "notes": null,
      "sortOrder": 0,
      "mappingWeight": 100
    }
  ]
}
```

字段约束：

- `name` 必填，长度 1..64。
- `apiKey` 必填，明文传输（HTTPS），BFF 入库前 hash + 加密。
- `providerModels[].uid` 在新建时由前端预生成临时 ID（`tmp-*`），BFF 应替换为正式 UUID v7。
- `modelMappings[].providerModelUid` 既可指向已存在的 PM uid，也可指向同一请求中临时 PM 的 uid。
- `modelMappings[].displayName` 是终端用户可见的"上架名"（即将作为平台 `Model.modelId`）。
- `mappingWeight` 缺省 100；多映射同 displayName 时用于按比例分流（草稿态）。

成功响应即完整的 `Provider`。

### 更新 `PUT /api/admin/demuxai/providers/{uid}`（`UpdateProviderInput`）

整体覆盖式：前端会发送**保存意图下的全集**（含未变更项）。BFF 端 diff 出新增 / 修改 / 删除，并级联清理孤立 mapping、再触发 Model reconcile。

`apiKey` 字段处理：
- 省略 → 不变更密钥
- 空字符串 `""` → 清空（仅在解绑场景使用）
- 非空 → 整体替换

### `PATCH /api/admin/demuxai/providers/{uid}/status`

请求体：

```json
{ "status": "disabled" }
```

合法迁移：

```
enabled → disabled
disabled → enabled
auto_disabled → enabled  // 必须人工恢复
```

不允许把 `enabled / disabled` 直接置成 `auto_disabled`（只能由调度器写入）。

### `POST /api/admin/demuxai/providers/{uid}/test` → `ProviderTestResult`

```json
{
  "ok": true,
  "latencyMs": 145,
  "reachableModelNames": ["gpt-4o-2024-08-06", "gpt-4o-mini"],
  "errorCode": null,
  "errorMessage": null
}
```

失败示例：

```json
{
  "ok": false,
  "latencyMs": 2000,
  "reachableModelNames": [],
  "errorCode": "auth_failed",
  "errorMessage": "Invalid API key"
}
```

测试成功后 BFF 应同时刷新 `testLatencyMs` / `testSucceededAtUtc` 字段，前端列表会自动展示。

### `POST /api/admin/demuxai/providers/upstream-models`

> 用于"导入上游 model 列表"草稿态。已保存的 Provider 走 `providerUid`（服务端凭据），新建草稿态走 `apiKey + baseUrl`。

```json
// 已保存场景
{ "apiType": "openai", "baseUrl": "https://api.openai.com/v1", "providerUid": "PR-001" }

// 草稿场景
{ "apiType": "openai", "baseUrl": "https://api.openai.com/v1", "apiKey": "sk-xxx" }
```

响应：

```json
{ "upstreamModelNames": ["gpt-4o", "gpt-4o-mini", "o1-preview"] }
```

### `DELETE /api/admin/demuxai/providers/{uid}`

无请求体；删除后 BFF 在事务内：

1. 清理本 Provider 的 providerModels + modelMappings；
2. 触发 Model reconcile：删除全局已无 mapping 的 displayName 对应的平台 Model。

前端在删除确认弹窗中会展示"将级联删除哪些平台 displayName"（基于其他 Provider 的 modelMappings 反算），便于用户判断。

## 交互流程

```
onMounted → list(...)
新建 → 打开 ProviderEditDrawer → create(payload) → list()
编辑 → providerPort.get(uid) → 抽屉 → update(uid, payload) → list()
测试 → test(uid) → ElMessage 显示连通性
启停 → setStatus(uid, next)
删除 → confirmDanger → delete(uid)
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段缺失、显示名重复、apiType 与 baseUrl 不匹配 |
| 401 | `unauthorized` | token 失效 |
| 403 | `forbidden` | 非 Admin |
| 409 | `conflict` | `name` 唯一性冲突 |
| 502 | `upstream` | 上游 `/v1/models` 拉取失败（限于 `fetchUpstreamModels`） |
| 504 | `timeout` | `test` 接口的探测超时 |
