# 03 · 账户详情页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/accounts/:uid` |
| 角色 | 已登录任意角色 |
| 视图 | `src/features/accounts/views/AccountDetailView.vue` |
| 子组件 | **常驻区**：`AccountInfoCard`、`AccountAchievementsCard`（与信息卡并列展示，进页面即可见）；**Tab 区**：`BusinessTab`、`BillingTab`、`IamUsersTab`（**仅 organization 账户渲染**，见下文「个人账户简化策略」）。 |
| Port | `accountAdminPort` + `billingPort` |

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 取单个账户（**详情，含 achievements / oauthBindings / wallet**） | `accountAdminPort.getAccount(uid)` | GET | `/api/admin/accounts/{uid}` |
| 修改账户元数据（name / slug / description） | `accountAdminPort.updateAccount(uid, payload)` | PATCH | `/api/admin/accounts/{uid}` |
| 切换启停 | `accountAdminPort.setAccountStatus(uid, status)` | PATCH | `/api/admin/accounts/{uid}/status` |
| 授予勋章（成功响应即最新 `Account`） | `accountAdminPort.grantAchievement(uid, code)` | POST | `/api/admin/accounts/{uid}/achievements` |
| 撤销勋章（成功响应即最新 `Account`） | `accountAdminPort.revokeAchievement(uid, code)` | DELETE | `/api/admin/accounts/{uid}/achievements/{code}` |
| IAM 子账户列表 | `accountAdminPort.listIamUsers(uid)` | GET | `/api/admin/iam/users?accountUid={uid}` |
| 新增 IAM 子账户 | `accountAdminPort.createIamUser(uid, payload)` | POST | `/api/admin/iam/users` |
| 账单 Tab：充值记录 | `billingPort.listRecharges` | GET | `/api/billing/recharges` |
| 账单 Tab：扣款流水 | `billingPort.listBills` | GET | `/api/billing/bills` |

## 个人账户简化策略

