# 03 · 账户详情页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/accounts/:uid` |
| 角色 | 已登录任意角色 |
| 视图 | `src/features/accounts/views/AccountDetailView.vue` |
| 子组件 | **常驻区**：`AccountInfoCard`、`AccountAchievementsCard`（与信息卡并列展示，进页面即可见）；**Tab 区**：`BusinessTab`、`BillingTab`、`IamUsersTab`。 |
| Port | `accountAdminPort` + `billingPort` |

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 取单个账户（**详情，含 achievements / oauthBindings / wallet**） | `accountAdminPort.getAccount(uid)` | GET | `/accounts/{uid}` |
| 切换启停 | `accountAdminPort.setAccountStatus(uid, status)` | PATCH | `/accounts/{uid}/status` |
| 授予勋章（成功响应即最新 `Account`） | `accountAdminPort.grantAchievement(uid, code)` | POST | `/accounts/{uid}/achievements` |
| 撤销勋章（成功响应即最新 `Account`） | `accountAdminPort.revokeAchievement(uid, code)` | DELETE | `/accounts/{uid}/achievements/{code}` |
| IAM 子账户列表 | `accountAdminPort.listIamUsers(uid)` | GET | `/iam/users?accountUid={uid}` |
| 新增 IAM 子账户 | `accountAdminPort.createIamUser(uid, payload)` | POST | `/iam/users` |
| 业务 Tab：业务实例 | `billingPort.listBusinesses(uid, filter)` | GET | `/api/billing/businesses?accountUid={uid}` |
| 账单 Tab：充值记录 | `billingPort.listRecharges` | GET | `/api/billing/recharges` |
| 账单 Tab：扣款流水 | `billingPort.listBills` | GET | `/api/billing/bills` |

## 请求 / 响应（核心）

### `GET /accounts/{uid}`

**详情 = 重投影**：在 [`02-account-list.md`](./02-account-list.md) 的轻投影字段基础上，**一次性**附带详情专属字段（`achievements`、`oauthBindings`、`updatedAtUtc`、`ownerIamUserUid`、`ownerPhone`、完整 `wallet` 快照等）。进入详情页**只发一次 `getAccount`**，徽章 / OAuth 等无需再走子接口。

成功响应：

```json
{
  "uid": "100000001",
  "type": "organization",
  "name": "Meeko Demo Org",
  "slug": "meeko-demo",
  "status": "active",
  "ownerIamUserUid": "200000001",
  "ownerDisplayName": "系统管理员",
  "ownerEmail": "admin@meeko.io",
  "ownerPhone": "13800000000",
  "iamUserCount": 5,
  "tier": 3,
  "totalRechargedAmount": 12800,
  "wallet": {
    "available": 1280.5,
    "held": 320,
    "currency": "CNY",
    "updatedAtUtc": "2025-09-12T09:00:00Z"
  },
  "createdAtUtc": "2024-08-12T03:14:22Z",
  "updatedAtUtc": "2025-09-01T11:02:45Z",
  "lastActiveAtUtc": "2025-09-12T09:18:00Z",
  "achievements": [
    {
      "code": "first-recharge",
      "name": "首充用户",
      "description": "完成首笔充值",
      "icon": "🎉",
      "image": "/badges/first-recharge.svg",
      "grantedAtUtc": "2024-09-02T00:00:00Z"
    }
  ],
  "oauthBindings": [
    { "provider": "wechat", "externalUid": "wx_xxx", "nickname": "Mike", "boundAtUtc": "2024-10-01T00:00:00Z" }
  ]
}
```

