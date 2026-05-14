# 13 · 邮件模板列表

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/notices/email/templates` |
| 角色 | **Admin** |
| 视图 | `src/features/notices/views/EmailTemplateListView.vue` |
| Port | `noticeAdminPort` 的模板段 + SMTP 段（用于渲染"发信渠道"列） |

## 业务定义

> 邮件模板（`EmailTemplateDto`）三元主键：`code + locale + version`。
>
> - `code`：模板代码，用户业务侧通过该 code 引用（如 `welcome`、`otp_login`）。
> - `locale`：语言区域（`zh-CN`、`en-US` 等）。
> - 同一 `code + locale` 可有多个版本（修订），列表只展示**当前生效版本**（`currentVersion`）。

模板可绑定特定 SMTP 渠道（`smtpProviderUid`），未绑定则回退到 `isDefault=true` 的默认渠道。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表（含 code/locale/version/绑定渠道） | `listEmailTemplates` | GET | `/api/admin/notice/templates/email` |
| 单条查询（按 uid） | `getEmailTemplate(uid)` | GET | `/api/admin/notice/templates/email/{uid}` |
| 新建（含初始版本） | `createEmailTemplate` | POST | `/api/admin/notice/templates/email` |
| 切换启停 | `setEmailTemplateActive(uid, active)` | PATCH | `/api/admin/notice/templates/email/{uid}/active` |
| 删除（软删） | `deleteEmailTemplate(uid)` | DELETE | `/api/admin/notice/templates/email/{uid}` |
| SMTP 渠道字典（用于显示绑定名） | `listSmtpProviders` | GET | `/api/admin/notice/channels/smtp` |

> 注：编辑 / 修订时间线在「编辑模板」页（详见 [`14-notices-email-template-edit.md`](./14-notices-email-template-edit.md)）。
>
> **`PATCH /active` 端点的存在理由**：启停是高频独立动作，避免每次启停都要回传一整份 `content`（且容易并发污染版本号）。也符合 RESTful "动词最小化、状态切换专用端点" 原则。

## 请求 / 响应

### 列表 `GET /api/admin/notice/templates/email`

成功响应（`EmailTemplate[]`，**无分页**）：

```json
[
  {
    "uid": "TPL-001",
    "code": "welcome",
    "locale": "zh-CN",
    "content": {
      "subject": "欢迎加入 {{appName}}",
      "body":    "Hi {{displayName}}, 感谢注册！",
      "isHtml":  true
    },
    "description": "新用户注册成功欢迎邮件",
    "currentVersion": 3,
    "isActive": true,
    "smtpProviderUid": "SMTP-001",
    "createdAtUtc": "2024-09-01T00:00:00Z",
    "updatedAtUtc": "2025-09-01T00:00:00Z"
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | 模板主键（每个 `code + locale` 组合一个 uid）。 |
| `code` | string | 业务代码，唯一（同 locale 下）。 |
| `locale` | string | 语言区域，建议 IETF BCP 47（`zh-CN`、`en-US`）。 |
| `content` | object | 当前版本内容族：`{ subject, body, isHtml }`，支持 Mustache 占位符 `{{name}}`。封装后未来加 `previewText` / `attachments` 不污染顶层；revisions 项也复用同一形状。 |
| `currentVersion` | int | 当前生效版本号。 |
| `isActive` | boolean | 启用与否（false 时业务侧引用会被拒绝）。 |
| `smtpProviderUid` | string \| null | 绑定的 SMTP 渠道 UID；`null` 表示使用默认渠道。 |

### 新建 `POST /api/admin/notice/templates/email` （`CreateEmailTemplatePayload`）

```json
{
  "code": "otp_login",
  "locale": "zh-CN",
  "content": {
    "subject": "你的登录验证码：{{code}}",
    "body":    "<p>你好 {{displayName}}：</p><p>登录验证码为 <b>{{code}}</b>，10 分钟内有效。</p>",
    "isHtml":  true
  },
  "description": "登录 OTP 邮件模板",
  "isActive": true,
  "smtpProviderUid": "SMTP-001"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | string | 是 | 唯一标识，同 locale 下不可重复。 |
| `locale` | string | 是 | 缺省可由 BFF 默认 `zh-CN`。 |
| `content` | object | 是 | `{ subject, body, isHtml }` 三字段全必填。占位符 `{{var}}` 在 `subject` / `body` 内。 |
| `description` | string | 否 | 内部备注。 |
| `isActive` | boolean | 是 | 创建即决定是否启用。 |
| `smtpProviderUid` | string \| null | 否 | 不传 / null = 使用默认渠道。 |

成功响应：`201 Created` + 创建后的 `EmailTemplate`（与列表元素结构一致）。

失败示例（code 冲突）—— 走标准 ProblemDetails：

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
```

```json
{
  "type":   "about:blank",
  "title":  "模板代码冲突",
  "status": 409,
  "code":   "conflict",
  "detail": "模板代码 otp_login 在 locale=zh-CN 下已存在",
  "errors": { "code": ["code_conflict"] }
}
```

> **`AdminCommandResult` 已退役**：成功 / 失败一律走 HTTP 状态码 + ProblemDetails，与 00-conventions 第 1 节统一。

## 交互流程

```
onMounted → useEmailTemplateList.run() + useSmtpList.run()
新建对话框 → createEmailTemplate → run() → router.push 进入编辑页（带入 code/locale）
点击行「编辑」 → router.push('/notices/email/templates/:code/:locale')
渠道列展示 → providerName(uid) ← 从 SMTP 列表 join
```

### 启停 `PATCH /api/admin/notice/templates/email/{uid}/active`

```json
{ "active": false }
```

成功响应：`200 OK` + 更新后的 `EmailTemplate`。

> 启停不会写入新版本（不算"内容变更"），但 `updatedAtUtc` 会刷新。

### 删除 `DELETE /api/admin/notice/templates/email/{uid}`

软删（00-conventions 第 9 节）。成功响应：`204 No Content`。

> 软删后业务侧再引用此 `code+locale` 返回 `404 not_found`；管理员可通过 `?includeDeleted=true` 列出。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段缺失 / `code` 含非法字符 |
| 403 | `forbidden` | 非 Admin |
| 409 | `conflict` | 同 `code + locale` 已存在 |
| 404 | `not_found` | `smtpProviderUid` 不存在或已删除 / `uid` 不存在 |

## 备注

- 占位符语法约定 Mustache：`{{variable}}`；业务侧调用 `/api/notifications` 发送时通过 `templateData` 传值。
- 列表不分页是因为模板数量量级低（通常 < 100 条）；若未来超出再补 `?page=&pageSize=`。
- `content` 子对象设计与 14-edit 的 revisions 项形状保持一致 —— 每条 revision 也是 `{ content: { subject, body, isHtml }, change: {...} }`，便于前端"回填旧版本到当前表单"时直接 `form.content = revision.content` 整段赋值。