> 平台统一走 IAM 鉴权链路（详见 [`00-conventions.md` § 4.1 统一 IAM 模型](./00-conventions.md#41-统一-iam-模型契约根)），但**产品 UI 上 personal 账户完全隐藏 IAM 概念**。本页所有接口和组件在 `account.type === 'personal'` 时按下表简化：

| 维度 | personal | organization |
| --- | --- | --- |
| `iamUserCount` | **恒为 `1`**（隐式 IAM 用户） | 真实子用户数 |
| `owner.iamUserUid` | 隐式 IAM 用户 UID = `account.iamUserUid` | 当前 owner 子用户 UID |
| 详情页 `IamUsersTab` | **不渲染** | 正常渲染 |
| `GET /api/admin/iam/users?accountUid={uid}` | 返回 **`[]`** 空数组（隐式用户不暴露） | 正常列表 |
| `POST /api/admin/iam/users` | **403** `feature_not_available_for_personal` | 正常 |

> 前端在 `AccountDetailView.vue` 用 `account.type === 'organization'` 作为 IAM Tab / 新建按钮的渲染开关；BFF 在 personal 账户的写接口上做硬拒绝（不要静默吞掉）。

## 请求 / 响应（核心）

### `GET /api/admin/accounts/{uid}`
**详情 = 重投影**：在 [`02-account-list.md`](./02-account-list.md) 的轻投影字段基础上，**一次性**附带详情专属字段（`achievements`、`oauthBindings`、`updatedAtUtc`、`owner.iamUserUid`、`owner.phone`、完整 `wallet` 快照等）。进入详情页**只发一次 `getAccount`**，徽章 / OAuth 等无需再走子接口。
成功响应：

```json
{
  "uid": "100000001",
  "type": "organization",
  "name": "Meeko Demo Org",
  "slug": "meeko-demo",
  "status": "active",
  "owner": {
    "iamUserUid":  "200000001",
    "displayName": "系统管理员",
    "email":       "admin@meeko.io",
    "phone":       "13800000000"
  },
  "iamUserCount": 5,
  "tier": 3,
  "totalRechargedAmount": 12800,
  "wallet": {
    "available":    1280.5,
    "held":         320,
    "currency":     "CNY",
    "updatedAtUtc": "2025-09-12T09:00:00Z"
  },
  "createdAtUtc":    "2024-08-12T03:14:22Z",
  "updatedAtUtc":    "2025-09-01T11:02:45Z",
  "lastActiveAtUtc": "2025-09-12T09:18:00Z",
  "achievements": [
    {
      "code":         "first-recharge",
      "name":         "首充用户",
      "description":  "完成首笔充值",
      "icon":         "🎉",
      "image":        "/badges/first-recharge.svg",
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
| `owner` | object | 与列表里的 `owner` 同对象类型，**详情里多出 `iamUserUid` + `phone` 两个字段**。`iamUserUid` 是详情卡内部跳链 IAM 详情时用；`phone` 是 Owner 联系电话，列表里因隐私不下发。 |
| `updatedAtUtc` | string（ISO 8601） | 账户元数据最近一次更新时间。 |
| `wallet` | `WalletSnapshot \| null` | 钱包完整快照（含 `updatedAtUtc`），与列表里的 `walletSummary`（带 `snapshotAtUtc`）同源但字段更完整：详情里能拿到"真实写入时刻"，列表里是"缓存快照时刻"。 |
| `achievements[]` | Achievement[] | 已授予勋章；空数组 = 无。**与 `AccountAchievementsCard` 直绑**，进页面即渲染，无需再走授勋专用读接口。 |
| `oauthBindings[]` | OAuthBinding[] | OAuth 绑定关系；空数组 = 未绑定。 |

### `PATCH /api/admin/accounts/{uid}` （`UpdateAccountPayload`）
修改账户元数据（**不含**状态切换 / 勋章 / IAM —— 这些是独立动作，走专用端点）。

```json
{
  "name": "Meeko Demo Org（重命名）",
  "slug": "meeko-demo-2",
  "description": "组织备注"
}

```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 1..64 |
| `slug` | string | 否 | URL 友好，组织域唯一 |
| `description` | string \| null | 否 | 内部备注，可清空 |

> 后续如需扩"修改 owner 邮箱 / 电话"等敏感字段，建议**走独立端点**（如 `POST /api/admin/accounts/{uid}/transfer-owner`）—— 涉及多方协议与二次校验，不应混在通用 PATCH 里。
成功响应：`200 OK` + 更新后的 `Account` 完整体。

### `PATCH /api/admin/accounts/{uid}/status`
请求体：

```json
{ "status": "suspended" }

```

`status` 仅允许 `active` / `suspended`（不允许通过 API 改为 `deleted`，删除走专用流程）。
成功返回更新后的 `Account` 完整体（用于前端就地刷新）。

### `POST /api/admin/accounts/{uid}/achievements`
请求体：

```json
{ "code": "vip" }

```

- `code` 必须命中勋章库（参见 `src/features/accounts/model/achievementCatalog.ts`）。
- 已存在视为**幂等**成功。
成功返回更新后的 `Account`。

### `DELETE /api/admin/accounts/{uid}/achievements/{code}`
无请求体。`code` 不存在视为幂等成功，仍返回 `Account`。

### `GET /api/admin/iam/users?accountUid={uid}` （listIamUsers）
> 仅 organization 账户调用；personal 账户走该端点时 BFF 直接返回 `[]`（隐式 IAM 用户不暴露，详见上文「个人账户简化策略」）。前端在 personal 账户上不渲染 `IamUsersTab`，因此通常也不会发出此请求。
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

### `POST /api/admin/iam/users` （createIamUser）
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
- **personal 账户调用此端点必须返回 `403 forbidden` + `code: 'feature_not_available_for_personal'`**——不允许给个人账户添加额外 IAM 子用户。
成功返回创建后的 `IamUser`。

### Billing 域接口（详见 [`04-billing-recharges.md`](./04-billing-recharges.md) 与 [`05-billing-bills.md`](./05-billing-bills.md)）
- `GET /api/billing/businesses?accountUid={uid}&status=opened|paused|stopped|all`
- `GET /api/billing/recharges?accountUid={uid}&provider=&status=&fromUtc=&toUtc=&page=&pageSize=`
- `GET /api/billing/bills?accountUid={uid}&business=&subType=&status=&fromUtc=&toUtc=&page=&pageSize=`
业务实例响应（`BusinessInstance[]`，**不分页**，单账户通常 <50 条）：

```json
[
  {
    "id": "300000001",
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
  - 账单      → listRecharges + listBills（双区块）
  - IAM       → listIamUsers / createIamUser
操作"停用/恢复"   → confirmDanger → setAccountStatus → 成功后 refresh()
徽章 grant/revoke → 调子接口成功后刷新 getAccount（不单独拉勋章列表）

```

## 错误码
| 接口 | HTTP | code | 含义 |
| --- | --- | --- | --- |
| `getAccount` | 404 | `not_found` | uid 不存在 |
| `updateAccount` | 400 | `validation` | name / slug 不合规 |
| `updateAccount` | 409 | `conflict` | slug 冲突 |
| `setAccountStatus` | 409 | `conflict` | 状态机非法（如已 deleted） |
| `setAccountStatus` | 403 | `forbidden` | 角色不足 |
| `grantAchievement` | 400 | `validation` | code 不存在于勋章库 |
| `createIamUser` | 409 | `conflict` | username / email 冲突 |
| `createIamUser` | 400 | `validation` | password 强度 / email 格式不通过 |
| `createIamUser` | 403 | `forbidden` | 个人账户不允许新增 IAM 子用户（`feature_not_available_for_personal`） |
