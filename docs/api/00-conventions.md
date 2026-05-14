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

请求头：

```
Authorization: Bearer <accessToken>
```

- `accessToken` / `refreshToken` 在 `auth` store + `localStorage` 持久化（key：`meeko.admin.session.v1`）。
- 角色由 IAM 用户决定：`Admin` / `Owner` / `Member`。
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

---

后续每个页面文档遵循同一目录：

1. **页面信息**（路由 / 角色 / 视图文件）
2. **依赖的接口清单**（列出 Port 方法 → REST 端点）
3. **请求 / 响应字段表**
4. **典型交互流程**
5. **错误码与边界**
