# 04 · 充值记录页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/billing/recharges` |
| 角色 | 已登录任意角色 |
| 视图 | `src/features/billing/views/RechargeListView.vue` |
| Port | `src/features/billing/services/ports/billingPort.ts`（`listRecharges`） |

## 业务定义

> 充值 = 钱包**入账事件**，按账户聚合，**只有主账户可发起**。来源四类：
> - `alipay` / `wechat_pay`：用户付费（第三方支付流水号）
> - `cs_compensation`：客服补偿（工单号）
> - `marketing_reward`：营销奖励（活动号，可多笔共享）
> - `manual`：财务/管理员手工入账（内部审批单号）

`scene` 为支付场景枚举（0=Native, 1=H5, 2=JsApi, 3=App, 4=PC, 99=手工入账）。

> **标识**：充值行主键 JSON 字段为 **`id`**（如 `RC20260531000001234`）；`uid` / `*AccountUid` 仅表示账户或 IAM **userId**（见 [`00-conventions.md`](./00-conventions.md) §3）。

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 平台级全量充值记录 | `listRecharges` | GET | `/api/billing/recharges` |
| 单条详情 | `getRecharge(id)` | GET | `/api/billing/recharges/{id}` |
| **内部入账写入**（Admin / 客服 / 营销系统专用） | `createInternalRecharge(payload)` | POST | `/api/billing/recharges/internal` |
| 账户辅助查询（按 UID/邮箱/手机过滤显示） | `accountAdminPort.listAccounts` | GET | `/api/admin/accounts` |

> **`POST /recharges/internal` 端点的存在理由**：业务定义里明确"`manual` / `cs_compensation` / `marketing_reward` 三类内部入账由客服 / 财务 / 运营触发"，但原 API 只暴露读端点，写链路缺失。封装到独立 `/internal` 路径而非通用 `POST /recharges` 是有意区隔——外部支付（`alipay` / `wechat_pay`）入账是回调驱动、不经此端点。

## 请求 / 响应

### `GET /api/billing/recharges`
查询参数：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1。 |
| `pageSize` | int | 是 | 默认 20，最大建议 100。 |
| `accountUid` | string | 否 | 主账户 userId 精确匹配；为空查全平台。 |
| `provider` | enum/`'all'` | 否 | `alipay` / `wechat_pay` / `manual` / `cs_compensation` / `marketing_reward`。 |
| `status` | enum/`'all'` | 否 | `pending` / `paid` / `expired` / `cancelled` / `failed`。 |
| `fromUtc` | ISO8601 | 否 | 创建时间起点（inclusive）。 |
| `toUtc` | ISO8601 | 否 | 创建时间终点（inclusive）。 |
成功响应：

```json
{
  "items": [
    {
      "id": "RC20260531000001234",
      "owner": { "accountUid": "100000001" },
      "source": {
        "provider": "alipay",
        "scene":    4,
        "refNo":    "2025091222001445901234567890"
      },
      "amount":   { "value": 200, "currency": "CNY" },
      "status":   "paid",
      "operator": null,
      "createdAtUtc": "2025-09-12T08:55:13Z",
      "paidAtUtc":    "2025-09-12T08:57:01Z"
    },
    {
      "id": "RC20260531000001235",
      "owner": { "accountUid": "100000002" },
      "source": {
        "provider": "cs_compensation",
        "scene":    99,
        "refNo":    "TICKET-20250912-0007"
      },
      "amount":   { "value": 50, "currency": "CNY" },
      "status":   "paid",
      "operator": { "iamUserUid": "200000099" },
      "createdAtUtc": "2025-09-12T10:18:33Z",
      "paidAtUtc":    "2025-09-12T10:18:33Z"
    }
  ],
  "total": 215
}

```

