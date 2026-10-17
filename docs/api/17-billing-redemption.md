# 17 · 兑换码（充值渠道「兑换码」的卡密管理）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/billing/redemption/batches`（批次管理）、`/billing/redemption/codes`（兑换记录）、`/billing/redemption/attempts`（兑换日志）；`/billing/redemption` 重定向到批次管理 |
| 角色 | **Admin** |
| 视图 | `src/features/platform/redemption/views/Redemption{Batches,Codes,Attempts}View.vue` |
| 批次弹窗 | `RedemptionBatchDialog`：点批次弹出，显示该批次的卡密使用表格 |
| Port | `src/features/platform/redemption/services/ports/redemptionPort.ts` |
| 后端 | Billing `Domain/Redemptions`（表 `billing.redemption_batches` / `redemption_codes` / `redemption_attempts`）+ BFF `BillingRedemptionAdminController`、`BillingRedemptionController` |
| 权限 | 读 `billing.redemption.read`；写 `billing.redemption.write`，含导出明文卡密，按资金权限授予 |

## 业务定义

> 兑换码是一个**充值渠道**（驱动 `redeem_code`，单例），与支付宝、微信并列：
> 后台按批次生成卡密 → 导出上架到**发卡网**售卖 → 用户在钱包输入卡密 →
> 校验通过后生成一笔充值单按面值入账，充值单的来源由批次的**入账途径**决定（见下）。
>
> 卡密是用钱买来的，后台必须能回答「这张卡什么时候、被谁、从哪个 IP / 设备兑换的」，
> 也要能发现枚举卡密和转卖 / 外泄。所以数据分三层：
>
> - **批次**：一次生成的一组同面值卡密。冻结、作废、导出都以批次为单位，且全部留痕；
> - **卡密**：每张卡一行，兑换后记下兑换现场（账户、时间、IP、UA、充值单号）；
> - **兑换尝试**：用户每次提交都记一行，**失败的也记**（卡密不存在、已被兑换、频控……）。

### 关键规则

1. **明文只出现两次**：生成（含追加）批次的响应、导出批次的响应。其余接口一律只给脱敏卡密。
   导出只读，不改批次、不留记录。
