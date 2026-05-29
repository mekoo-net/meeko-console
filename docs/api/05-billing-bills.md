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
> - `status='reversed'`：完全驳回，`amount.actual=0`，必含 `reversal` 子对象
> - `status='partial_refunded'`：部分退还，`amount.actual = amount.original − 退回部分`，必含 `reversal` 子对象
>
> 钱包余额结算公式：`Σ amount.actual WHERE status ∈ {completed, partial_refunded}`。
>
> **嵌套设计动机**：业务字段按"语义同源 + 同生同灭"原则封装为子对象：
> - `owner` / `operator`：双账户语义独立——`owner` 是钱归谁扣（计费主体），`operator` 是谁触发了这次扣费（主账户或 IAM 子账户）；
> - `business`：业务归属与产品代码绑定出现；
> - `amount`：金额族（原值 / 实付 / 扣后余额）封装后未来加 `tax` / `subsidy` / `fxRate` 无侵入；
> - `ref`：关联实体的"类型 + id"二元组永远一起出现；
> - `failure` / `reversal`：状态扩展信息，跟随 `status` 出现 / 消失——避免"5 个 null 占 4 个"扁平反范式。
> **标识**：账单行主键 JSON 字段为 **`id`**（如 `BL-*`）；`ref.id` 为关联实体主键；`owner.accountUid` / `operator.accountUid` 为账户 **userId**；`reversal.byIamUserUid` 为 IAM userId。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 平台级全量账单 | `listBills` | GET | `/api/billing/bills` |
| 取单条账单详情 | `getBill(id)` | GET | `/api/billing/bills/{id}` |
| 驳回 / 部分退款（admin / 客服工单） | `reverseBill(id, payload)` | POST | `/api/billing/bills/{id}/reverse` |
| 账户辅助查询（前端按 UID/邮箱/手机过滤显示） | `accountAdminPort.listAccounts` | GET | `/api/admin/accounts` |

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
      "id": "BL-900000001",
      "owner":    { "accountUid": "100000001" },
      "operator": { "accountUid": "100000001" },
      "business": { "domain": "demux", "productCode": "demux-gpt-4o" },
      "subType": "usage",
      "status": "completed",
      "amount": {
        "original": 1.2345,
        "actual":   1.2345,
        "currency": "CNY",
        "balanceAfter": 1279.265
      },
      "ref": { "type": "order", "id": "OD-100000001" },
      "failure": null,
      "reversal": null,
      "occurredAtUtc": "2025-09-12T11:00:01Z"
    },
    {
      "id": "BL-900000002",
      "owner":    { "accountUid": "100000001" },
      "operator": { "accountUid": "200000050" },
      "business": { "domain": "demux", "productCode": "demux-gpt-4o" },
      "subType": "usage",
      "status": "reversed",
      "amount": {
        "original": 5.0,
        "actual":   0,
        "currency": "CNY",
        "balanceAfter": null
      },
      "ref": { "type": "order", "id": "OD-100000002" },
      "failure": null,
      "reversal": {
        "atUtc":          "2025-09-12T11:30:00Z",
        "byIamUserUid":   "200000099",
        "code":           "metering_error",
        "refundedAmount": 5.0
      },
      "occurredAtUtc": "2025-09-12T11:05:01Z"
    }
  ],
  "total": 1820
}

