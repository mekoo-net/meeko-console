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
  "channel": "Email",
  "purpose": "Generic",
  "recipient": "alice@example.com",
  "templateCode": "welcome",
  "locale": "zh-CN",
  "templateData": {
    "displayName": "Alice",
    "appName": "Meeko"
  },
  "idempotencyKey": "9c4e1f2a-1c1d-4b7e-99a8-a5e7b1b9b321"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `channel` | string | 是 | 当前主要走 `Email`；后续可接入 `SMS`。 |
| `purpose` | string | 是 | 业务用途分类，`Generic` / `Otp` / `Marketing` 等。 |
| `recipient` | string | 是 | 收件人（邮箱 / 手机号）。 |
| `templateCode` | string | 是 | 模板 code（参见 [`13`](./13-notices-email-templates.md)）。 |
| `locale` | string | 否 | 缺省取模板 default locale。 |
| `templateData` | `Record<string,string>` | 否 | 占位符变量；BFF 应在缺占位时返回 400。 |
| `idempotencyKey` | string | 否 | 24h 内重复请求会返回原 messageId。 |

成功响应（`SendNotificationResponse`）：

```json
{
  "messageId": "MSG-001-abc",
  "status": "queued"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `messageId` | string | BFF 落库的消息 ID（不一定是 SMTP providerMessageId）。 |
| `status` | string | `queued` / `sent` / `failed`，由 BFF 决定。 |

### `POST /api/notifications/otp/send` （`SendOtpPayload`）

```json
{
  "purpose": 1,
  "channel": 1,
  "recipient": "alice@example.com",
  "accountUid": "100000001",
  "locale": "zh-CN",
  "idempotencyKey": "9c4e1f2a-1c1d-4b7e-99a8-a5e7b1b9b321"
}
```

枚举（数值字面量，前端用 `Number(key)` 渲染）：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `purpose` | 1=登录 / 2=注册 / 3=重置密码 / 4=更换邮箱 / 5=风控核验 / 6=绑定 MFA | |
| `channel` | 1=邮件 / 2=短信 | 与 `NoticeChannel` 一致 |

成功响应（`SendOtpResponse`）：

```json
{
  "auditUid": "AUDIT-001",
  "expiresAtUtc": "2025-09-12T11:10:00Z"
}
```

| 字段 | 说明 |
| --- | --- |
| `auditUid` | 审计 ID，便于关联后续 verify 调用。 |
| `expiresAtUtc` | OTP 失效时间。 |

### `POST /api/notifications/otp/verify` （`VerifyOtpPayload`）

```json
{
  "purpose": 1,
  "channel": 1,
  "recipient": "alice@example.com",
  "code": "634281"
}
```

成功响应（`VerifyOtpResponse`）：

```json
{
  "status": "ok",
  "remainingAttempts": 4
}
```

| 字段 | 说明 |
| --- | --- |
| `status` | `ok` / `mismatch` / `expired` / `consumed` / `locked`。 |
| `remainingAttempts` | 剩余尝试次数，归零后锁 5~10 分钟（BFF 决定）。 |

## 交互流程

```
"发送通知" 表单 → sendNotification → 展示 messageId + status
"发送 OTP" 表单 → sendOtp → 展示 auditUid + expiresAtUtc
"校验 OTP" 表单 → verifyOtp → 展示 status + remainingAttempts
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
