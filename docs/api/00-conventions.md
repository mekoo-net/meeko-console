# 通用约定

> 所有页面共享的传输层 / 鉴权 / 数据契约。各页面文档（`01-*.md` 之后）只描述与本文件**不同**的部分。

## 1. 统一返回模型 `AppResult<T>`

后端（`Meeko.Common.Results`）的约定：

- **成功** `ToHttp()` → `200 OK` + 直接返回 `T` 作为响应体。
- **失败** `ToHttp()` → 返回 RFC 7807 ProblemDetails，HTTP 状态码与 `code` 一一对应。

前端将两者统一为离散类型，定义见 `src/shared/api/httpTypes.ts`：

```ts
type AppResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };

interface AppError {
  code: 'unknown' | 'validation' | 'unauthorized' | 'forbidden'
      | 'not_found' | 'conflict' | 'too_many_requests'
      | 'upstream' | 'dependency_down' | 'timeout';
  message: string;
  /** RFC 7807 ProblemDetails 的 errors 字段：字段级校验错误。 */
  details?: Record<string, string[]>;
  /** OTP / 充值等需要 Retry-After 的场景。 */
  retryAfterSeconds?: number;
}
```

### HTTP 状态码 ↔ ErrorCode 对照

| HTTP | code | 典型场景 |
| --- | --- | --- |
| 400 | `validation` | 入参 zod 失败、字段缺失 |
| 401 | `unauthorized` | accessToken 缺失 / 失效 |
| 403 | `forbidden` | 角色不足、跨账户越权 |
| 404 | `not_found` | uid 不存在 |
| 409 | `conflict` | 唯一键冲突 / 状态机非法迁移 |
| 429 | `too_many_requests` | OTP / 充值频控（响应头 `Retry-After`） |
| 504 / 502 | `timeout` / `upstream` | 上游 / 网关问题 |
| 503 | `dependency_down` | 下游依赖不可用 |
| 其他 5xx | `unknown` | 兜底 |

