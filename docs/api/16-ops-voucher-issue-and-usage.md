# 16 · 用平台令牌下发抵扣券、查用户、查 Demux 用量

给脚本 / 客服用。走 **Meeko 平台网关**（生产 `https://api.meeko.top`），`Authorization: Bearer <平台令牌明文>`。

令牌在控制台 **设置 → 平台令牌** 签发，勾选下面这些权限（可事后改）：

| 权限码 | 控制台叶子名 | 用途 |
|---|---|---|
| `account.admin.read` | 查看平台账户 | 按邮箱 / UID 查用户 |
| `billing.voucher.read` | 查看代金券 | 列模板、查已发券 |
| `billing.voucher.write` | 下发代金券 | 向账户发券 |
| `demux:usage:read` | 查看用量与日志 | 查 Demux 调用与汇总 |

两套响应别混：

| 前缀 | 成功体 | 失败 |
|---|---|---|
| `/api/admin/*`（BFF） | HTTP 200，**直接是资源 JSON** | RFC 7807 ProblemDetails |
| `/demux/api/*`（Demux） | `{ "success": true, "data": … }` | HTTP 仍 200，`success: false` + `message` |

账户 / 模板 / 日志的 long 主键在 JSON 里是 **字符串**。日志时间参数是 **Unix 毫秒**。

---

## 1. 按邮箱或 UID 查用户

### 控制台

`/accounts`：UID 精确匹配；「邮箱 / 手机」模糊匹配 Owner 邮箱、手机、昵称。

### API

**按 UID（精确）**

```http
GET /api/admin/accounts?accountUid=100000001&page=1&pageSize=20
Authorization: Bearer <token>
```

或详情：

```http
GET /api/admin/accounts/100000001
Authorization: Bearer <token>
```

**按邮箱 / 手机 / 昵称（模糊，contains，大小写不敏感）**

```http
GET /api/admin/accounts?contactKeyword=user@example.com&page=1&pageSize=20
Authorization: Bearer <token>
```

列表成功体（节选）：

```json
{
  "items": [
    {
      "uid": "100000001",
      "type": "personal",
      "displayName": "张三",
      "status": "active",
      "tier": 1,
      "owner": {
        "displayName": "张三",
        "email": "user@example.com"
      },
      "walletSummary": {
        "available": 12.5,
        "held": 0,
        "currency": "CNY",
        "snapshotAtUtc": "2026-08-22T10:00:00Z"
      }
    }
  ],
  "total": 1
}
```

记下 `uid`，后面发券和查用量都用它。邮箱对不上时再试手机号或昵称；`contactKeyword` 是模糊匹配，可能多条。

---

## 2. 下发抵扣券

控制台：`/billing/vouchers` → 选已上架模板 → **下发** → 搜账户 → 确认。

脚本按三步：列模板 → 确认 Active → 对 UID 发券。

### 2.1 列出券模板

```http
GET /api/admin/billing/voucher/templates?includeArchived=false&page=1&pageSize=50
Authorization: Bearer <token>
```

只要 `status === 1`（Active）的行。`0` Draft / `2` Paused / `3` Archived 不能发。

| 字段 | 说明 |
|---|---|
| `id` | 模板 ID，发券路径用它 |
| `name` / `code` | 名称、内部码 |
| `deductKind` | `0` 无门槛（余额型代金券）· `1` 满减 · `2` 折扣 |
| `faceValue` / `thresholdAmount` / `discountRate` | 面额 / 门槛 / 折扣率 |
| `perUserLimit` | 每账户最多几张；到顶则这次对该 UID **静默跳过** |
| `totalQuota` / `issuedCount` | 总配额与已发数 |

### 2.2 发券

