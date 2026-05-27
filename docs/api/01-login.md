# 01 · 登录页（管理后台 · Staff）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/login` |
| 角色 | 公开（未登录可访问） |
| 视图 | `src/features/auth/views/LoginView.vue` |
| Store | `src/stores/auth.ts`（`useAuthStore`） |

> **本仓库是 Meeko 平台管理后台（`meeko-console`）**，登录主体是 **Keystone Staff 员工**，不是终端用户的 IAM 邮箱登录。
> 终端用户（如 `demuxai-web`）才走 `POST /auth/login`（邮箱 + 密码）。

## 接口清单

| 业务动作 | HTTP | REST 端点 | 入参 | 出参 |
| --- | --- | --- | --- | --- |
| 员工用户名/密码登录 | POST | `/staff/auth/login` | `StaffLoginRequest` | `StaffLoginResponse` |
| 登出 | — | 仅清本地 session | — | — |

> Staff **不签发** `refreshToken`；Access TTL 约 8 小时，过期后重新登录。

## 请求 / 响应

### `POST /staff/auth/login`
经 Gateway（默认 `http://localhost:7000`）转发到 Keystone。
请求体：

```json
{
  "username": "admin",
  "password": "Meeko@dev123"
}

```

成功响应（camelCase，与 `MeekoJsonOptions` 一致）：

```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "staff": {
    "uid": "1234567890",
    "displayName": "Meeko Dev Admin",
    "role": "SuperAdmin"
  }
}

```

| 字段 | 说明 |
| --- | --- |
| `staff.role` | Keystone Staff 角色：`SuperAdmin` / `ReadOnly` |
| JWT | `actor=staff`，claim `stuid` = Staff UID；issuer/audience 与 Account JWT 不同 |

### 前端角色映射（`auth.ts`）
管理端 UI 仍使用 `AppRole = 'Admin' \| 'Owner' \| 'Member'` 做路由守卫，由 Staff 角色映射：
| Staff `role` | `AppRole`（侧栏/路由） |
| --- | --- |
| `SuperAdmin` | `Admin` |
| `ReadOnly` | `Member` |
会话写入 `localStorage`（`meeko.admin.session.v1`）。`account` / `iamUser` 字段为兼容壳层结构的占位，**不代表**终端租户 IAM 用户。

## 开发默认账号

`Meeko.Keystone` 每次部署启动（Migrate 后）若无 `admin` 会自动种子一条 Staff：
| 用户名 | 密码 |
| --- | --- |
| `admin` | `Meeko@dev123` |

## Mock 模式
`VITE_USE_MOCK=true` 时不请求后端；用户名 `admin` / `owner` / 其他 映射到 `AppRole`，用于本地演示侧栏权限。

## 与终端用户登录的区别

| 项目 | meeko-console（本仓库） | demuxai-web（用户端） |
| --- | --- | --- |
| 登录端点 | `POST /staff/auth/login` | `POST /auth/login` |
| 凭证 | **用户名** + 密码 | **邮箱** + 密码 |
| 主体 | Staff 员工 | IAM 用户（Account 域） |
