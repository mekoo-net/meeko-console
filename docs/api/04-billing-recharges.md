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

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 平台级全量充值记录 | `listRecharges` | GET | `/api/billing/recharges` |
| 账户辅助查询（按 UID/邮箱/手机过滤显示） | `accountAdminPort.listAccounts` | GET | `/accounts` |

## 请求 / 响应

### `GET /api/billing/recharges`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1。 |
| `pageSize` | int | 是 | 默认 20，最大建议 100。 |
| `accountUid` | string | 否 | 主账户 UID 精确匹配；为空查全平台。 |
| `provider` | enum/`'all'` | 否 | `alipay` / `wechat_pay` / `manual` / `cs_compensation` / `marketing_reward`。 |
| `status` | enum/`'all'` | 否 | `pending` / `paid` / `expired` / `cancelled` / `failed`。 |
| `fromUtc` | ISO8601 | 否 | 创建时间起点（inclusive）。 |
| `toUtc` | ISO8601 | 否 | 创建时间终点（inclusive）。 |

成功响应：

```json
{
  "items": [
    {
      "uid": "RC-700000001",
      "ownerAccountUid": "100000001",
      "provider": "alipay",
      "scene": 4,
      "refNo": "2025091222001445901234567890",
      "amount": 200,
      "currency": "CNY",
      "status": "paid",
      "operatorUid": null,
      "createdAtUtc": "2025-09-12T08:55:13Z",
      "paidAtUtc": "2025-09-12T08:57:01Z"
    },
    {
      "uid": "RC-700000002",
      "ownerAccountUid": "100000002",
      "provider": "cs_compensation",
      "scene": 99,
      "refNo": "TICKET-20250912-0007",
      "amount": 50,
      "currency": "CNY",
      "status": "paid",
      "operatorUid": "200000099",
      "createdAtUtc": "2025-09-12T10:18:33Z",
      "paidAtUtc": "2025-09-12T10:18:33Z"
    }
  ],
  "total": 215
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | 充值记录主键，雪花单调递增。 |
| `ownerAccountUid` | string | 钱归这个主账户。 |
| `provider` | enum | 见上方 4 类。 |
| `scene` | int | 支付场景；内部充值 = 99。 |
| `refNo` | string | 业务单号，必填，语义随 `provider` 变化（见上）。 |
| `amount` | number | 金额，元，正数。 |
| `currency` | string | ISO 4217，通常 `CNY`。 |
| `status` | enum | `pending`/`paid`/`expired`/`cancelled`/`failed`。 |
| `operatorUid` | string \| null | 内部操作人 IAM uid；仅 `manual`/`cs_compensation`/`marketing_reward` 有值。 |
| `createdAtUtc` | ISO8601 | 发起时间。 |
| `paidAtUtc` | ISO8601 \| null | 入账时间；仅 `paid` 状态必有。 |

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
| 400 | `validation` | `provider`/`status` 非法值、`fromUtc > toUtc`。 |
| 403 | `forbidden` | 普通用户尝试访问全平台数据（应只看自己账户）。 |
| 504 | `timeout` | 涉及大数据量分页查询时超时。 |

## 备注

- 充值记录是审计核心，**永远不删除**（即便业务上发起退款也只是新建一条扣款型账单，参见 [`05-billing-bills.md`](./05-billing-bills.md)）。
- 同一 `refNo + provider` 应唯一（保证幂等）；BFF 在重复请求时返回原记录。
