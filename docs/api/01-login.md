# 01 · 登录页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/login` |
| 角色 | 公开（未登录可访问） |
| 视图 | `src/features/auth/views/LoginView.vue` |
| Store | `src/stores/auth.ts`（`useAuthStore`） |

## 接口清单

> 当前仓库 Mock 直接构造 session 并写入 `localStorage`；接入真 BFF 时需要补齐以下 Keystone 鉴权接口。

| 业务动作 | HTTP | REST 端点 | 入参 | 出参 |
| --- | --- | --- | --- |
| 用户名/密码登录 | POST | `/auth/login` 或 `/auth/login-iam` | `LoginRequest` | `LoginResponse` |
| 刷新 token | POST | `/auth/refresh` | `{ refreshToken: string }` | `LoginResponse` |
| 登出（撤销 jti） | POST | `/auth/logout` | — | `void` |
| 当前会话权限（建议登录成功后立即请求） | GET | `/auth/permissions` 或 BFF 约定路径 | — | `SessionPermissions` |

## 请求 / 响应

### `POST /auth/login` / `POST /auth/login-iam`

请求体：

```json
{
  "username": "admin",
  "password": "********",
  "tenant": null
}
```

- `tenant` 可选，用于组织子账号登录时指定**目标组织账户**（与 BFF 约定，通常为 `account.uid`）；个人账号登录可省略。

成功响应：登录接口**只负责** —— 令牌（含过期时长）+ 当前租户锚点 + 首屏展示资料。**不返回**权限清单、菜单结构、产品角色等（那些由 **`GET /auth/permissions`** 单独负责）。

```json
{
  "tokenType": "Bearer",
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "expiresIn": 3600,
  "account": {
    "uid": "100000001",
    "type": "personal",
    "sub": "200000001",
    "nickname": "系统管理员",
    "email": "admin@example.com",
    "avatar_url": "https://cdn.example.com/avatars/200000001.png"
  }
}
```

- **`tokenType` / `expiresIn`**：OAuth 2.0 token 响应惯例。`expiresIn` 是 access token 的**剩余有效秒数**，前端据此安排续期；JWT 内部的 `iat` / `exp` 仅供后端验签，前端**不必解码**。
- **`account`**：用户与租户的「首屏展示数据」，`uid` 是租户主键，`sub` 是当前登录 IAM 用户。**不放权限字段**。

#### 响应体字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tokenType` | string | 固定 `"Bearer"`；与 `Authorization: Bearer <accessToken>` 对应。 |
| `accessToken` | string | JWT；调受保护接口时放在 `Authorization` 头。**payload 由后端定义，前端不解码**；payload 形态见下节「JWT payload 约定」。 |
| `refreshToken` | string | 不透明刷新凭证；用于 `/auth/refresh`，TTL 建议 7~30 天（是否 JWT 由 BFF 决定）。 |
| `expiresIn` | number（秒） | access token 剩余有效秒数（OAuth 2.0 `expires_in` 命名）；用于前端续期调度。 |
| `account.uid` | string（long） | 当前会话所属**账户**主键（租户 / 计费边界）。 |
| `account.type` | `'personal' \| 'organization'` | 个人 / 组织。 |
| `account.sub` | string（long） | 当前登录 IAM 用户主键（与 JWT `sub` 一致）。 |
| `account.nickname` | string | 当前登录用户昵称（顶栏等）。 |
| `account.email` | string，可选 | 登录邮箱。 |
| `account.avatar_url` | string（URL），可选 | 头像；可与 **`picture`** 统一字段名。 |

#### JWT payload 约定（仅供后端 / 网关）

此小节描述 `accessToken` 的内部声明；**前端不需要解码 JWT 来获取业务信息**，相关数据已由本接口响应正文 + 权限接口分别提供。

```json
{
  "sub": "200000001",
  "account_uid": "100000001",
  "iat": 1710000000,
  "exp": 1710003600,
  "scopes": [
    "demuxai:provider:read",
    "demuxai:provider:update",
    "demuxai:model:read",
    "billing:bill:read"
  ]
}
```

| 声明 | 类型 | 说明 |
| --- | --- | --- |
| `sub` | string | IAM 用户 UID；与响应 `account.sub` 一致。 |
| `account_uid` | string | 当前会话租户 / 账户主键。 |
| `iat` / `exp` | number | 标准 JWT 时间声明（秒）；前端用响应正文 `expiresIn`，不读这两个。 |
| `scopes` | string[] | **细粒度权限**清单，形如 `<域>:<资源>:<动作>`；**网关 / BFF 用来鉴权**。前端获取人类视图请用 **`GET /auth/permissions`**。 |