```

字段说明（详见 `src/features/billing/model/billing.types.ts`）：
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 账单主键（PG identity 自增，JSON 为 string）。 |
| `owner.accountUid` | string | 主账户 userId（**钱归它扣**，计费主体）。 |
| `operator.accountUid` | string | 实操账户 userId（主账户 / IAM 子账户）。**与 owner 拆成两个对象**：一是双账户语义独立，二是未来要扩 `operator.iamUserUid` 区分席位级时无侵入。 |
| `business` | object | `{ domain, productCode }`；`domain` ∈ `demux`/`platform`，`productCode` 在 `platform` 手工调账时可为 `null`。 |
| `subType` | enum | `prepaid`（订阅 / 一次性订单）/ `usage`（按量）。 |
| `status` | enum | 见下表。 |
| `amount` | object | 金额族：`{ original, actual, currency, balanceAfter }`。`balanceAfter` 只在 `status ∈ {completed, partial_refunded}` 时非 null。 |
| `ref` | object \| null | 关联业务实体：`{ type: 'order'/'subscription'/'invoice', id }`；`platform` 手工调账可为 `null`。 |
| `failure` | object \| null | 仅 `status='failed'` 时非 null：`{ code }`，`code` 取值见下方"失败码"。 |
| `reversal` | object \| null | 仅 `status ∈ {reversed, partial_refunded}` 时非 null：`{ atUtc, byIamUserUid, code, refundedAmount }`。`refundedAmount` = `amount.original − amount.actual`，前端不必再算。 |
| `occurredAtUtc` | ISO8601 | 入账时间，前端排序基准。 |

### 状态码（`status`）
| 值 | 含义 | 强制字段 |
| --- | --- | --- |
| `pending` | 处理中（异步扣款排队） | — |
| `completed` | 已完成（`amount.actual` 已生效） | `amount.balanceAfter` |
| `failed` | 失败 | `failure: { code }` |
| `reversed` | 已驳回（`amount.actual = 0`） | `reversal: { atUtc, byIamUserUid, code, refundedAmount }` |
| `partial_refunded` | 部分退还（`amount.actual < amount.original`） | `reversal` + `amount.balanceAfter` |

### 失败码（`failure.code`，枚举不可自由文本）

`insufficient_balance` / `wallet_frozen` / `sub_account_limit_exceeded` / `risk_blocked` / `amount_exceeded` / `system_error`。

### 驳回原因码（`reversal.code`）
`duplicate_charge` / `metering_error` / `service_unavailable` / `customer_compensation` / `manual_correction`。

### 单条详情 `GET /api/billing/bills/{id}`
返回单个 Bill，结构与列表元素一致。用于深链 `?focus=BL-xxx`、客服侧排障。

### 驳回 / 部分退款 `POST /api/billing/bills/{id}/reverse` （`ReverseBillPayload`）

```json
{
  "refundedAmount": 5.0,
  "code": "metering_error",
  "note": "上游 token 计量偏差 +12%，按差额退还",
  "idempotencyKey": "98e1d2c3-..."
}

```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `refundedAmount` | number | 是 | 退还金额（元）。等于 `amount.original` → 完全驳回（`status='reversed'`）；小于 `amount.original` → 部分退款（`status='partial_refunded'`）。**禁止 > original**。 |
| `code` | enum | 是 | `duplicate_charge` / `metering_error` / `service_unavailable` / `customer_compensation` / `manual_correction` 之一。 |
| `note` | string | 否 | 工单 / 备注。 |
| `idempotencyKey` | string | 否 | 同账单 24h 内重复请求返回同一结果。 |
成功响应：更新后的 `Bill` 完整体。

> BFF 实现要点：
> - 整个驳回操作必须在数据库事务内一次写完，避免"先 reversed 再撤销"中间态；
> - 钱包退款流水（充值表新增 `provider='cs_compensation'` 或 `manual` 记录）由 BFF 自动联动写入，前端不必单独发起。

## 交互流程

```

onMounted → loadAccounts() + fetchData()
filter 变化 → page=1 → listBills(...)
点击行 InfoIcon 显示 failure.code / reversal.code tooltip
驳回 / 部分退款（仅 Admin） → confirmDanger → reverseBill(id, payload) → refresh()

```

- `contactKeyword` 仅前端 email/phone 过滤，不下传 BFF。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 枚举非法值 / `fromUtc > toUtc` / `reverse.refundedAmount > amount.original` |
| 403 | `forbidden` | 非 Admin 调驳回端点 / 普通用户跨账户 |
| 404 | `not_found` | `id` 不存在 |
| 409 | `conflict` | 重复驳回（`status` 已是 `reversed`） |
| 504 | `timeout` | 大跨度时间段超时（请缩短范围） |

## 备注

- 驳回与部分退还都直接改原账单字段；BFF 内部应在事务内一次写完。
- `amount.balanceAfter` 是审计冗余字段，**只在 `status ∈ {completed, partial_refunded}` 时填**；驳回与失败为 `null`。
- 字段族嵌套化是 v2 重设计：从 13 个顶层字段降到 9 个，且 nullable 字段的"出现 / 消失"与 `status` 一一绑定，前端做行渲染时一眼可读。
- 控制台 Mock / `BillingEntry` 扁平字段：`id`、`refId`、`reversedByIamId` 与上文 JSON 对应。
