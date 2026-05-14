# 05 · 账单流水页

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/billing/bills` |
| 角色 | 已登录任意角色 |
| 视图 | `src/features/billing/views/BillListView.vue` |
| Port | `billingPort.listBills` |

## 业务定义

> 账单 = 钱包**扣款事件**（与充值流水分表）。承载所有扣费场景：订阅扣款、用量扣费、一次性订单。
>
> **错扣回滚 / 部分退款不另起一条**，而是直接驳回原账单：
> - `status='reversed'` 且 `actualAmount=0`
> - `status='partial_refunded'` 且 `actualAmount = 原值 − 退回部分`
>
> 钱包余额结算公式：`Σ actualAmount WHERE status ∈ {completed, partial_refunded}`。

双账户字段：

- `ownerAccountUid`：主账户（钱归它扣）。
- `operatorAccountUid`：实操账户（可能是主账户或 IAM 子账户）。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 平台级全量账单 | `listBills` | GET | `/api/billing/bills` |
| 账户辅助查询（前端按 UID/邮箱/手机过滤显示） | `accountAdminPort.listAccounts` | GET | `/accounts` |

## 请求 / 响应

### `GET /api/billing/bills`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1。 |
| `pageSize` | int | 是 | 默认 20。 |
| `accountUid` | string | 否 | 主账户 UID 精确匹配。 |
| `business` | enum/`'all'` | 否 | `demux` / `platform`。 |
| `subType` | enum/`'all'` | 否 | `prepaid` / `usage`。 |
| `status` | enum/`'all'` | 否 | `pending` / `completed` / `failed` / `reversed` / `partial_refunded`。 |
| `fromUtc` | ISO8601 | 否 | 入账时间起点（`occurredAtUtc`）。 |
| `toUtc` | ISO8601 | 否 | 入账时间终点。 |

成功响应：

```json
{
  "items": [
    {
      "uid": "BL-900000001",
      "ownerAccountUid": "100000001",
      "operatorAccountUid": "100000001",
      "business": "demux",
      "productCode": "demux-gpt-4o",
      "subType": "usage",
      "status": "completed",
      "failureCode": null,
      "originalAmount": 1.2345,
      "actualAmount": 1.2345,
      "currency": "CNY",
      "balanceAfter": 1279.265,
      "refType": "order",
      "refUid": "OD-100000001",
      "reversedAtUtc": null,
      "reversedBy": null,
      "reversedCode": null,
      "occurredAtUtc": "2025-09-12T11:00:01Z"
    },
    {
      "uid": "BL-900000002",
      "ownerAccountUid": "100000001",
      "operatorAccountUid": "200000050",
      "business": "demux",
      "productCode": "demux-gpt-4o",
      "subType": "usage",
      "status": "reversed",
      "failureCode": null,
      "originalAmount": 5.0,
      "actualAmount": 0,
      "currency": "CNY",
      "balanceAfter": null,
      "refType": "order",
      "refUid": "OD-100000002",
      "reversedAtUtc": "2025-09-12T11:30:00Z",
      "reversedBy": "200000099",
      "reversedCode": "metering_error",
      "occurredAtUtc": "2025-09-12T11:05:01Z"
    }
  ],
  "total": 1820
}
```

字段说明（详见 `src/features/billing/model/billing.types.ts`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | 雪花 ID。 |
| `ownerAccountUid` | string | 主账户 UID。 |
| `operatorAccountUid` | string | 实际触发扣费的账户（主账户 / IAM 子账户）。 |
| `business` | enum | `demux` / `platform`。 |
| `productCode` | string \| null | 产品代码；`platform` 类账单可为空（如手工调账）。 |
| `subType` | enum | `prepaid`（订阅 / 一次性订单）/ `usage`（按量）。 |
| `status` | enum | 见下表。 |
| `failureCode` | enum \| null | `status='failed'` 时必填。 |
| `originalAmount` | number | 系统首次计算的扣费金额。 |
| `actualAmount` | number | 实际扣费金额（驳回→0；部分退还→原值的一部分）。 |
| `balanceAfter` | number \| null | 扣费后钱包余额快照，便于对账。 |
| `refType` | enum \| null | `order` / `subscription` / `invoice`。 |
| `refUid` | string \| null | 关联业务实体 UID。 |
| `reversedAtUtc` / `reversedBy` / `reversedCode` | 仅驳回 / 部分退款时有值 | |
| `occurredAtUtc` | ISO8601 | 入账时间，前端排序基准。 |

### 状态码（`status`）

| 值 | 含义 |
| --- | --- |
| `pending` | 处理中（异步扣款排队） |
| `completed` | 已完成（actualAmount 已生效） |
| `failed` | 失败（必有 `failureCode`） |
| `reversed` | 已驳回（actualAmount=0） |
| `partial_refunded` | 部分退还（actualAmount < originalAmount） |

### 失败码（`failureCode`，枚举不可自由文本）

`insufficient_balance` / `wallet_frozen` / `sub_account_limit_exceeded` / `risk_blocked` / `amount_exceeded` / `system_error`。

### 驳回原因码（`reversedCode`）

`duplicate_charge` / `metering_error` / `service_unavailable` / `customer_compensation` / `manual_correction`。

## 交互流程

```
onMounted → loadAccounts() + fetchData()
filter 变化 → page=1 → listBills(...)
点击行 InfoIcon 显示 failureCode / reversedCode tooltip
```

- `contactKeyword` 仅前端 email/phone 过滤，不下传 BFF。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 枚举非法值 / `fromUtc > toUtc` |
| 403 | `forbidden` | 非 Admin 但请求全平台维度 |
| 504 | `timeout` | 大跨度时间段超时（请缩短范围） |

## 备注

- 驳回与部分退还都直接改原账单字段；BFF 内部应在事务内一次写完（避免出现"先驳回再回滚"的中间态）。
- `balanceAfter` 字段是审计冗余字段，**只在 `status=completed` 与 `partial_refunded` 时填**；驳回与失败为 `null`。
