# 06 · 充值渠道页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/billing/channels` |
| 角色 | **Admin** |
| 视图 | `src/features/billing/views/PaymentChannelsView.vue` |
| 子组件 | `ChannelConfigDrawer`（按 schema 动态渲染表单，无渠道分支） |
| Port | `src/features/billing/services/ports/paymentChannelPort.ts` |

## 业务定义

> 平台层支付渠道接入配置（管理员维护），与各账户的充值记录无直接关系。
> 支付**类型 / 驱动**由后端**插件**（`IPaymentChannelPlugin`）自描述并自动注册；
> 管理员可为一种类型创建**多个渠道实例**（如两个支付宝账户），每个实例独立配置、独立启停。
> 列表只返回**已创建的实例**；可创建的类型经 `/types` 单独获取。
>
> 内置类型（示例，以后端实际注册为准）：
>
> - `alipay`（支付宝，可多实例）
> - `wechat_pay`（微信支付 V3，可多实例）
> - `fkpay`（发卡付，可多实例）
> - `manual`（手工入账，单例不可删除、无需配置，启动时自动种子化）
>
> **标识**：
> - **实例**用数据库自增 **`id`**（`number`）标识；启停 / 配置 / 删除 / 充值下单均用它。
> - **类型**用 **`code`**（驱动 code，如 `alipay`）标识，仅用于「新建实例」时选择。

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表已创建实例 | `listChannels` | GET | `/api/admin/billing/channels` |
| 列表可创建类型 | `listChannelTypes` | GET | `/api/admin/billing/channels/types` |
| 新建实例 | `createChannel(driverCode, name)` | POST | `/api/admin/billing/channels` |
| 删除实例 | `deleteChannel(id)` | DELETE | `/api/admin/billing/channels/{id}` |
| 启停实例 | `setActive(id, active)` | PATCH | `/api/admin/billing/channels/{id}/active` |
| 取实例配置 schema | `getChannelSchema(id)` | GET | `/api/admin/billing/channels/{id}/schema` |
| 取实例配置（脱敏） | `getChannelConfig(id)` | GET | `/api/admin/billing/channels/{id}/config` |
| 保存实例配置 | `saveChannelConfig(id, values)` | PUT | `/api/admin/billing/channels/{id}/config` |

## 请求 / 响应
### `GET /api/admin/billing/channels`
成功响应（`PaymentChannelDto[]`，**仅已创建实例**）：