- **`scopes` 命名**：`<域>:<资源>:<动作>`，例如 `demuxai:provider:update`、`ecs:instance:reboot`、`billing:bill:read`；**值域由平台权限目录统一注册**，账户管理员只能从目录里分配。缺省即拒绝。
- **不放产品角色字段**：scope 本身即详细授权，不再用 `Admin / Member` 等粗粒度别名跨产品推断权限。
- 兼容历史：组织席位字段 **`role`**（`Owner` / `Member`）若仍存在，仅表示 IAM 在组织里的席位，**不**等价于「某产品 Admin」。

### `GET /auth/permissions`

**职责**：返回**当前会话的权限视图**（供前端渲染侧栏 / 按钮 / 禁用态）；**不返回**任何 token 字段。建议在 `/auth/login` 成功并写入会话后立即调一次，再渲染依赖权限的壳层。

成功响应 `SessionPermissions`（字段名可与 BFF 对齐）：

```json
{
  "is_account_owner": true,
  "scopes": [
    "demuxai:provider:read",
    "demuxai:provider:update",
    "demuxai:model:read",
    "billing:bill:read"
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `is_account_owner` | boolean | 账户主维度，**与 `scopes` 正交**；用于「仅主账号可解约 / 转移所有权」等产品分支。 |
| `scopes` | string[] | 当前会话已被授予的权限点；与 JWT 内 `scopes` 在内容上一致（同一份服务端事实的两种视图：JWT 供网关鉴权，本接口供前端 UI）。 |

- **职责边界**：本接口**不发** token、不带 `tokenType / expiresIn` 等；token 与有效期一律在 `/auth/login`、`/auth/refresh` 里。
- 若权限发生变更（管理员改授权），前端可重新调本接口刷新 UI；JWT 的实际权限以下一次刷新后的 token 为准。

### `POST /auth/refresh`

**职责**：换发新的 access / refresh token；**不返回**权限清单（变更见 `GET /auth/permissions`）。

请求体：

```json
{ "refreshToken": "eyJhbGciOi..." }
```

成功响应同 `/auth/login`（含 `tokenType` / `accessToken` / `refreshToken` / `expiresIn` / `account`；建议轮换 refreshToken）。

### `POST /auth/logout`

**职责**：撤销当前会话；不返回 body。请求需带 `Authorization`，后端撤销当前 jti（及 refresh 链）即可。

## 错误码

| HTTP | code | 含义 | 前端表现 |
| --- | --- | --- | --- |
| 400 | `validation` | 用户名 / 密码格式错误 | 表单错误高亮 |
| 401 | `unauthorized` | 账户密码不匹配 / 账号被锁定 | ElMessage 失败提示，留在登录页 |
| 403 | `forbidden` | 账户已禁用 / 已删除 | 与 401 一致提示 |
| 429 | `too_many_requests` | 暴力破解保护，需要冷却 | 提示 `retryAfterSeconds` 倒计时 |

## 交互流程

```
User → 输入用户名 / 密码 → submit
  ↓
POST /auth/login              // 拿到 tokens + expiresIn + account（展示）
  ↓ 成功
useAuthStore.login()          // 写入 localStorage（key: meeko.admin.session.v1）
  ↓
GET /auth/permissions         // 拿到 scopes / is_account_owner（鉴权视图）
  ↓
router.replace(redirect ?? '/accounts')
```

- 登录页支持通过 query `?redirect=/xxx` 在登录后跳回原页面。
- 路由守卫：菜单可见性按 **`SessionPermissions.scopes`** 命中决定（例如要进 `/demuxai/providers` 编辑页需 `demuxai:provider:update`）；前端**不解码 JWT**，进入具体页后以接口 403 为最终裁决。
- 续期：临近 `expiresIn` 失效前调用 `POST /auth/refresh`，仍只更新 tokens，不重新拉权限（管理员改授权时由权限接口刷新 UI）。

## 备注

- Mock：当前仓库实现与本文档可能不一致；接入 BFF 后以本文 **平台预定义 scope 目录 + JWT `scopes` + `GET /auth/permissions`** 为准。
- 后续如需 OAuth / SSO 跳转，前端在 `LoginView.vue` 增加跳转按钮即可。