### ProblemDetails 示例

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json
```

```json
{
  "type": "about:blank",
  "title": "请求参数无效",
  "status": 400,
  "code": "validation",
  "detail": "字段校验失败",
  "errors": {
    "amount": ["必须大于 0"],
    "provider": ["不支持的支付渠道"]
  }
}
```

## 2. 分页约定

所有列表接口统一接收 `page` / `pageSize` 查询参数，并返回：

```json
{
  "items": [/* T[] */],
  "total": 1024
}
```

- `page` 从 **1** 开始（前端默认 1）。
- `pageSize` 前端默认 20；常用 `[20, 50, 100]`。
- `total` 是过滤后的总条数，用于分页器跳转。
- 排序按业务域默认（如 `Account.createdAtUtc DESC`、`LogEntry.occurredAtUtc DESC`），暂不暴露排序参数。

## 3. 标识符 / 时间 / 金额

| 项 | 约定 |
| --- | --- |
| `uid`（long） | JSON 中**始终序列化为 string**（避免 JS Number 精度），前端类型为 `string`。 |
| 时间字段 | 一律以 ISO-8601 UTC 字符串传输，字段名以 `AtUtc` 结尾。 |
| 金额 | 后端 decimal，前端 `number`，单位**元**；展示走 `formatMoney` 做 banker rounding。 |
| 货币 | 字段名 `currency`，ISO 4217（`CNY` 默认）。 |
| `tier` / LV | 1 起的正整数，默认 1。 |

## 4. 鉴权

### 4.1 统一 IAM 模型（契约根）

> 平台对所有账户走**同一条登录 / 鉴权链路**，区别只在产品 UI 是否暴露 IAM 管理。

- **登录主体永远是 IAM 用户**：无论 `account.type` 是 `personal` 还是 `organization`，BFF 签发的 JWT 中 `sub` 一律为 `iam_user_uid`。
- **personal 账户内部持有一个 1:1 绑定的隐式 IAM 用户**——仅作为鉴权 / 审计链路的主体存在，**不在 IAM 列表 UI 暴露**，也不允许新增其它 IAM 子用户（业务规则上 `iamUserCount` 恒为 `1`）。
- **所有审计字段非可空**：`change.byIamUserUid`、`reversal.byIamUserUid`、`owner.iamUserUid` 等永远有值，前端类型可直接收紧为 `string`（非 `string | null`）。
- **登录端点单一**：只暴露 `POST /auth/login`，BFF 根据 `username` + 可选 `tenant` 解析到唯一 IAM 用户；**不存在** `/auth/login-iam` 之类的二选一端点。
- **个人 → 组织升级**：升级时新增组织级 IAM 子用户，原隐式用户被标记为 `Owner` 席位；JWT `sub` 维持不变，**历史审计字段不需要回填**。

### 4.2 请求头

```
Authorization: Bearer <accessToken>
```

- `accessToken` / `refreshToken` 在 `auth` store + `localStorage` 持久化（key：`meeko.admin.session.v1`）。
- 角色由 IAM 用户决定：`Admin` / `Owner` / `Member`（personal 账户的隐式用户恒为 `Owner`）。
- 401 → 前端清空 session 并跳 `/login`。
- 受 `meta.roles` 保护的路由（如 `/notices/*`、`/demuxai/*`、`/billing/channels`）需要 `Admin` 角色；不满足会被路由守卫重定向到 `/accounts`。

详见 `src/stores/auth.ts`：

```ts
type AppRole = 'Admin' | 'Owner' | 'Member';
```

## 5. Mock / 真接 BFF 切换

环境变量（参见根目录 `.env.example` 与 `README.md`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `VITE_USE_MOCK` | `true` | `false` 时各 `get*Port()` 返回 HttpAdapter；当前未实现会抛出错误提示。 |
| `VITE_MOCK_DELAY_MS` | `220` | Mock 延迟（毫秒），便于感受 loading。 |
| `VITE_API_BASE` | — | 真接 BFF 时的 baseUrl；与 Vite dev proxy 配合。 |

要接入真 BFF，仅需新增 `src/features/*/services/bff/Http*Adapter.ts` 并在工厂 `getXxxPort()` 中按 flag 注册，**不修改** Port 接口与视图代码。

## 6. 字段级 zod 校验

- 列表 / 详情接口的响应都过 zod schema 校验（schema 集中在各 `model/*.types.ts`）。
- BFF 字段名一律 **camelCase**；含 long 的字段用 `string`（必要时后端转换）。
- `null` 与 `undefined` 区分：
  - 业务"无此值" → JSON 可省略字段或为 `null`，前端 zod 用 `.nullable().optional()` 兼容。
  - 切勿用空字符串 `""` 表示无值（除非是输入框默认值）。

## 7. 时间范围参数 `fromUtc` / `toUtc`

- 列表接口涉及时间过滤时统一使用 `fromUtc`（inclusive）与 `toUtc`（inclusive）。
- 日志类（`/demuxai/logs`）**必传时间范围且最长 7 天**，BFF 在缺省时应拒绝（避免全表扫）。

## 8. 幂等

- 充值 / OTP / 通知发送等"会产生副作用"的接口接受可选 `idempotencyKey`，前端在表单层生成 nanoid。
- 后端需在合理 TTL（≥ 24h）内对重复 key 返回相同业务结果。

## 9. 软删 / 硬删

| 实体 | 删除策略 | 说明 |
| --- | --- | --- |
| `Account` | 软删（status='deleted'） | 列表默认不过滤已删除，UI 用状态标识。 |
| `IamUser` | 软删（status='disabled' / 'locked'） | 同上。 |
| `Provider` | 硬删 | 删除时级联清理 mapping，由 BFF 在事务内 reconcile。 |
| `Model` | 后端软删（tombstone），前端 Mock 硬删 | 历史日志能 join 到 displayName。 |
| `Pricing` | 硬删 | 删除后 BFF 拒绝该 modelId 的计费请求。 |
| `SmtpProvider` | 硬删 | 关联模板回退到默认渠道。 |
| `EmailTemplate` | 软删（isActive） | 历史不可丢。 |

## 10. 字段族封装原则（"对象优于扁平"）

> 这是 v2 redesign 的核心约束。所有页面文档遵循此原则；下文列举的反模式在新增接口时**应被拒绝**。

### 10.1 必须封装成子对象的字段族

凡是满足以下任一条件的"语义同源"字段必须封装为嵌套子对象：

1. **同生同灭**：几条字段总是一起出现 / 一起为 null。  
   反例：`reversedAtUtc` / `reversedBy` / `reversedCode` 散落顶层 → 正例：`reversal: { atUtc, byIamUserUid, code } | null`
2. **状态扩展**：某个状态值开启时才有意义的字段。  
   反例：`failureCode` 顶层（90% 行是 null）→ 正例：`failure: { code } | null`（与 `status='failed'` 联动）
3. **配对单价 + 实际金额**：单价快照与扣费金额配对内联。  
   正例：`DimensionCost = { perMToken, amount }`、`cost.input.cachedRead: DimensionCost`
4. **角色族**：owner / operator / change.by 等。  
   正例：`owner: { iamUserUid, displayName, email, phone }`、`change: { byIamUserUid, atUtc, note }`
5. **判别联合**：同一字段集随判别字段形状变化（10-pricing / 11-logs 已示例）。  
   正例：`billingType + pricing` / `source.provider + source.refNo` / `latency.kind + latency.ms`

### 10.2 错误对象与命令响应统一形状

**所有操作类接口的失败信息**统一为：

```ts
type ApiError = {
  code: string;            // 机器可识别枚举（auth_failed / upstream_5xx / mismatch / ...）
  message?: string;        // 上游原文摘要 ≤ 200 字符，仅展示
  httpStatus?: number;     // 上游 / 网关 HTTP 状态码（log 用，其它端点可省）
};
```

应用在两种场景：

| 场景 | 形状 |
| --- | --- |
| **资源类**（CRUD：list / get / create / update / delete） | 走 HTTP 状态码 + ProblemDetails；body 不再额外封 `success: false`。 |
| **操作类**（test / verify / dry-run，业务层 ok/fail 是常态） | `200 OK` + body `{ ok: boolean, error: ApiError \| null, ...domainExtras }`。HTTP 仍是 200 表示"调用本身成功了，只是业务结论是 fail"。 |

> **`AdminCommandResult { success, uid, failureCode, failureMessage }` 已退役**：与 ProblemDetails 重复，让前端要在"HTTP + body"两个层面读成败，引入歧义。

### 10.3 计费 cost 形状统一（"每个维度都有 amount"）

所有 `billingType` 的 `cost` 字段对每个**计费维度**都包含 `amount`，便于对账与 BI 直接读：

- `per_token`：每个 `DimensionCost = { perMToken, amount }`（input / output 及各子集均如此）；
- `per_call` / `per_image` / `per_video` / `per_audio_minute` / `per_character`：除单价 + `total` 外，**额外补 `amount` 字段**，单维场景下 `amount === total`，多维场景（如 `per_call` 的缓存命中拆分 `amount` / `cachedAmount`）按维度小计。

### 10.4 命名一致性

| 概念 | 全局命名 | 反例（已禁用） |
| --- | --- | --- |
| 时间字段 | `*AtUtc` 后缀 | `createAt` |
| IAM 用户主键 | `iamUserUid` | `iamId` / `iamUid` |
| 字段风格 | camelCase | snake_case（`avatar_url` / `is_account_owner`） |
| 字符串枚举 | 全小写 / snake_case 字符串 | magic number（OTP `purpose: 1`） |
| 错误对象 | `error: { code, message, ... }` | `errorCode + errorMessage` / `failureCode + failureMessage` |
| 单价 / 金额 | 子对象 `amount: { value, currency }` 优于平铺 | 顶层 `amount + currency` 散写（小场景可保留，但同一文档内不混用） |

### 10.5 列表 vs 详情投影分层

资源含子树（如 `Provider.providerModels` / `Pricing.pricing` 详细子树）时，列表只返回**轻投影**（行渲染必需字段 + 子树概要 / 计数 / 首 N 条 names），详情端点 `GET /{uid}` 才返回完整子树。

参考实现：08-providers 列表 `mappings: { count, names[] }` + 详情 `providerModels / modelMappings`；10-pricing 列表 `summary: {...}` + 详情完整 `pricing` 子树。

---

后续每个页面文档遵循同一目录：

1. **页面信息**（路由 / 角色 / 视图文件）
2. **依赖的接口清单**（列出 Port 方法 → REST 端点）
3. **请求 / 响应字段表**
4. **典型交互流程**
5. **错误码与边界**
