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
| 取单个模板（按 uid） | `getEmailTemplate(uid)` | GET | `/api/admin/notice/templates/email/{uid}` |
| 取单个模板（按 code + locale，列表端点过滤） | `findEmailTemplate(code, locale)` | GET | `/api/admin/notice/templates/email?code={code}&locale={locale}` |
| 列出修订时间线 | `listEmailRevisions(uid)` | GET | `/api/admin/notice/templates/email/{uid}/revisions` |
| 更新（自动写入新版本） | `updateEmailTemplate(uid, payload)` | PUT | `/api/admin/notice/templates/email/{uid}` |
| SMTP 渠道字典 | `listSmtpProviders` | GET | `/api/admin/notice/channels/smtp` |

## 请求 / 响应

### 取模板（按 uid） `GET /api/admin/notice/templates/email/{uid}`

成功响应：单条 `EmailTemplate`（与 13 列表元素结构一致，含 `content` 子对象）。

### 取模板（按 code + locale） `GET /api/admin/notice/templates/email?code=&locale=`

复用列表端点：`code` + `locale` 同时存在 → 单条查询。响应：`EmailTemplate | null`（不存在时 HTTP 200 + body `null`）。

> 两个端点并存的理由：路由能拿到 `:code/:locale` 但拿不到 `uid` 时直查 query 端点最方便；其它场景（侧栏跳详情）则按 `uid` 直查更稳定。

### 修订时间线 `GET /api/admin/notice/templates/email/{uid}/revisions`

成功响应（`EmailTemplateRevision[]`，按版本号倒序）：

```json
[
  {
    "version": 3,
    "content": {
      "subject": "欢迎加入 {{appName}}",
      "body":    "Hi {{displayName}}, 感谢注册！",
      "isHtml":  true
    },
    "change": {
      "byIamUserUid": "200000099",
      "atUtc":        "2025-09-01T08:21:33Z",
      "note":         "增加品牌名占位符"
    }
  },
  {
    "version": 2,
    "content": {
      "subject": "欢迎加入 Meeko",
      "body":    "Hi 同学，感谢注册！",
      "isHtml":  true
    },
    "change": {
      "byIamUserUid": "200000099",
      "atUtc":        "2025-08-12T09:10:11Z",
      "note":         "首次启用"
    }
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | int | 单调递增。 |
| `content` | object | 该版本的完整内容快照 `{ subject, body, isHtml }`。**与 `EmailTemplate.content` 形状完全一致**，前端做"回填旧版本"时直接 `form.content = revision.content` 整段赋值即可。 |
| `change` | object | 变更元数据 `{ byIamUserUid, atUtc, note }`。`byIamUserUid` 在系统迁移 / 初始数据时可为 `null`；`note` 同理。 |

### 更新 `PUT /api/admin/notice/templates/email/{uid}` （`UpdateEmailTemplatePayload`）

```json
{
  "content": {
    "subject": "欢迎加入 {{appName}}！",
    "body":    "<p>Hi {{displayName}}，</p><p>感谢加入 {{appName}}。</p>",
    "isHtml":  true
  },
  "description": "新用户注册成功欢迎邮件 v3",
  "isActive": true,
  "changeNote": "调整正文 HTML 排版",
  "smtpProviderUid": "SMTP-001"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `content` | object | 是 | `{ subject, body, isHtml }` 一次完整覆盖。 |
| `isActive` | boolean | 是 | 启用与否（注：高频独立切换请走 13 的 `PATCH /active` 端点，避免被卷入新版本写入）。 |
| `description` | string \| null | 否 | 内部备注 |
| `changeNote` | string \| null | 否 | 写入版本历史的 `change.note`（推荐填写） |
| `smtpProviderUid` | string \| null | 否 | 不传 / null = 使用默认渠道 |

> **每次成功更新都会**：
> 1. 把 `currentVersion + 1` 的新快照写入 `revisions` 表，包括 `change.byIamUserUid`（从 `Authorization` 解出）、`change.atUtc`、`change.note = payload.changeNote`；
> 2. 更新模板表的 `content` / `isActive` / `smtpProviderUid` / `updatedAtUtc` / `currentVersion`。

成功响应：`200 OK` + 更新后的 `EmailTemplate`（含新的 `currentVersion`），与 13 列表元素结构一致。

> **`AdminCommandResult` 已退役**：失败一律走 ProblemDetails（见错误码表）。

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
