# 15 · 通知调试

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/notices/debug` |
| 角色 | **Admin** |
| 视图 | `src/features/notices/views/NotificationsDebugView.vue` |
| Port | `src/features/notices/services/ports/notificationsPort.ts` |

## 业务定义

> 一站式调试 `/api/notifications` 与 OTP 端点的页面，**直接对接 BFF 业务端通用通知接口**（不仅限 Admin 后台）。
>
> 三张卡片对应三类操作：
>
> 1. **发送通知**（通用，按 templateCode 渲染并投递）
> 2. **发送 OTP**（专用，BFF 内部走 1 类 templateCode）
> 3. **校验 OTP**（消费验证码）

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 发送通知 | `sendNotification(payload)` | POST | `/api/notifications` |
| 发送 OTP | `sendOtp(payload)` | POST | `/api/notifications/otp/send` |
| 校验 OTP | `verifyOtp(payload)` | POST | `/api/notifications/otp/verify` |

## 请求 / 响应

### `POST /api/notifications` （`SendNotificationPayload`）

```json
{
  "channel": "email",
  "purpose": "generic",
  "recipient": "alice@example.com",
  "template": {
    "code":   "welcome",
    "locale": "zh-CN",
    "data": {
      "displayName": "Alice",
      "appName":     "Meeko"
    }
  },
  "idempotencyKey": "9c4e1f2a-1c1d-4b7e-99a8-a5e7b1b9b321"
}

```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `channel` | enum | 是 | `email` / `sms`（**小写字符串枚举**，与全局风格一致）。 |
| `purpose` | enum | 是 | 业务用途分类：`generic` / `otp` / `marketing`。 |
| `recipient` | string | 是 | 收件人（邮箱 / 手机号）。 |
| `template` | object | 是 | 模板族：`{ code, locale, data }`。封装后未来加 `version` / `attachments` 不污染顶层。 |
| `template.code` | string | 是 | 模板 code（参见 [`13`](./13-notices-email-templates.md)）。 |
| `template.locale` | string | 否 | 缺省取模板 default locale。 |
| `template.data` | `Record<string,string>` | 否 | 占位符变量；BFF 应在缺占位时返回 400。 |
| `idempotencyKey` | string | 否 | 24h 内重复请求会返回原 message。 |
成功响应：

```json
{
  "message": {
    "id":     "MSG-001-abc",
    "status": "queued"
  }
}

```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `message.id` | string | BFF 落库的消息 ID（不一定是 SMTP providerMessageId）。 |
| `message.status` | enum | `queued` / `sent` / `failed`，由 BFF 决定。 |

> 封装 `message` 子对象后，未来扩 `message.providerMessageId` / `message.deliveredAtUtc` 时不会改顶层结构。

### `POST /api/notifications/otp/send` （`SendOtpPayload`）

```json
{
  "purpose":   "login",
  "channel":   "email",
  "recipient": "alice@example.com",
  "accountUid": "100000001",
  "locale": "zh-CN",
  "idempotencyKey": "9c4e1f2a-1c1d-4b7e-99a8-a5e7b1b9b321"
}

```

**字符串枚举**（与 00-conventions 第 6 节"全平台字符串枚举"约定对齐；原 magic number 已废弃）：
| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `purpose` | `login` / `register` / `reset_password` / `change_email` / `risk_verify` / `bind_mfa` | 六种业务场景 |
| `channel` | `email` / `sms` | 与 `SendNotificationPayload.channel` 一致 |

> BFF 内部数据库可仍用 tinyint 存储（性能 / 索引），但**对外 API 一律字符串枚举**——magic number 既不利于阅读 swagger、也不利于跨语言客户端类型推导。
成功响应：

```json
{
  "audit": {
    "id":           "AUDIT-001",
    "expiresAtUtc": "2025-09-12T11:10:00Z"
  }
}

```

| 字段 | 说明 |
| --- | --- |
| `audit.id` | 审计记录主键，**verify 时回传**以便关联同一 send 事件。 |
| `audit.expiresAtUtc` | OTP 失效时间。 |

### `POST /api/notifications/otp/verify` （`VerifyOtpPayload`）

```json
{
  "purpose":   "login",
  "channel":   "email",
  "recipient": "alice@example.com",
  "code":      "634281",
  "auditUid":  "AUDIT-001"
}

```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `purpose` / `channel` / `recipient` / `code` | — | 是 | — |
| `auditUid` | string | 否（**强烈推荐**） | send 时拿到的 `audit.uid`；用于审计关联与多发场景下定位"对哪条 OTP 验证"。BFF 在 `recipient + purpose + channel` 仍能唯一定位时可不传。 |
成功响应（OTP 验证通过）：

```json
{
  "ok": true,
  "remainingAttempts": 4,
  "error": null
}

```

失败示例（与 08 / 12 错误对象形状一致）：

```json
{
  "ok": false,
  "remainingAttempts": 3,
  "error": { "code": "mismatch" }
}

```

```json
{
  "ok": false,
  "remainingAttempts": 0,
  "error": { "code": "locked", "message": "rate-limited for 600s" }
}

```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | boolean | 是否验证通过。**与 08 / 12 / SMTP test 一致的 `ok + error` 二元结构**。 |
| `remainingAttempts` | int | 剩余尝试次数，归零后锁 5~10 分钟（BFF 决定）。 |
| `error` | object \| null | `ok===true` 时为 `null`；否则 `{ code, message? }`，`code` ∈ `mismatch` / `expired` / `consumed` / `locked` / `audit_mismatch`。 |

> **业务级失败 vs 协议级失败**：本接口的 `ok: false` 表示"OTP 没通过验证"（业务语义），HTTP 仍是 `200 OK`——这与登录密码错误返回 `401 unauthorized` 不同：OTP 验证失败是常态、需要让前端拿 `remainingAttempts` 继续展示；只有当 `purpose` / `channel` 非法等**协议层错误**才走 `4xx + ProblemDetails`。

## 交互流程

```

"发送通知" 表单 → sendNotification → 展示 message.id + message.status
"发送 OTP" 表单 → sendOtp → 展示 audit.uid + audit.expiresAtUtc
"校验 OTP" 表单 → verifyOtp（携带 auditUid）→ 展示 ok / error.code + remainingAttempts

```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段缺失 / `templateData` 缺占位符 / `recipient` 非邮箱或手机 |
| 401 | `unauthorized` | token 失效 |
| 404 | `not_found` | `templateCode` 不存在 / 已停用 |
| 429 | `too_many_requests` | OTP 触发频控；响应头 `Retry-After` + `error.retryAfterSeconds` |
| 502 / 504 | `upstream` / `timeout` | SMTP / 短信通道异常 |

## 备注

- 前端 `idempotencyKey` 建议用 `nanoid()` 在表单提交时生成；同表单重复点击 < 24h 内返回同一结果。
- BFF 推荐对 OTP `sendOtp` 做强频控：同 recipient 60 秒内仅 1 次；连续失败递增退避。
