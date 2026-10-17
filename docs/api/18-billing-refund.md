# 18 · 余额退款

账户详情页右上角「退款」。只扣钱包余额，钱由财务按折损比例**线下**打给用户：
不走支付宝 / 微信原路退款，也不收回这笔钱当初带来的邀请返利。

| 层 | 位置 |
| --- | --- |
| 前端 | `BalanceRefundDrawer`（`features/platform/billing/components`），从 `AccountLayout` 打开 |
| BFF | `BillingRefundAdminController` |
| Billing | `Domain/Refunds/BalanceRefund`（表 `billing.balance_refunds`）、`Application/Refunds/RefundBalanceHandler` |

## 规则

1. **扣减金额**不能超过当前可用余额，否则 `conflict`。
2. **折损比例** 0 ≤ x < 100（%）。**实退金额** = 扣减金额 × (1 − 折损比例)，按分向下取整（宁少一分不多一分）。
3. 同一个 `idempotencyKey` 重复提交只扣一次，返回第一次的结果。前端每次打开退款抽屉生成一个。
4. 每笔退款在钱包流水里记一笔扣款，挂在退款单下（`reference_kind = BalanceRefund`），流水备注写明实退金额与折损比例。
   退款不进账单列表：账单只收扣费与冲正扣费的退款。

## `POST /api/admin/billing/refunds`

权限 `billing.recharge.write`。

```json
{
  "accountUid": 100000000003,
  "amount": 100,
  "lossRatePercent": 10,
  "note": "用户申请退款，支付宝 zhang@personal.test",
  "idempotencyKey": "5f0c1c9e-8a7d-4b0e-9a55-1f7e3d2c4b6a"
}
```

响应：

```json
{
  "id": "RF20261018000000001",
  "accountUid": "100000000003",
  "amount": 100,
  "lossRatePercent": 10,
  "payoutAmount": 90,
  "note": "用户申请退款，支付宝 zhang@personal.test",
  "balanceAfter": 0,
  "createdAtUtc": 1792249000000
}
```

| 场景 | code |
| --- | --- |
| 金额 ≤ 0、折损比例越界、备注超过 200 字 | `validation` |
| 可用余额不足；幂等键已被其他账户的退款使用 | `conflict` |