```json
[
  {
    "id": 1,
    "driverCode": "manual",
    "displayName": "手工入账",
    "driverDisplayName": "手工入账",
    "isActive": true,
    "isConfigured": true,
    "supportedScenes": ["manual"]
  },
  {
    "id": 2,
    "driverCode": "alipay",
    "displayName": "支付宝-主账户",
    "driverDisplayName": "支付宝",
    "isActive": false,
    "isConfigured": false,
    "supportedScenes": ["native", "h5", "pc"]
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 实例唯一键；REST 路径 `{id}` 用它。 |
| `driverCode` | string | 支付类型 / 驱动 code。 |
| `displayName` | string | 实例展示名（管理员自定义）。 |
| `driverDisplayName` | string? | 类型展示名（如「支付宝」）。 |
| `isActive` | boolean | 是否启用（用户充值页可选）。 |
| `isConfigured` | boolean | 是否已保存过配置；无配置字段的类型（手工）天然为 true。 |
| `supportedScenes` | string[] | 支持的场景标识。 |

### `GET /api/admin/billing/channels/types`
返回可创建的类型（`ChannelTypeDto[]`），供「新建实例」选择：

```json
[
  {
    "code": "alipay",
    "displayName": "支付宝",
    "allowMultiple": true,
    "instanceCount": 1,
    "supportedScenes": ["native", "h5", "pc"],
    "fields": [ /* 同 schema.fields */ ]
  },
  {
    "code": "manual",
    "displayName": "手工入账",
    "allowMultiple": false,
    "instanceCount": 1,
    "supportedScenes": ["manual"],
    "fields": []
  }
]
```

> `allowMultiple=false` 且 `instanceCount>0` 的类型（手工入账）在「新建」下拉中禁用。

### `POST /api/admin/billing/channels`
请求体：

```json
{ "driverCode": "alipay", "displayName": "支付宝-主账户" }
```

- 单例类型（`allowMultiple=false`）已存在实例时返回 400 `validation`。
- 未知 `driverCode` 返回 404 `not_found`。
- 成功返回新建的 `PaymentChannelDto`。

### `DELETE /api/admin/billing/channels/{id}`
- 单例渠道（手工入账）不可删除，返回 400 `validation`。
- 成功响应：`204 No Content`。

### `PATCH /api/admin/billing/channels/{id}/active`
请求体：

```json
{ "active": true }
```

- 启用前服务端校验 `isConfigured=true`，否则返回 400 `validation`。
- 未知 `id` 返回 404 `not_found`。
- 成功返回更新后的 `PaymentChannelDto`。

### `GET /api/admin/billing/channels/{id}/schema`
返回该实例**所属类型**的配置字段定义（`ChannelConfigSchemaDto`），前端据此渲染表单：

```json
{
  "code": "fkpay",
  "displayName": "发卡付",
  "fields": [
    { "key": "baseUrl",   "label": "网关地址", "type": "Url",      "isSecret": false, "required": true,  "placeholder": "http://your-gateway:8080" },
    { "key": "appId",     "label": "AppId",   "type": "Text",     "isSecret": false, "required": true },
    { "key": "appSecret", "label": "AppSecret","type": "Password", "isSecret": true,  "required": true }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | string | 配置项 key，PUT 时作为 values 的键。 |
| `label` | string | 表单标签。 |
| `type` | `Text \| Password \| Url \| Boolean \| TextArea` | 前端控件类型。 |
| `isSecret` | boolean | 敏感字段：GET config 时脱敏，表单默认隐藏（密码框 + 显隐切换）。 |
| `required` | boolean | 是否必填。 |
| `placeholder` / `help` | string? | 占位符 / 帮助文案（可选）。 |

### `GET /api/admin/billing/channels/{id}/config`
返回脱敏后的当前配置值（`ChannelConfigValuesDto`），未配置时 `values` 为空对象：

```json
{
  "channelId": 3,
  "values": {
    "baseUrl": "http://gw.example:8080",
    "appId": "app_123",
    "appSecret": "***f0a1"
  }
}
```

> ⚠️ 标记 `isSecret=true` 的字段返回时脱敏（`***` + 末 4 位）。前端回填后若用户未修改，PUT 时把脱敏占位符原样写回即可——服务端会识别占位符并保留原密文。

### `PUT /api/admin/billing/channels/{id}/config`
请求体为扁平 key-value（`Record<string, string>`，键对应 schema 的 `field.key`）：

```json
{
  "baseUrl": "http://gw.example:8080",
  "appId": "app_123",
  "appSecret": "real-secret-value"
}
```

- 服务端按实例所属类型解析 schema，序列化为 `PaymentChannel.ConfigJson`（扁平 JSON 对象）。
- 敏感字段若仍为脱敏占位符（未修改），服务端保留原密文。
- 成功响应：`204 No Content`；未知 `id` 返回 404 `not_found`。

## 交互流程

```
onMounted → listChannels() + listChannelTypes()
新建 → 选择类型 + 输入名称 → createChannel(driverCode, name) → listChannels()
点击「配置」 → 抽屉打开 → 并行 getChannelSchema(id) + getChannelConfig(id) → 按 schema 渲染并回填
保存 → saveChannelConfig(id, values) → 重新 listChannels()
启用/停用 → setActive(id, !isActive) → 更新单行
删除（非单例） → deleteChannel(id) → listChannels()
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺必填、启用未配置实例、单例重复创建 / 删除单例等 |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | `id` / `driverCode` 不存在 |
| 409 | `conflict` | 状态冲突 |

## 备注

- **新增支付类型零改前端**：后端新增一个 `XxxChannelPlugin`（声明 `code` / `displayName` / `supportedScenes` / `ConfigFields` / `AllowMultiple` 并在 `ConfigureServices` 注册 provider）即可，前端按 schema 自动渲染，无需追加枚举或表单分支。
- **多实例**：同一类型可创建多个实例，各自独立配置与启停；充值下单按选定实例的 `id` 精确路由到对应配置。
- 渠道私有运行时配置（如支付宝密钥）由各 Provider 从注入的实例配置（`PaymentChannelContext.ConfigJson`）解析，Provider 自身无状态。
- 通知 URL（`notifyUrl`）必须公网可达 HTTPS；多实例下回调路径为 `/billing/notify/{driverCode}/{channelId}` 以精确定位实例配置。