字段说明：
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 充值记录主键（PG identity 自增，JSON 为 string）。 |
| `owner.accountUid` | string | 钱归这个主账户（**userId**）。**封装动机**：未来 owner 可能扩展 `displayName` / `tier` 等同生同灭的辅助快照字段，保留 owner 子对象做扩展点。 |
| `source` | object | 资金来源族：`{ provider, scene, refNo }`。**判别联合（discriminated union）**：4 类 provider 对应不同的 `refNo` 语义（支付宝 → 第三方支付流水号；cs_compensation → 工单号；marketing_reward → 活动号；manual → 内部审批单号）；按 provider 还可未来扩 `source.ticketUrl` / `source.campaignId` 等专属字段，外层结构不动（与 10-pricing 的 `billingType + pricing` 同套路）。 |
| `source.scene` | int | 支付场景；内部充值 = 99。前端按 `PaymentSceneLabel` 渲染。 |
| `amount` | object | 金额族：`{ value, currency }`。封装后未来加 `tax` / `fxRate` / `originalCurrency` 等无侵入。 |
| `status` | enum | `pending`/`paid`/`expired`/`cancelled`/`failed`。 |
| `operator` | object \| null | 内部操作人：`{ iamUserUid }`（IAM userId）；仅 `manual`/`cs_compensation`/`marketing_reward` 三类内部入账有值，其它一律 `null`。 |
| `createdAtUtc` | ISO8601 | 发起时间。 |
| `paidAtUtc` | ISO8601 \| null | 入账时间；仅 `paid` 状态必有。 |

### 单条详情 `GET /api/billing/recharges/{id}`
返回单个 Recharge，结构与列表元素一致。用于深链 `?focus=RC20260531000001234` 与客服排障。

### 内部入账写入 `POST /api/billing/recharges/internal` （`CreateInternalRechargePayload`）
> 仅对 `cs_compensation` / `marketing_reward` / `manual` 三类内部 provider 开放；外部支付（alipay / wechat_pay）入账必须走支付回调，**不能**走此端点（避免绕开三方账实校验）。

```json
{
  "ownerAccountUid": "100000002",
  "source": {
    "provider": "cs_compensation",
    "refNo":    "TICKET-20250912-0007"
  },
  "amount": { "value": 50, "currency": "CNY" },
  "note": "用户反馈服务降级补偿 50 元",
  "idempotencyKey": "9c4e1f2a-..."
}

```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ownerAccountUid` | string | 是 | 入账目标账户 userId |
| `source.provider` | enum | 是 | 仅允许 `cs_compensation` / `marketing_reward` / `manual` |
| `source.refNo` | string | 是 | 业务单号（工单号 / 活动号 / 审批单号），与 provider 配对唯一 |
| `amount` | object | 是 | `{ value, currency }`，`value > 0` |
| `note` | string | 否 | 业务备注（落库到 audit log） |
| `idempotencyKey` | string | 否 | 同 `provider + refNo` 已有同等价值的保护；推荐前端再传一次显式 key |
成功响应：`201 Created` + 完整 `Recharge`（含服务端分配的 `id` / `operator: { iamUserUid }` / `status: "paid"` / `paidAtUtc`）。`scene` 自动填 `99`。

> BFF 必须在事务内联动：① 写入 recharges 表；② 钱包余额 += amount.value；③ 写 audit log 记录 operator + note。三步缺一不可，避免出现"账记了钱没到"。

## 交互流程

```

onMounted → loadAccounts()  // 拉账户字典（最多 999），UI 辅助匹配邮箱/手机
            fetchData()      // listRecharges(page, pageSize, filter)
任一过滤项变化 → page=1 → fetchData()
contactKeyword 仅做前端过滤（不下发到 BFF）

```

- 前端 `contactKeyword` 不下传：用 `accountMap` 在前端按 email/phone 过滤已加载行。
- 真接 BFF 时也可以增加 `?contactKeyword=` 进行后端过滤（推荐，避免分页与前端过滤割裂）。

## 错误码
| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | `source.provider` / `status` 非法值、`fromUtc > toUtc`、内部入账金额 ≤ 0 |
| 403 | `forbidden` | 普通用户尝试访问全平台数据（应只看自己账户） / 非 Admin 调内部入账端点 |
| 409 | `conflict` | 同 `source.provider + source.refNo` 已存在（幂等保护） |
| 504 | `timeout` | 涉及大数据量分页查询时超时。 |

## 备注
- 充值记录是审计核心，**永远不删除**（即便业务上发起退款也只是新建一条扣款型账单，参见 [`05-billing-bills.md`](./05-billing-bills.md)）。
- 同一 `source.refNo + source.provider` 应唯一（保证幂等）；BFF 在重复请求时返回原记录。
- v2 字段族嵌套化（`owner` / `source` / `amount` / `operator`）让 schema 在新增 source 类型（如未来上 PayPal）时只在 `source.provider` enum 内扩展，外层结构不动；列表筛选 `?provider=alipay` 内部映射到 `source.provider = 'alipay'`，前端查询参数名暂不改动（保持 URL 兼容）。
- 控制台 Mock / `RechargeRecord` 扁平字段：`id`、`ownerAccountUid`、`operatorIamId` 与上文 JSON 一一对应。
