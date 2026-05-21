# 02 · 账户列表页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/accounts` |
| 角色 | 已登录任意角色 |
| 视图 | `src/features/accounts/views/AccountListView.vue` |
| 组合式 | `src/features/accounts/composables/useAccountList.ts` |
| Port | `src/features/accounts/services/ports/accountAdminPort.ts` |

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 + 过滤（含每行钱包概要） | `listAccounts` | GET | `/accounts` |

> 列表里的「可用余额 / 冻结资金」由 BFF **服务端 JOIN 一次取出**（账户表 + 钱包表 / 缓存），随每行下发 `walletSummary` 概要字段；**前端不再按行并发 `getWallet`**，避免 N+1。完整钱包快照（含 `updatedAtUtc` 等审计字段）由 [`03-account-detail.md`](./03-account-detail.md) 的 `wallet` 字段处理。
>
> **字段命名取舍**：列表里用 `walletSummary`（明示是缓存快照、可能滞后 5–30s）、详情里用 `wallet`（完整快照），名字本身就把"详尽程度"传达出来。

## 请求 / 响应

### `GET /accounts` （listAccounts）

> **轻投影**：本接口**只返回**列表 UI 渲染、筛选、排序所需的最小字段；嵌套数组与详情字段（`achievements`、`oauthBindings`、`updatedAtUtc`、`owner.iamUserUid`、`owner.phone` 等）一律在 [`03-account-detail.md`](./03-account-detail.md) 的 `GET /accounts/:uid` 中下发。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1。 |
| `pageSize` | int | 是 | 默认 20。 |
| `accountUid` | string | 否 | UID 精确匹配。 |
| `contactKeyword` | string | 否 | 服务端模糊匹配 `owner.email` / `owner.phone`（电话本身不在列表响应中，仅作搜索条件）。 |
| `type` | `'personal' \| 'organization' \| 'all'` | 否 | 默认 `all`。 |
| `status` | `'active' \| 'suspended' \| 'deleted' \| 'all'` | 否 | 默认 `all`。 |

成功响应：

```json
{
  "items": [
    {
      "uid": "100000001",
      "type": "organization",
      "name": "Meeko Demo Org",
      "slug": "meeko-demo",
      "status": "active",
      "owner": {
        "displayName": "系统管理员",
        "email":       "admin@meeko.io"
      },
      "iamUserCount": 5,
      "tier": 3,
      "totalRechargedAmount": 12800,
      "walletSummary": {
        "available":     1280.5,
        "held":          320,
        "currency":      "CNY",
        "snapshotAtUtc": "2025-09-12T09:17:30Z"
      },
      "createdAtUtc":    "2024-08-12T03:14:22Z",
      "lastActiveAtUtc": "2025-09-12T09:18:00Z"
    }
  ],
  "total": 38
}

```

字段说明（核心，详见 `account.types.ts`）：
| 字段 | 类型 | 是否必返 | 说明 |
| --- | --- | --- | --- |
| `uid` | string | 必 | 账户主键（long → string）。 |
| `type` | enum | 必 | `personal` / `organization`。 |
| `name` | string | 必 | 显示名（组织名或个人昵称）。 |
| `slug` | string | 必 | URL 友好标识。 |
| `status` | enum | 必 | `active` / `suspended` / `deleted`。 |
| `tier` | int (≥1) | 必 | 账户等级，按累计充值自动算。 |
| `totalRechargedAmount` | number | 必 | 累计充值（元）。 |
| `owner` | object | 可选 | Owner 信息族：`{ displayName, email }`。详情接口再额外回 `iamUserUid` / `phone`。**字段聚合理由**：Owner 的几条信息天然同生同灭，封装后未来加 `owner.avatarUrl` / `owner.title` 不污染顶层。 |
| `iamUserCount` | int | 可选 | IAM 子账户数。 |
| `walletSummary` | `{ available, held, currency, snapshotAtUtc } \| null` | 可选 | 钱包概要快照（**服务端 JOIN + 短 TTL 缓存**）；未开户为 `null`。`available` = 可支配余额；`held` = 已冻结（分配给子账户、待结算订单等占用资金）；`snapshotAtUtc` 显式表示快照时间，提醒消费方"数据可能滞后 5–30 s"。**与详情里的完整 `wallet` 对象同源但字段不同**——名字带 Summary 后缀即语义自我说明。 |
| `createdAtUtc` | string（ISO 8601） | 必 | 创建时间，用于排序与展示。 |
| `lastActiveAtUtc` | string（ISO 8601） | 可选 | 最近活跃时间。 |

> **不在本接口返回**（需详情）：`updatedAtUtc`、`owner.iamUserUid`、`owner.phone`、`achievements`、`oauthBindings`、完整 `wallet`（含审计字段）；若未来出现列表里临时要带子资源的需求，再统一引入显式 `?include=` 约定，**默认不带**。

## 交互流程

```

onMounted → fetchData()
  └── listAccounts(page, pageSize, filter)   // 单次请求，行内含 wallet 概要
filter 变化 → page=1 → fetchData()

```

- 过滤项变化触发 `page=1`，避免越界。
- 表格上的「可用 / 冻结」列直接读 `row.walletSummary?.available` 与 `row.walletSummary?.held`（建议展示成「`1,280.5` · 冻结 `320`」之类组合形态）；**不再按行额外请求**，避免 N+1。
- 钱包数据的**新鲜度**由 BFF 决定：通常服务端用短 TTL 缓存（如 5–30 s）即可让 JOIN 成本可忽略；前端可读 `walletSummary.snapshotAtUtc` 判断是否需要触发"刷新"操作。

## 错误码

| HTTP | code | 场景 | 表现 |
| --- | --- | --- | --- |
| 400 | `validation` | filter 取值非法（如 `status='foo'`） | ElMessage 错误提示 |
| 401 | `unauthorized` | token 失效 | 跳登录 |
| 500 | `unknown` | 后端故障 | DataTableShell 错误态 |