```http
POST /api/admin/billing/voucher/templates/{templateId}/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountUids": ["100000001", "100000002"],
  "batchToken": "optional-idempotency-key"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `accountUids` | 是 | 账户 UID 字符串数组，至少一个 |
| `batchToken` | 否 | 幂等键。不传则服务端生成。同一 `templateId + accountUid + batchToken` 已发过则跳过，不重复发卡 |

成功：

```json
{
  "issuedCount": 1,
  "requestedCount": 2
}
```

`issuedCount < requestedCount` 常见原因：该 UID 已达 `perUserLimit`、或同一 `batchToken` 已经发过。不是 HTTP 错误。

模板未上架 / 不存在：`409` / `404`。

### 2.3 核对该账户已有券

```http
GET /api/admin/billing/vouchers?accountUid=100000001&page=1&pageSize=20
Authorization: Bearer <token>
```

行里看 `remainingValue`、`status`（`0` 未用 · `1` 已用 · `2` 过期 · `3` 已作废）、`validFromUtc` / `validToUtc`。

---

## 3. 查某个用户的 Demux 用量

控制台：`/demux/logs`，筛账户 UID 或邮箱，时间窗最长 7 天。

脚本走 Demux 控制面。响应是信封，用量在 `data` 里。

### 3.1 明细（按 UID）

`fromUtc` / `toUtc` 用 Unix 毫秒。建议始终带时间窗，避免全表扫。

```http
GET /demux/api/admin/logs?accountUid=100000001&fromUtc=1755801600000&toUtc=1756406399999&p=1&pageSize=50
Authorization: Bearer <token>
```

没有 UID、只有邮箱时，用 `contactKeyword`（服务端先解析成账户再筛日志）。**已传 `accountUid` 时忽略** `contactKeyword`。

```http
GET /demux/api/admin/logs?contactKeyword=user@example.com&fromUtc=1755801600000&toUtc=1756406399999&p=1&pageSize=50
Authorization: Bearer <token>
```

成功（信封）：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "890012345678901234",
        "createAt": "2026-08-21T03:14:22Z",
        "account": { "uid": "100000001", "email": "user@example.com" },
        "modelName": "demux-gpt-4o",
        "status": "success",
        "usage": { "totalTokens": 787 },
        "cost": { "total": 0.03523 },
        "bill": { "id": "BL20260821000008821", "status": "completed" }
      }
    ],
    "total": 124,
    "page": 1,
    "pageSize": 50
  }
}
```

常用过滤：`status`（`success` / `failed` / `cancelled`）、`modelName`、`vendorKey`、`errorOnly=true`。`pageSize` 上限 500，默认 50。

### 3.2 汇总（一段时间内的 token / 调用量）

**旧形（配额 + token + 折合 RPM/TPM）**

```http
GET /demux/api/admin/logs/stat?accountUid=100000001&fromUtc=1755801600000&toUtc=1756406399999
Authorization: Bearer <token>
```

`data`：`{ "quota", "tokens", "rpm", "tpm" }`。不传时间则默认最近 24 小时。

**按小时/天分桶**

```http
GET /demux/api/admin/logs/stats?accountUid=100000001&fromUtc=1755801600000&toUtc=1756406399999
Authorization: Bearer <token>
```

还可按模型 / 渠道拆：

- `GET /demux/api/admin/logs/stats/by/model`
- `GET /demux/api/admin/logs/stats/by/provider`
- `GET /demux/api/admin/logs/stats/by/vendor`

这些都要 `fromUtc` + `toUtc`。

### 3.3 单条日志

```http
GET /demux/api/admin/logs/{id}
Authorization: Bearer <token>
```

---

## 4. 一条脚本串起来

```bash
BASE=https://api.meeko.top
TOKEN='<平台令牌明文>'
EMAIL='user@example.com'
# 最近 7 天（毫秒）
FROM=$(($(date -u +%s) * 1000 - 7 * 86400000))
TO=$(($(date -u +%s) * 1000))

# 1) 邮箱 → UID
UID=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/admin/accounts?contactKeyword=$EMAIL&page=1&pageSize=20" \
  | jq -r '.items[0].uid')

# 2) 选一张 Active 模板
TID=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/admin/billing/voucher/templates?page=1&pageSize=50" \
  | jq -r '.items[] | select(.status==1) | .id' | head -n1)

# 3) 下发（换 batchToken 才会再发一张）
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"accountUids\":[\"$UID\"],\"batchToken\":\"ops-$(date +%Y%m%d)\"}" \
  "$BASE/api/admin/billing/voucher/templates/$TID/issue"

# 4) 用量明细
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE/demux/api/admin/logs?accountUid=$UID&fromUtc=$FROM&toUtc=$TO&p=1&pageSize=50"
```

Windows PowerShell 把 `FROM`/`TO` 换成：

```powershell
$to = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$from = $to - 7 * 86400000
```

---

## 5. 常见失败

| 现象 | 原因 |
|---|---|
| 401 | 令牌错、过期、已吊销；或没走平台网关 |
| 403 | 令牌没勾对应权限；改权限后网关可能缓存约 1 小时 |
| 发券 409「is not active」 | 模板不是 Active |
| `issuedCount` 为 0 | 每用户上限、或同一 `batchToken` 已发过 |
| 用量 `data.items` 为空 | 时间窗不对（毫秒）、UID 错、或该窗内没调用 |
| 读 Demux 当 BFF 解析 | `/demux/api/*` 要先看 `success` 再取 `data` |

改令牌权限：控制台列表点 **权限**。明文在「令牌」列展开 / 复制；升级前签发、库里没存明文的旧令牌只能重签。
