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

| 业务动作 | Port 方法 | HTTP | REST 端点 | 投影 |
| --- | --- | --- | --- | --- |
| 列表（**轻投影**，不返回 providerModels / modelMappings 全集） | `list` | GET | `/api/admin/demuxai/providers` | 行级概要 + `mappingsCount` / `mappingNames[]` |
| 详情（编辑前回填，含完整子树） | `get(uid)` | GET | `/api/admin/demuxai/providers/{uid}` | 全字段 |
| 新建 | `create(payload)` | POST | `/api/admin/demuxai/providers` | 全字段 |
| 整体覆盖式更新 | `update(uid, payload)` | PUT | `/api/admin/demuxai/providers/{uid}` | 全字段 |
| 删除 | `delete(uid)` | DELETE | `/api/admin/demuxai/providers/{uid}` | — |
| 切换启停 | `setStatus(uid, status)` | PATCH | `/api/admin/demuxai/providers/{uid}/status` | 全字段 |
| 连通测试 | `test(uid)` | POST | `/api/admin/demuxai/providers/{uid}/test` | `ProviderTestResult` |
| 拉取上游 `/v1/models` | `fetchUpstreamModels(input)` | POST | `/api/admin/demuxai/providers/upstream-models` | `{ upstreamModelNames }` |

> **列表 vs 详情投影分层**：原列表会把每行的 `providerModels[]` + `modelMappings[]` 完整下发，单行可能膨胀到 100+ KB。现按 GitHub repos / OpenAI fine-tunes 等惯例分层 —— 列表只回概要（行可见字段 + `mappingsCount` + 前 5 个 `mappingNames[]` 给 hover 预览），详情 `GET /{uid}` 才回完整子树。

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

响应（**轻投影**）：