详情独有字段说明（轻投影里的字段不在此重复，见 [`02-account-list.md`](./02-account-list.md)）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ownerIamUserUid` | string | Owner 对应的 IAM 用户 UID（详情卡内部跳链时用）。 |
| `ownerPhone` | string，可选 | Owner 联系电话；列表里因隐私不下发，详情才返回。 |
| `updatedAtUtc` | string（ISO 8601） | 账户元数据最近一次更新时间。 |
| `wallet` | `WalletSnapshot \| null` | 钱包完整快照（含 `updatedAtUtc`），区别于列表里的概要。 |
| `achievements[]` | Achievement[] | 已授予勋章；空数组 = 无。**与 `AccountAchievementsCard` 直绑**，进页面即渲染，无需再走授勋专用读接口。 |
| `oauthBindings[]` | OAuthBinding[] | OAuth 绑定关系；空数组 = 未绑定。 |

### `PATCH /accounts/{uid}/status`

请求体：

```json
{ "status": "suspended" }
```

`status` 仅允许 `active` / `suspended`（不允许通过 API 改为 `deleted`，删除走专用流程）。

成功返回更新后的 `Account` 完整体（用于前端就地刷新）。

### `POST /accounts/{uid}/achievements`

请求体：

```json
{ "code": "vip" }
```

- `code` 必须命中勋章库（参见 `src/features/accounts/model/achievementCatalog.ts`）。
- 已存在视为**幂等**成功。

成功返回更新后的 `Account`。

### `DELETE /accounts/{uid}/achievements/{code}`

无请求体。`code` 不存在视为幂等成功，仍返回 `Account`。

### `GET /iam/users?accountUid={uid}` （listIamUsers）

响应 `IamUser[]`：

```json
[
  {
    "uid": "200000001",
    "accountUid": "100000001",
    "username": "admin",
    "email": "admin@meeko.io",
    "displayName": "系统管理员",
    "role": "Admin",
    "isAccountOwner": true,
    "status": "active"
  }
]
```

### `POST /iam/users` （createIamUser）

请求体（`CreateIamUserPayload`）：

```json
{
  "accountUid": "100000001",
  "username": "alice",
  "email": "alice@meeko.io",
  "displayName": "Alice",
  "password": "P@ssw0rd123!",
  "roleName": "Member"
}
```

- `roleName` 取值：`Owner` / `Admin` / `Member`。
- `password` 必填，BFF 入库前 hash。
- 校验：`username` 唯一（同 accountUid 下），`email` 唯一可选。

成功返回创建后的 `IamUser`。

### Billing 域接口（详见 [`04-billing-recharges.md`](./04-billing-recharges.md) 与 [`05-billing-bills.md`](./05-billing-bills.md)）

- `GET /api/billing/businesses?accountUid={uid}&status=opened|paused|stopped|all`
- `GET /api/billing/recharges?accountUid={uid}&provider=&status=&fromUtc=&toUtc=&page=&pageSize=`
- `GET /api/billing/bills?accountUid={uid}&business=&subType=&status=&fromUtc=&toUtc=&page=&pageSize=`

业务实例响应（`BusinessInstance[]`，**不分页**，单账户通常 <50 条）：

```json
[
  {
    "uid": "300000001",
    "accountUid": "100000001",
    "productCode": "demux-api",
    "productName": "DemuxAI API",
    "status": "opened",
    "openedAtUtc": "2025-01-01T00:00:00Z",
    "currentPeriodEndUtc": "2025-12-31T23:59:59Z",
    "pausedAtUtc": null,
    "stoppedAtUtc": null
  }
]
```

## 交互流程

```
进入页面 → useAccountDetail(uid) → getAccount(uid)   // 一次拿满 含 achievements / oauthBindings / wallet
  ↓
默认渲染：AccountInfoCard | AccountAchievementsCard   (并列两列，进页面即可见)
  ↓
切 Tab → 按需懒加载子接口（重数据 / 分页类）：
  - 业务      → listBusinesses
  - 账单      → listRecharges + listBills（双区块）
  - IAM       → listIamUsers / createIamUser

操作"停用/恢复"   → confirmDanger → setAccountStatus → 成功后 refresh()
徽章 grant/revoke → 调子接口成功后刷新 getAccount（不单独拉勋章列表）
```

## 错误码

| 接口 | HTTP | code | 含义 |
| --- | --- | --- | --- |
| `getAccount` | 404 | `not_found` | uid 不存在 |
| `setAccountStatus` | 409 | `conflict` | 状态机非法（如已 deleted） |
| `setAccountStatus` | 403 | `forbidden` | 角色不足 |
| `grantAchievement` | 400 | `validation` | code 不存在于勋章库 |
| `createIamUser` | 409 | `conflict` | username / email 冲突 |
| `createIamUser` | 400 | `validation` | password 强度 / email 格式不通过 |
