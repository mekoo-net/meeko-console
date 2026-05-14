# 14 · 编辑邮件模板

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/notices/email/templates/:code/:locale` |
| 角色 | **Admin** |
| 视图 | `src/features/notices/views/EmailTemplateEditView.vue` |
| 子组件 | `src/features/notices/components/TemplateRevisionTimeline.vue` |
| Port | `noticeAdminPort`（模板段） |

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 取单个模板（按 code + locale） | `getEmailTemplate(code, locale)` | GET | `/api/admin/notice/templates/email?code={code}&locale={locale}` |
| 列出修订时间线 | `listEmailRevisions(uid)` | GET | `/api/admin/notice/templates/email/{uid}/revisions` |
| 更新（自动写入新版本） | `updateEmailTemplate(uid, payload)` | PUT | `/api/admin/notice/templates/email/{uid}` |
| SMTP 渠道字典 | `listSmtpProviders` | GET | `/api/admin/notice/channels/smtp` |

## 请求 / 响应

### 取模板 `GET /api/admin/notice/templates/email`

> 这里复用列表端点，配合 `code + locale` 过滤。也可单独暴露 `/templates/email/{uid}`，前端两者皆支持。

参数：`code` + `locale` 同时存在 → 单条查询。

响应：单条 `EmailTemplateDto`（与列表元素结构一致）；不存在返回 `null`（HTTP 200 + body `null`）。

### 修订时间线 `GET /api/admin/notice/templates/email/{uid}/revisions`

成功响应（`EmailTemplateRevisionDto[]`，按版本号倒序）：

```json
[
  {
    "version": 3,
    "subject": "欢迎加入 {{appName}}",
    "body": "Hi {{displayName}}, 感谢注册！",
    "isHtml": true,
    "changedBy": "200000099",
    "changedAtUtc": "2025-09-01T08:21:33Z",
    "changeNote": "增加品牌名占位符"
  },
  {
    "version": 2,
    "subject": "欢迎加入 Meeko",
    "body": "Hi 同学，感谢注册！",
    "isHtml": true,
    "changedBy": "200000099",
    "changedAtUtc": "2025-08-12T09:10:11Z",
    "changeNote": "首次启用"
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | int | 单调递增。 |
| `subject` / `body` | string | 该版本的完整快照。 |
| `isHtml` | boolean | 该版本的 isHtml 配置。 |
| `changedBy` | string \| null | 修改者 IAM uid；系统迁移 / 初始数据可为 null。 |
| `changedAtUtc` | ISO8601 | 写入时间。 |
| `changeNote` | string \| null | 提交时填写的变更说明。 |

### 更新 `PUT /api/admin/notice/templates/email/{uid}` （`UpdateEmailTemplatePayload`）

```json
{
  "subject": "欢迎加入 {{appName}}！",
  "body": "<p>Hi {{displayName}}，</p><p>感谢加入 {{appName}}。</p>",
  "isHtml": true,
  "description": "新用户注册成功欢迎邮件 v3",
  "isActive": true,
  "changeNote": "调整正文 HTML 排版",
  "smtpProviderUid": "SMTP-001"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `subject` / `body` / `isHtml` / `isActive` | — | 是 | 一次完整覆盖 |
| `description` | string \| undefined | 否 | 内部备注 |
| `changeNote` | string \| undefined | 否 | 写入版本历史的 `changeNote`（推荐填写） |
| `smtpProviderUid` | string \| undefined | 否 | 不传 = 默认渠道 |

> **每次成功更新都会**：
> 1. 把 `currentVersion + 1` 的新快照写入 `revisions` 表；
> 2. 更新模板表的 `subject` / `body` / `isHtml` / `isActive` / `smtpProviderUid` / `updatedAtUtc` / `currentVersion`。

成功响应（`AdminCommandResult`）：

```json
{ "success": true, "uid": "TPL-001", "failureCode": null, "failureMessage": null }
```

## 交互流程

```
onMounted → useEmailTemplateEditor(codeRef, localeRef)
  → 内部并发拉：getEmailTemplate + listEmailRevisions
  → useSmtpList.run()

watch(template) → 回填表单
点击「保存」 → updateEmailTemplate(uid, form) → editor.run() 重新拉时间线与模板
点击「返回列表」 → router.push({ name: 'notice-templates' })
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 字段缺失 / 占位符不匹配（如 BFF 端做 Mustache 静态检查） |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | uid / code / locale 组合不存在 |
| 409 | `conflict` | 并发编辑（如服务端启用乐观锁可返回 `version_conflict`） |
| 404 | `not_found` | 绑定的 `smtpProviderUid` 已被删除 |

## 备注

- 占位符语法：Mustache `{{variableName}}`。前端只做格式提示，不做静态校验；BFF 在调用端校验"运行期传入的变量集合是否覆盖模板所有占位符"。
- 历史版本只读；如需"恢复到旧版本"，前端逻辑是把旧版本内容回填到当前表单再保存，**不引入额外 API**。
