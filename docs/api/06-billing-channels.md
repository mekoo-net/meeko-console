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
> 渠道由后端**插件**（`IPaymentChannelPlugin`）自描述并自动注册，前端不再硬编码渠道列表。
> 每个渠道暴露一份**配置 schema**（字段 key/label/type/是否敏感），前端据此动态渲染表单。
>
> 内置渠道（示例，以后端实际注册为准）：
>
> - `alipay`（支付宝）
> - `wechat_pay`（微信支付 V3）
> - `fkpay`（发卡付）
> - `manual`（手工入账，无需配置）
>
> **标识**：渠道唯一键为 **`code`**（如 `alipay`）；REST 路径 `{code}` 即用它。

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表渠道（含 isConfigured / isActive） | `listChannels` | GET | `/api/admin/billing/channels` |
| 启停渠道 | `setActive(code, active)` | PATCH | `/api/admin/billing/channels/{code}/active` |
| 取渠道配置 schema | `getChannelSchema(code)` | GET | `/api/admin/billing/channels/{code}/schema` |
| 取渠道配置（脱敏） | `getChannelConfig(code)` | GET | `/api/admin/billing/channels/{code}/config` |
| 保存渠道配置 | `saveChannelConfig(code, values)` | PUT | `/api/admin/billing/channels/{code}/config` |

## 请求 / 响应
### `GET /api/admin/billing/channels`
成功响应（`PaymentChannelDto[]`）：

```json
[
  {
    "code": "alipay",
    "displayName": "支付宝",
    "isActive": true,
    "isConfigured": true,
    "supportedScenes": ["native", "h5", "pc"]
  },
  {
    "code": "fkpay",
    "displayName": "发卡付",
    "isActive": false,
    "isConfigured": false,
    "supportedScenes": ["redirect"]
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | string | 渠道唯一键，由插件声明；REST 路径 `{code}` 用它。 |
| `displayName` | string | 渠道展示名（插件声明）。 |
| `isActive` | boolean | 是否启用（用户在结算页可选）。 |
| `isConfigured` | boolean | 是否已保存过配置；前端用于展示「已配置 / 待配置」。 |
| `supportedScenes` | string[] | 渠道支持的场景标识（如 `native` / `h5` / `redirect`）。 |

> 列表合并「已注册插件」与「DB 已存配置行」：未配置过的插件也会出现，`isConfigured=false`。

### `PATCH /api/admin/billing/channels/{code}/active`
请求体：

```json
{ "active": true }
```

- 启用前服务端校验 `isConfigured=true`，否则返回 400 `validation`。
- 未知 `code`（无对应插件）返回 404 `not_found`。
成功返回更新后的 `PaymentChannelDto`。

### `GET /api/admin/billing/channels/{code}/schema`
返回该渠道的配置字段定义（`ChannelConfigSchemaDto`），前端据此渲染表单：

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

### `GET /api/admin/billing/channels/{code}/config`
返回脱敏后的当前配置值（`ChannelConfigValuesDto`），未配置时 `values` 为空对象：

```json
{
  "code": "fkpay",
  "values": {
    "baseUrl": "http://gw.example:8080",
    "appId": "app_123",
    "appSecret": "***f0a1"
  }
}
```

> ⚠️ 标记 `isSecret=true` 的字段返回时脱敏（`***` + 末 4 位）。前端回填后若用户未修改，PUT 时应避免把脱敏占位符当成新值写回（见下）。

### `PUT /api/admin/billing/channels/{code}/config`
请求体为扁平 key-value（`Record<string, string>`，键对应 schema 的 `field.key`）：

```json
{
  "baseUrl": "http://gw.example:8080",
  "appId": "app_123",
  "appSecret": "real-secret-value"
}
```

- 服务端按 `code` 解析插件 schema，序列化为 `PaymentChannel.ConfigJson`（扁平 JSON 对象）。
- 渠道行不存在时按插件元信息自动注册再写入。
- 成功响应：`204 No Content`；未知 `code` 返回 404 `not_found`。

## 交互流程

```
onMounted → listChannels()
点击「配置」 → 抽屉打开 → 并行 getChannelSchema(code) + getChannelConfig(code) → 按 schema 渲染并回填
保存 → saveChannelConfig(code, values) → 重新 listChannels()
启用/停用 → setActive(code, !isActive) → 更新单行
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺必填、启用未配置渠道等 |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | `code` 无对应已注册插件 / 渠道行不存在 |
| 409 | `conflict` | 状态冲突 |

## 备注

- **新增渠道零改前端**：后端新增一个 `XxxChannelPlugin`（声明 `code` / `displayName` / `supportedScenes` / `ConfigFields` 并在 `ConfigureServices` 注册 provider）即可，前端按 schema 自动渲染，无需追加枚举或表单分支。
- 渠道私有运行时配置（如支付宝密钥）由各 Provider 从 `PaymentChannel.ConfigJson` 自行解析，不再经由 Contract 层的 per-channel DTO。
- 通知 URL（`notifyUrl`）必须公网可达 HTTPS。