2. **卡密格式**：16 位 Crockford Base32（字符集 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`，去掉 I/L/O/U；80 位随机，取自 CSPRNG），
   4 位一组，前面加批次前缀，如 `MK-7Q2D-H8KX-PM3R-W4NT`。库里 `redemption_codes.code` 存不带前缀与分隔符的 16 位正文（唯一索引 + 格式 CHECK），兑换按它直接查。
   前缀只标识售卖批次，兑换时不参与匹配，用户漏写也能兑。
3. **脱敏格式**：保留前缀与首末两组，中间合成一个 `****`，如 `MK-7Q2D-****-W4NT`。
4. **完整卡密不进 URL**：按卡密查询走 `POST .../codes/search`，避免卡密被网关和访问日志记下。
5. **冻结与作废**：冻结可逆（批次冻结会连带冻结其中未兑换的卡，解冻只恢复这批连带冻结的，
   单张手工冻结的保持冻结）；作废不可逆。已兑换的卡不受任何一个影响。
6. **每户限兑**：`perAccountLimit` 限制单账户在**本批次**内最多兑换几张，超限记 `limit_exceeded`。
7. **频控**：每账户每小时失败次数上限来自渠道配置 `maxFailuresPerHour`，超限记 `rate_limited`。

### 入账途径与业务

批次生成时选定入账途径 `purpose`，之后不可改（已兑换的卡按当时的途径入了账）。它决定兑换生成的充值单记在哪个来源下：

| `purpose` | 后台显示 | 充值单来源 `provider` | 算充值 | 推荐返利 / 充值送券 |
| --- | --- | --- | --- | --- |
| `recharge` | 账户充值 | `redemption`（兑换码） | ✓ | ✓ |
| `reward` | 活动奖励 | `marketing_reward`（营销奖励） | | |
| `compensation` | 客服补偿 | `cs_compensation`（客服补偿） | | |

用户兑换时带上所在业务 `productCode`（与充值下单同一口径），记在充值单与兑换尝试上。
「账户充值」批次的兑换与入账同事务发布 `RechargeSucceeded`，推荐返利按该业务的费率发放；不带业务时没有产品费率，只有账户级覆盖费率生效。

## 充值渠道驱动 `redeem_code`

在 `GET /api/admin/billing/channels/types` 中注册（`allowMultiple = false`，`supportedScenes = ["redeem"]`），配置字段：

| key | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `redeemTip` | TextArea | | 用户钱包兑换框下方的说明 |
| `maxFailuresPerHour` | Text | ✓ | 每账户每小时失败上限，超过后 1 小时内禁止兑换 |

渠道是单例，Billing 启动时自动建好（停用状态），配置后由管理员启用。它不收款，不出现在用户充值面的付款方式里。
渠道停用时，用户端兑换入口关闭，所有提交返回失败（不写入卡密状态，也不记兑换尝试）。

## 用户端接口

前缀 `/api/billing/redemption`，需登录（账户用户）。

| 业务动作 | HTTP | 端点 | 说明 |
| --- | --- | --- | --- |
| 兑换入口 | GET | `/` | `{ enabled, tip }`；`tip` 即渠道配置 `redeemTip` |
| 兑换 | POST | `/redeem` | 请求体 `{ code, productCode? }`；成功返回 `{ amount, rechargeId, codeMasked, redeemedAtUtc }` |

- 输入忽略大小写、空格、各种横线和全角字符，前缀可省略；`O` 按 `0`、`I`/`L` 按 `1` 纠正（Crockford 规则，字符集里没有这几个字母）。
- 成功按批次的入账途径生成充值单并按面值入账；同一账户重复提交已兑换过的卡（双击、超时重试）直接返回原回执，不算失败。
- `productCode` 须是已登记且启用的产品，否则 `not_found`（不记兑换尝试）。
- 失败：卡密不存在 `not_found`（404）；已被他人兑换、已冻结、已作废、已过期、未生效、超出每户限兑 `conflict`（409）；
  频控 `too_many_requests`（429）。消息是给用户看的中文，可直接展示。
- 每小时失败上限只数真正的失败：被频控拦下的提交不计入，否则持续重试的人永远解不了封。

## 接口清单

前缀 `/api/admin/billing/redemption`。

| 业务动作 | Port 方法 | HTTP | 端点 |
| --- | --- | --- | --- |
| 概览 KPI | `overview` | GET | `/overview` |
| 批次分页 | `listBatches` | GET | `/batches?page&pageSize&batchId&name&salesChannel&status&purpose&fromUtc&toUtc` |
| 批次下拉 | `listBatchOptions` | GET | `/batches/options` |
| 生成批次 | `createBatch` | POST | `/batches` |
| 编辑批次（含追加卡密） | `updateBatch` | PATCH | `/batches/{id}` |
| 导出卡密（未兑换 / 已兑换 / 全部） | `exportBatch` | POST | `/batches/{id}/export` |
| 冻结 / 解冻批次 | `setBatchFrozen` | POST | `/batches/{id}/freeze`、`/batches/{id}/unfreeze` |
| 作废批次剩余卡密 | `voidBatch` | POST | `/batches/{id}/void` |
| 卡密查询 | `listCodes` | POST | `/codes/search` |
| 单张卡密 | `getCode` | GET | `/codes/{id}` |
| 冻结 / 解冻卡密 | `setCodeFrozen` | POST | `/codes/{id}/freeze`、`/codes/{id}/unfreeze` |
| 作废卡密 | `voidCode` | POST | `/codes/{id}/void` |
| 兑换尝试分页 | `listAttempts` | GET | `/attempts?page&pageSize&result&accountUid&accountEmail&ip&codeId&batchId&fromUtc&toUtc` |

批次分页的 `name`、`salesChannel` 为模糊匹配，`fromUtc` / `toUtc` 作用于创建时间。时间一律 **epoch ms（UTC）**，金额 CNY（decimal → number）。分页响应 `{ items, total }`。
冻结 / 作废的请求体为 `{ "reason": "..." }`，`reason` 必填，写在受影响的卡上（`statusReason`）；解冻没有请求体。导出为 `{ "scope": "..." }`。

## DTO

### `RedemptionBatchDto`

```json
{
  "id": "RD20260905000000001",
  "name": "100 元充值卡 · 9 月",
  "salesChannel": "发卡网 · Meeko 官方小店",
  "purpose": "recharge",
  "faceValue": 100,
  "quantity": 200,
  "redeemedCount": 184,
  "frozenCount": 0,
  "voidedCount": 0,
  "status": "active",
  "codePattern": "MK-XXXX-XXXX-XXXX-XXXX",
  "perAccountLimit": null,
  "startsAtUtc": null,
  "expiresAtUtc": null,
  "createdBy": { "uid": "7", "displayName": "财务 · 周宁" },
  "createdAtUtc": 1787000000000
}
```

| 字段 | 说明 |
| --- | --- |
| `status` | `active` / `frozen` / `voided` / `expired`。「未生效」「已兑完」由前端按 `startsAtUtc`、计数推导，不单列 |
| `salesChannel` | 选填，管理员手填的销售渠道（如某个发卡网店铺）；未填为 `null` |
| `purpose` | 入账途径 `recharge` / `reward` / `compensation`，生成后不可改 |
| `perAccountLimit` | `null` = 不限 |
| `startsAtUtc` / `expiresAtUtc` | `null` = 生成即生效 / 长期有效 |

### `POST /batches` 请求体

```json
{
  "name": "100 元充值卡 · 10 月",
  "salesChannel": "发卡网 · Meeko 官方小店",
  "purpose": "recharge",
  "faceValue": 100,
  "quantity": 500,
  "prefix": "MK",
  "perAccountLimit": null,
  "startsAtUtc": null,
  "expiresAtUtc": 1800000000000
}
```

- `quantity` 1–10000；`prefix` 为空或 2–6 位大写字母数字。
- `expiresAtUtc` 须晚于 `startsAtUtc`。
- 编辑：请求体 `{ name, salesChannel, quantity, perAccountLimit, startsAtUtc, expiresAtUtc }`。入账途径、面值、前缀不可改；
  `quantity` 只能大于等于原值，多出的张数由服务端按批次格式生成（单次最多 10000），仅生效中且未过期的批次可追加，否则 `conflict`。
  失效时间延后到未来时，已过期的批次与卡密恢复可兑换。
- 生成与追加的响应是 `{ "batch": RedemptionBatchDto, "codes": ["MK-....", ...] }`；编辑只含本次追加的卡密（没有追加为空数组）。

### `POST /batches/{id}/export`

请求体 `{ "scope": "unused" | "redeemed" | "all" }`。

| scope | 导出哪些卡 | 前置条件 |
| --- | --- | --- |
| `unused` | 状态为 `unused` 的卡（补货上架用） | 批次生效中且未过期，否则 `conflict` |
| `redeemed` | 状态为 `redeemed` 的卡（对账用） | 任意批次状态 |
| `all` | 批次内全部卡，含冻结、作废、过期（对账用） | 任意批次状态 |

所选范围内没有卡时返回 `conflict`。

响应：

```json
{
  "batch": { "...": "RedemptionBatchDto" },
  "scope": "redeemed",
  "items": [
    {
      "code": "MK-7Q2D-H8KX-PM3R-W4NT",
      "status": "redeemed",
      "redeemedAtUtc": 1788100000000,
      "redeemedBy": { "uid": "10086", "email": "a@example.com", "displayName": "Alice" }
    }
  ]
}
```

未兑换的卡 `redeemedAtUtc`、`redeemedBy` 为 `null`。前端对已兑换 / 全部导出只提供带状态列的 CSV，不提供一行一张的 TXT，
避免把已兑换的卡当库存导入发卡网。

### `RedemptionCodeDto`

```json
{
  "id": "258",
  "batchId": "RB20260905001",
  "batchName": "100 元充值卡 · 9 月",
  "codeMasked": "MK-B39Y-****-3N36",
  "faceValue": 100,
  "status": "redeemed",
  "redeemed": {
    "account": { "uid": "100000211", "email": "user211@personal.test", "displayName": null },
    "atUtc": 1792249000000,
    "ip": "14.155.66.231",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "rechargeId": "RC20261017000000185",
    "productCode": "demux"
  },
  "failedAttempts": 0,
  "expiresAtUtc": null,
  "createdAtUtc": 1787000000000,
  "statusReason": null
}
```

| 字段 | 说明 |
| --- | --- |
| `status` | `unused` / `redeemed` / `frozen` / `voided` / `expired` |
| `redeemed` | 兑换现场，未兑换为 `null` |
| `failedAttempts` | 命中这张卡的失败提交次数；已兑换后仍被他人提交 → 疑似转卖或外泄 |
| `statusReason` | 冻结 / 作废原因 |

`POST /codes/search` 请求体：`{ page, pageSize, code?, batchId?, status?, accountUid?, accountEmail?, ip?, fromUtc?, toUtc? }`。
`code` 为完整卡密（前缀可省略）时精确匹配，1–4 位按末尾匹配，其余输入返回 `validation`；
`accountEmail` 为模糊匹配（BFF 先解析成账户，最多取前 100 个），`ip` 为前缀匹配；时间范围作用于兑换时间。
排序：兑换过的按兑换时间、未兑换的按生成时间，统一倒序。

### `RedemptionAttemptDto`

```json
{
  "id": "9031",
  "atUtc": 1792170000000,
  "account": { "uid": "100000917", "email": "tmp8841@mailbox.test" },
  "inputMasked": "MK-DB43-****-UVVC",
  "codeId": null,
  "batchId": null,
  "batchName": null,
  "result": "not_found",
  "productCode": "demux",
  "amount": null,
  "ip": "45.153.160.2",
  "userAgent": "python-requests/2.32.3",
  "rechargeId": null
}
```

`result` 取值：`success`、`not_found`、`already_redeemed`、`frozen`、`voided`、`expired`、`not_started`、`limit_exceeded`、`rate_limited`。
查询参数 `result=failed` 表示除 `success` 外的全部结果。用户输入的卡密即使不存在也要脱敏后记录，用于识别枚举。

### `RedemptionOverviewDto`

| 字段 | 说明 |
| --- | --- |
| `batchCount` / `issuedCount` / `issuedValue` | 累计批次数、发行张数、发行面值 |
| `redeemedCount` / `redeemedValue` | 累计兑换 |
| `outstandingCount` / `outstandingValue` | 仍可兑换的卡密（批次生效中且未过期）——已卖出未兑即预收负债 |
| `todayRedeemedCount` / `todayRedeemedValue` | 当日兑换。「当日」从查询参数 `dayStartUtc`（浏览器本地零点，epoch ms）算起，不传按 UTC 零点 |
| `failedAttempts24h` | 近 24 小时失败提交数 |
| `suspiciousIps24h` | 近 24 小时失败 ≥ 10 次的 IP 数 |

## 错误码

| 场景 | code |
| --- | --- |
| 参数不合法、缺少原因 | `validation` |
| 批次 / 卡密不存在 | `not_found` |
| 状态不允许（冻结非生效批次、导出已冻结批次、作废已兑换卡密等） | `conflict` |
