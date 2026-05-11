# Meeko 管理后台（Web）

基于 **Vue 3 + Vite + Vue Router + Pinia + TypeScript + Element Plus** 的纯前端管理台。默认使用本地 **Mock** 数据，不发起真实 HTTP；将来接入 BFF 时只新增 `src/features/*/services/bff` 与工厂中的 Adapter 实现，**不修改**各 feature 的 Port 接口与视图/Store 的调用方式。

## 环境要求

- Node.js **>= 20**
- 包管理器推荐 **pnpm**

## 记录版本（与 `package.json` 一致，安装日稳定版）

| 依赖 | 版本 |
| --- | --- |
| vue | 3.5.34 |
| vue-router | 5.0.6 |
| pinia | 3.0.4 |
| element-plus | 2.14.0 |
| @element-plus/icons-vue | 2.3.2 |
| zod | 4.4.3 |
| dayjs | 1.11.20 |
| nanoid | 5.1.11 |
| vite | 8.0.12 |
| vue-tsc | 3.2.8 |
| typescript | 6.0.3 |
| vitest | 4.1.5 |
| eslint | 10.3.0 |
| prettier | 3.8.3 |

> 若升级依赖，请同步更新上表与 `package.json`。

## 目录结构（要点）

- `src/shared/`：布局、通用组件、工具（`lib`）、`composables`、联机类型 `api` / `api-types`、问题详情等；**不**依赖 `features/*`。
- `src/features/accounts`：账户与 IAM 用户（Keystone 语义，Port + Mock）。
- `src/features/billing`：计费工作台（BFF `/api/billing` 语义，Port + Mock）。
- `src/features/notices`：通知管理（Admin 模板/SMTP + 用户侧通知调试，Port + Mock）。
- `src/stores/`：横切状态（`auth`、计费当前账户等）。
- `src/router/`：懒加载路由、鉴权与 `meta`（`title` / `requiresAuth` / `roles`）。

## 环境变量

复制 `.env.example` 为 `.env`（或依赖 Vite 默认）：

- `VITE_USE_MOCK`：默认 `true`；设为 `false` 时各 `get*Port()` 会要求已实现的 HttpAdapter（当前会抛错提示需实现文件）。
- `VITE_MOCK_DELAY_MS`：Mock 延迟（毫秒），默认 220。
- `VITE_API_BASE`：开发时代理上游；仅真连 BFF 时使用。

## 命令

```bash
pnpm dev          # 开发
pnpm build        # 类型检查 + 生产构建
pnpm test         # Vitest
pnpm test:watch
pnpm lint
pnpm type-check
```

## Mock 登录与角色

- 使用 `auth` store + `localStorage` 持久化。
- 用户名 `admin` → 角色 `Admin`（可访问 **通知** 下管理页）；`owner` → `Owner`；其他 → `Member`。
- 受 `meta.roles` 保护的路由（如 `/notices/*`）非 Admin 会重定向到账户列表。

## 未来接入 BFF 需实现的 Adapter（清单）

- `HttpAccountAdminAdapter`：`/accounts`、`/iam/users` 等（与 `AccountAdminPort` 对齐；JSON camelCase，long uid 用 string）。
- `HttpBillingAdapter`：`/api/billing` 下钱包、订单、订阅、发票、充值（与 `BillingPort` 对齐）。
- `HttpNoticeAdminAdapter`：`/api/admin/notice/templates/email`、`/api/admin/notice/channels/smtp`（与 `NoticeAdminPort` 对齐）。
- `HttpNotificationsAdapter`：`/api/notifications` 与 `/api/notifications/otp/*`（与 `NotificationsPort` 对齐）。

在对应 `get*Port()` 工厂中按 `VITE_USE_MOCK` 注册上述类即可；**视图与 composable 只依赖 Port 接口。**

## 自测建议

1. `pnpm dev`，用 `admin/admin` 登录，确认侧栏含「通知」。
2. 账户：列表筛选、详情、子账号创建（Mock 延迟可感受 loading）。
3. 账单：切换「当前账户」各 Tab 数据是否随账户变化；充值大额触发二次确认；订阅「期末取消」需确认。
4. 通知：模板列表/编辑/修订时间线；SMTP 列表/抽屉表单/测试/删除；调试页发送通知与 OTP（无真实网络）。
