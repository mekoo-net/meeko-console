# 06 · 充值渠道页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/billing/channels` |
| 角色 | **Admin** |
| 视图 | `src/features/billing/views/PaymentChannelsView.vue` |
| 子组件 | `ChannelConfigDrawer`（区分支付宝 / 微信支付表单） |
| Port | `src/features/billing/services/ports/paymentChannelPort.ts` |

## 业务定义

> 平台层支付渠道接入配置（管理员维护），与各账户的充值记录无直接关系。
> 当前内置两个渠道：
>
> - `alipay`（支付宝） · 对齐 essensoft/paylink `AlipayOptions`
> - `wechat_pay`（微信支付 V3） · 对齐 essensoft/paylink `WeChatPayOptions`
> **标识**：渠道行主键 JSON 字段为 **`id`**（如 `PC-001`）；`uid` 仅用于账户 / IAM userId（见 [`00-conventions.md`](./00-conventions.md) §3）。

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表渠道（含 isConfigured / isActive） | `listChannels` | GET | `/api/admin/billing/channels` |
| 启停渠道 | `setActive(code, active)` | PATCH | `/api/admin/billing/channels/{code}/active` |
| 取支付宝配置 | `getAlipayConfig` | GET | `/api/admin/billing/channels/alipay/config` |
| 保存支付宝配置 | `saveAlipayConfig(config)` | PUT | `/api/admin/billing/channels/alipay/config` |
| 取微信支付配置 | `getWechatPayConfig` | GET | `/api/admin/billing/channels/wechat_pay/config` |
| 保存微信支付配置 | `saveWechatPayConfig(config)` | PUT | `/api/admin/billing/channels/wechat_pay/config` |

## 请求 / 响应
### `GET /api/admin/billing/channels`
成功响应（`PaymentChannel[]`）：

```json
[
  {
    "id": "PC-001",
    "code": "alipay",
    "name": "支付宝",
    "description": "支持当面付、PC 网站、H5、JsApi 等场景",
    "isActive": true,
    "supportedScenes": [0, 1, 2, 4],
    "createdAtUtc": "2024-01-01T00:00:00Z",
    "isConfigured": true
  },
  {
    "id": "PC-002",
    "code": "wechat_pay",
    "name": "微信支付",
    "description": "支持 Native、JsApi、H5、App 等场景",
    "isActive": false,
    "supportedScenes": [0, 1, 2, 3],
    "createdAtUtc": "2024-01-01T00:00:00Z",
    "isConfigured": false
  }
]

```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 渠道配置行主键（如 `PC-001`）。 |
| `code` | `'alipay' \| 'wechat_pay'` | 业务码，前端枚举固定；REST 路径 `{code}` 亦用它。 |
| `isActive` | boolean | 是否启用（用户在结算页可选）。 |
| `isConfigured` | boolean | 是否已保存过完整配置；前端用于展示 "已配置 / 待配置"。 |
| `supportedScenes` | int[] | 见 `PaymentSceneLabel`（0=Native, 1=H5, 2=JsApi, 3=App, 4=PC, 99=手工入账）。 |

### `PATCH /api/admin/billing/channels/{code}/active`
请求体：

```json
{ "active": true }

```

- 启用前服务端应校验 `isConfigured=true`，否则返回 400 `validation`。
成功返回更新后的 `PaymentChannel`（与列表中条目结构一致）。

### `GET /api/admin/billing/channels/alipay/config`
成功响应（`AlipayConfig`，未配置时返回 `null`）：

```json
{
  "app": {
    "id": "2021000000000000"
  },
  "credentials": {
    "privateKey":      "MIIEvQIBADANBgkqhkiG9w0...",
    "alipayPublicKey": "MIIBIjANBgkqhkiG9w0BAQE...",
    "encryptKey":      "",
    "signType":        "RSA2"
  },
  "endpoints": {
    "gatewayUrl": "https://openapi.alipay.com/gateway.do",
    "notifyUrl":  "https://api.meeko.example/api/billing/alipay/notify",
    "returnUrl":  "https://app.meeko.example/billing/recharge"
  },
  "environment": {
    "isSandbox": false
  }
}

```

字段分组说明：
| 子对象 | 字段 | 说明 |
| --- | --- | --- |
| `app` | `id` | 支付宝开放平台 AppId。封装成对象方便未来加 `app.appType` / `app.tenantId`。 |
| `credentials` | `privateKey` / `alipayPublicKey` / `encryptKey` / `signType` | **整组敏感数据**。脱敏 / 加密策略可"按 credentials 整段做"——前端表单分组渲染、BFF 落库时整段走 KMS / AES-256-GCM。 |
| `endpoints` | `gatewayUrl` / `notifyUrl` / `returnUrl` | URL 族。封装后可以统一做"必须 HTTPS"校验。 |
| `environment` | `isSandbox` | 环境开关；未来加 `environment.region` / `environment.profile` 不污染顶层。 |

> ⚠️ `credentials.privateKey`、`credentials.alipayPublicKey`、`credentials.encryptKey` 是敏感数据，BFF 应：
> - **返回时脱敏**（如只回 `***前 8 位 + 后 4 位***`），或要求 Admin 二次校验后返回明文；
> - 落库采用加密存储（推荐 KMS / AES-256-GCM）。

### `PUT /api/admin/billing/channels/alipay/config`
请求体即 `AlipayConfig`（完整覆盖）。**敏感字段更新语义**（与 08 providers / 12 SMTP 一致）：
- 字段省略 / `null` → 不变更
- 空字符串 `""` → 清空（仅在解绑场景使用）
- 非空字符串 → 整体替换
成功响应：`204 No Content`。

### `GET /api/admin/billing/channels/wechat_pay/config`
成功响应（`WechatPayConfig`，未配置返回 `null`）：

```json
{
  "app": {
    "id":    "wxabcdef0123456789",
    "mchId": "1900000000"
  },
  "credentials": {
    "apiV3Key":     "32位随机字符串",
    "certSerialNo": "5157F09EFDC096DE15EBE81A47057A727...",
    "privateKey":   "-----BEGIN PRIVATE KEY-----\n..."
  },
  "endpoints": {
    "notifyUrl": "https://api.meeko.example/api/billing/wechat_pay/notify"
  },
  "environment": {
    "isSandbox": false
  }
}

```

> 微信支付与支付宝**遵循同一分组结构**（`app` / `credentials` / `endpoints` / `environment`），减少前端表单组件的特殊分支。
> `credentials.apiV3Key` 与 `credentials.privateKey` 的脱敏 / 加密原则与支付宝一致。

### `PUT /api/admin/billing/channels/wechat_pay/config`
请求体即 `WechatPayConfig`，敏感字段更新语义同上。成功响应：`204 No Content`。

## 交互流程

```

onMounted → listChannels()
点击「配置」 → 抽屉打开 → getAlipayConfig / getWechatPayConfig 回填
保存 → saveAlipayConfig / saveWechatPayConfig → 重新 listChannels()
启用/停用 → setActive(code, !isActive) → 更新单行

```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺必填、证书格式错误、URL 非 https |
| 403 | `forbidden` | 非 Admin |
| 409 | `conflict` | 启用未配置的渠道 |
| 502 / 504 | `upstream` / `timeout` | 服务端做证书在线校验时上游异常（可选） |

## 备注

- 平台只会有**两个**渠道；增加新支付方式时需要前端追加 `paymentProviderCodes`、新表单组件与抽屉分支，与 BFF 同步发布。
- 通知 URL（`notifyUrl`）必须是公网可达的 HTTPS；BFF 内部的验签逻辑由 essensoft/paylink 处理。
