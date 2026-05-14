# 12 · 邮件渠道（SMTP）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/notices/email/channels` |
| 角色 | **Admin** |
| 视图 | `src/features/notices/views/ChannelsView.vue` |
| 子组件 | `src/features/notices/components/SmtpForm.vue` |
| Port | `src/features/notices/services/ports/noticeAdminPort.ts`（SMTP 段） |

## 业务定义

> SMTP 发信渠道。每个渠道是一份发信凭据 + 发件人元数据，可被多个邮件模板绑定。
>
> 一个平台可有多个 SMTP 渠道：
> - 其中**最多一个** `isDefault=true`（系统默认渠道）；
> - 未绑定专属渠道的模板会回退到默认渠道。
> - `isActive=false` 的渠道不会被调度，前端选择器会禁用。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `listSmtpProviders` | GET | `/api/admin/notice/channels/smtp` |
| 详情 | `getSmtpProvider(uid)` | GET | `/api/admin/notice/channels/smtp/{uid}` |
| 新增 | `createSmtpProvider(payload)` | POST | `/api/admin/notice/channels/smtp` |
| 更新 | `updateSmtpProvider(uid, payload)` | PUT | `/api/admin/notice/channels/smtp/{uid}` |
| 删除 | `deleteSmtpProvider(uid)` | DELETE | `/api/admin/notice/channels/smtp/{uid}` |
| 连通测试 | `testSmtpProvider(uid, payload)` | POST | `/api/admin/notice/channels/smtp/{uid}/test` |

## 请求 / 响应

### 列表 `GET /api/admin/notice/channels/smtp`

成功响应（`SmtpProviderDto[]`，**无分页**）：

```json
[
  {
    "uid": "SMTP-001",
    "name": "Mailgun 主线",
    "host": "smtp.mailgun.org",
    "port": 587,
    "username": "postmaster@mg.meeko.example",
    "useStartTls": true,
    "fromAddress": "no-reply@meeko.example",
    "fromName": "Meeko",
    "isActive": true,
    "isDefault": true,
    "priority": 10,
    "createdAtUtc": "2024-09-01T00:00:00Z",
    "updatedAtUtc": "2025-09-01T00:00:00Z"
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 渠道展示名。 |
| `host` / `port` | string / int | SMTP 服务器地址。 |
| `username` | string \| null | 登录名。 |
| `useStartTls` | boolean | 是否启用 STARTTLS。 |
| `fromAddress` / `fromName` | string | 发件人邮箱与显示名。 |
| `isActive` | boolean | 启用与否。 |
| `isDefault` | boolean | 系统默认渠道（最多一个）。 |
| `priority` | int | 优先级（用于未来主备分流）。 |

> ⚠️ `password` 不在响应字段中（敏感数据），前端表单使用"留空 = 不变更"语义。

### 新增 `POST /api/admin/notice/channels/smtp` （`CreateSmtpPayload`）

```json
{
  "name": "SES 备线",
  "host": "email-smtp.us-east-1.amazonaws.com",
  "port": 587,
  "username": "AKIA...",
  "password": "BNa...",
  "useStartTls": true,
  "fromAddress": "no-reply@meeko.example",
  "fromName": "Meeko",
  "isActive": true,
  "isDefault": false,
  "priority": 20
}
```

成功响应（`AdminCommandResult`）：

```json
{ "success": true, "uid": "SMTP-002", "failureCode": null, "failureMessage": null }
```

### 更新 `PUT /api/admin/notice/channels/smtp/{uid}` （`UpdateSmtpPayload`）

```json
{
  "name": "Mailgun 主线（重命名）",
  "host": "smtp.mailgun.org",
  "port": 587,
  "username": "postmaster@mg.meeko.example",
  "password": null,
  "useStartTls": true,
  "fromAddress": "no-reply@meeko.example",
  "fromName": "Meeko",
  "isActive": true,
  "isDefault": true,
  "priority": 10
}
```

`password` 字段语义：
- `null` / 字段省略 → **不变更**密码；
- 非空字符串 → 覆写密码；
- 空字符串 `""` → 清空（仅在解绑场景使用）。

成功响应同 `AdminCommandResult`。

> 设置某条 `isDefault=true` 应由 BFF 在事务内将其它行置为 `false`，确保唯一性。

### 删除 `DELETE /api/admin/notice/channels/smtp/{uid}`

成功响应：

```json
{ "success": true, "uid": "SMTP-002", "failureCode": null, "failureMessage": null }
```

> 删除后，绑定该渠道的邮件模板会回退到 `isDefault=true` 的默认渠道。
> 若删除的就是默认渠道，BFF 应：
> 1. 选择另一个 `isActive=true` 渠道升级为默认；
> 2. 或返回 `conflict` 拒绝删除（推荐，要求用户先指定新默认）。

### 测试 `POST /api/admin/notice/channels/smtp/{uid}/test` （`TestSmtpPayload`）

```json
{
  "recipient": "qa@example.com",
  "subject": "Meeko SMTP Test",
  "body": "hello"
}
```

成功响应（`TestSmtpProviderResult`）：

```json
{
  "success": true,
  "providerMessageId": "<2025091203@mailgun.example>",
  "elapsedMs": 612,
  "failureCode": null,
  "failureMessage": null
}
```

失败示例：

```json
{
  "success": false,
  "providerMessageId": null,
  "elapsedMs": 4000,
  "failureCode": "auth_failed",
  "failureMessage": "535 5.7.8 Username and Password not accepted"
}
```

## 交互流程

```
onMounted → useSmtpList.run() → listSmtpProviders()
新增 / 编辑 → 抽屉 SmtpForm → createSmtpProvider / updateSmtpProvider → run()
连通测试 → testSmtpProvider(uid, fixedPayload) → ElMessage 显示结果
删除 → confirmDanger → deleteSmtpProvider → run()
```

`AdminCommandResult` 中 `success: false` 时 `failureCode` / `failureMessage` 必填，便于前端做 i18n 提示。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段缺失 / `port` 越界 / `fromAddress` 非邮箱格式 |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | uid 不存在 |
| 409 | `conflict` | 删除默认渠道但无可顶替者 |
| 502 / 504 | `upstream` / `timeout` | 测试时 SMTP 服务器无响应 |