```json
{
  "items": [
    {
      "uid": "PR-001",
      "name": "OpenAI 主线",
      "connection": {
        "apiType": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey":  { "masked": "sk-***abc1" }
      },
      "notes": "主用账户，月预算 $5000",
      "status": "enabled",
      "autoDisabledCode": null,
      "lastTest": {
        "ok":        true,
        "latencyMs": 142,
        "atUtc":     "2025-09-12T03:21:08Z"
      },
      "metrics24h": {
        "callCount": 5820,
        "errorRate": 0.012
      },
      "mappings": {
        "count": 3,
        "names": ["demux-gpt-4o", "demux-gpt-4o-mini", "demux-o1-preview"]
      },
      "createdAtUtc": "2024-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-12T03:21:08Z"
    }
  ],
  "total": 8
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `connection` | object | 上游连接配置：`{ apiType, baseUrl, apiKey: { masked } }`。`apiKey` 用嵌套对象而非 string，是为未来引入 `keyId` / `rotatedAtUtc` / `expiresAtUtc` 等元数据预留扩展点；前端永远读 `connection.apiKey.masked` 做展示。完整密钥**永不回流**到前端，BFF 入库前 hash + 加密。 |
| `lastTest` | object \| null | 最近一次连通测试结果快照：`{ ok, latencyMs, atUtc }`。**整组字段同生同灭**，从未测试过时为 `null`。 |
| `metrics24h` | object | 近 24 小时观测指标：`{ callCount, errorRate }`。BFF 端从日志服务聚合后下发，避免前端再请求 stats。 |
| `mappings` | object | 列表投影：`{ count, names[] }`。`names` 至多前 5 个，供 hover 预览；想看全部请进详情。 |
| `autoDisabledCode` | string \| null | 自动停用原因（调度侧写入，UI 只读）。 |

### 详情 `GET /api/admin/demuxai/providers/{uid}`

在轻投影基础上**额外**返回 `providerModels[]` + `modelMappings[]` 完整子树：

```json
{
  "...": "（上面所有列表字段）",
  "providerModels": [
    {
      "uid": "PM-001",
      "modelName": "gpt-4o-2024-08-06",
      "family": "gpt",
      "capabilities": ["chat", "tool_use", "vision", "json_mode"],
      "visibleMinTier": 1,
      "limits": { "contextTokens": 128000, "outputTokens": 16384 }
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
  ]
}
```

> `providerModels[].limits` 与 [`09-demuxai-models.md`](./09-demuxai-models.md) 的 `Model.limits` 字段形状一致（`{ contextTokens, outputTokens }`），便于前端"映射创建模型"时直接拷贝。

### 新建 `POST /api/admin/demuxai/providers` （`CreateProviderInput`）

```json
{
  "name": "DeepSeek 备线",
  "connection": {
    "apiType": "deepseek",
    "baseUrl": "https://api.deepseek.com",
    "apiKey":  { "raw": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
  },
  "notes": null,
  "providerModels": [
    {
      "clientTempId": "tmp-pm-1",
      "modelName": "deepseek-chat",
      "family": "deepseek",
      "capabilities": ["chat", "tool_use", "json_mode"],
      "visibleMinTier": 1,
      "limits": { "contextTokens": 64000, "outputTokens": 8192 }
    }
  ],
  "modelMappings": [
    {
      "providerModelRef": "tmp-pm-1",
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
- `connection.apiKey.raw` 写入时只传一次明文（HTTPS），BFF 入库前 hash + 加密；返回时只回 `connection.apiKey.masked`。**raw / masked 同对象不同位置**：`raw` 仅入参、`masked` 仅出参，schema 上互斥不冲突。
- `providerModels[].clientTempId` —— **重命名自原 `uid` 的临时占位**。原 `"uid":"tmp-pm-1"` 让"客户端临时 ID"与"服务端真实 UID"共用字段歧义；现明确分离：入参用 `clientTempId`（前端 nanoid 生成）、出参用 `uid`（服务端分配 UUID v7）。
- `modelMappings[].providerModelRef` —— **替代原 `providerModelUid`**。`Ref` 后缀提示这里可能是 `clientTempId`（同请求内引用）或真实 `uid`（已存在的 PM）；BFF 端解析时按"先找同请求 tempId，再找数据库 uid"顺序。
- `modelMappings[].displayName` 是终端用户可见的"上架名"（即将作为平台 `Model.modelId`）。
- `mappingWeight` 缺省 100；多映射同 displayName 时用于按比例分流（草稿态）。

成功响应：`201 Created` + 完整 `Provider`（含 BFF 分配的真实 `providerModels[].uid`）；如有 `clientTempId` 字段则**额外**返回 `idMappings`，便于前端把表单态的 tempId 替换为真实 uid：

```json
{
  "...": "完整 Provider 字段",
  "idMappings": [
    { "clientTempId": "tmp-pm-1", "uid": "PM-072" }
  ]
}
```

### 更新 `PUT /api/admin/demuxai/providers/{uid}`（`UpdateProviderInput`）

整体覆盖式：前端会发送**保存意图下的全集**（含未变更项）。BFF 端 diff 出新增 / 修改 / 删除，并级联清理孤立 mapping、再触发 Model reconcile。

`connection.apiKey` 字段处理：
- 字段省略 / `null` → 不变更密钥
- `{ "raw": "" }` → 清空（仅在解绑场景使用）
- `{ "raw": "sk-xxx" }` → 整体替换

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
  "error": null
}
```

失败示例：

```json
{
  "ok": false,
  "latencyMs": 2000,
  "reachableModelNames": [],
  "error": {
    "code": "auth_failed",
    "message": "Invalid API key"
  }
}
```

> **错误对象统一形状**：所有"操作类"接口的失败信息一律用 `error: { code, message, ...domainExtras }` 嵌套结构表达（与 11-logs 的 `LogEntry.error` 一致）。
> - `code` 是机器可识别的枚举（`auth_failed` / `dns_failed` / `tls_failed` / `upstream_4xx` / `upstream_5xx` / `upstream_timeout` 等）；
> - `message` 是上游原文摘要（≤ 200 字符），仅作展示，前端不要 parse；
> - 成功时 `error === null`，前端先看 `ok`，再读 `error`。

测试成功后 BFF 应同时刷新 `lastTest`（见列表响应的 `lastTest: { ok, latencyMs, atUtc }` 子对象），前端列表会自动展示。

### `POST /api/admin/demuxai/providers/upstream-models`

> 用于"导入上游 model 列表"草稿态。已保存的 Provider 走 `providerUid`（服务端凭据），新建草稿态走 `apiKey + baseUrl`。

```json
// 已保存场景
{ "providerUid": "PR-001" }

// 草稿场景
{
  "connection": {
    "apiType": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey":  { "raw": "sk-xxx" }
  }
}
```

响应：

```json
{ "upstreamModelNames": ["gpt-4o", "gpt-4o-mini", "o1-preview"] }
```

> `connection` 子对象的使用与列表 / 详情中一致 —— **草稿态把"凭据 + 连接信息"打包发送**，让端点签名直观表达"我在用这套凭据探一探上游"。

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
