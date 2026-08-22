# Meeko 管理后台 · API 对接文档

> 本目录按「页面」组织，每个 `.md` 文件聚焦一个具体的视图（路由）。
>
> 阅读顺序建议：先看 [`00-conventions.md`](./00-conventions.md) 了解通用约定（统一返回体、分页、鉴权、错误码），再按需查阅各页面文档。

## 通用基础

| 主题 | 文件 |
| --- | --- |
| 通用约定（AppResult / 分页 / 鉴权 / 错误码 / Mock 开关） | [`00-conventions.md`](./00-conventions.md) |

## 页面索引

| # | 页面（路由） | 角色限制 | 文件 |
| --- | --- | --- | --- |
| 01 | 登录 `/login` | 公开 | [`01-login.md`](./01-login.md) |
| 02 | 账户列表 `/accounts` | 已登录 | [`02-account-list.md`](./02-account-list.md) |
| 03 | 账户详情 `/accounts/:uid` | 已登录 | [`03-account-detail.md`](./03-account-detail.md) |
| 04 | 充值记录 `/billing/recharges` | 已登录 | [`04-billing-recharges.md`](./04-billing-recharges.md) |
| 05 | 账单流水 `/billing/bills` | 已登录 | [`05-billing-bills.md`](./05-billing-bills.md) |
| 06 | 充值渠道 `/billing/channels` | Admin | [`06-billing-channels.md`](./06-billing-channels.md) |
| 07 | DemuxAI 概览 `/demux/overview` | Admin | [`07-demuxai-overview.md`](./07-demuxai-overview.md) |
| 08 | 供应商组 `/demux/providers` | Admin | [`08-demuxai-providers.md`](./08-demuxai-providers.md) |
| 09 | 模型别名与元数据 `/demux/models`（重定向至 providers） | Admin | [`09-demuxai-models.md`](./09-demuxai-models.md) |
| 10 | 模型定价 `/demux/pricing` | Admin | [`10-demuxai-pricing.md`](./10-demuxai-pricing.md) |
| 11 | 调用日志 `/demux/logs` | Admin | [`11-demuxai-logs.md`](./11-demuxai-logs.md) |
| — | 激活码 `/demux/redemption` | Admin | 见 `DemuxaiRedemptionPort` · `/demux/api/redemption`（待补专篇） |
| 12 | 邮件渠道 `/notices/email/channels` | Admin | [`12-notices-email-channels.md`](./12-notices-email-channels.md) |
| 13 | 邮件模板列表 `/notices/email/templates` | Admin | [`13-notices-email-templates.md`](./13-notices-email-templates.md) |
| 14 | 编辑邮件模板 `/notices/email/templates/:code/:locale` | Admin | [`14-notices-email-template-edit.md`](./14-notices-email-template-edit.md) |
| 15 | 通知调试 `/notices/debug` | Admin | [`15-notices-debug.md`](./15-notices-debug.md) |
| 16 | 平台令牌：下发抵扣券 / 查用户 / 查 Demux 用量 | Admin / API Key | [`16-ops-voucher-issue-and-usage.md`](./16-ops-voucher-issue-and-usage.md) |

## BFF 域路由前缀（默认）

| 业务域 | 前缀 | 说明 |
| --- | --- | --- |
| 账户 / IAM 后台 | `/api/admin/accounts`、`/api/admin/iam/users` | BFF 聚合，底层调 Keystone |
| 计费 | `/api/billing` | 钱包 / 充值；账单流水见 `/api/admin/billing/bills` |
| 充值渠道（平台配置） | `/api/admin/billing/channels` | 仅 Admin |
| DemuxAI 控制面 | `/demux/api/admin/*` | 供应商组目录、模型路由、Vendor、ModelMeta、Pricing |
| DemuxAI 激活码 | `/demux/api/redemption` | CDK 批量生成 / 列表 / 删除 |
| DemuxAI 数据面（日志） | `/demux/api/admin/logs` | 用量查询 + 日聚合 stats（KPI 扩展中） |
| 通知后台 | `/api/admin/notice/templates/email`、`/api/admin/notice/channels/smtp` | 仅 Admin |
| 通知端点（含 OTP） | `/api/notifications`、`/api/notifications/otp` | 业务端通用 |

> 真实路径以 BFF 实际暴露为准；前端通过 `VITE_API_BASE` 拼接绝对地址。

## 一份请求示例

```http
GET /api/admin/accounts?page=1&pageSize=20&type=organization HTTP/1.1
Host: api.meeko.example
Authorization: Bearer <accessToken>
Accept: application/json

```

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
  "total": 1
}

```

失败统一返回 RFC 7807 ProblemDetails，前端会映射为 `AppResult` 失败分支，详见 [`00-conventions.md`](./00-conventions.md)。

## v2 字段族封装原则

本目录在 2026-05 完成一次系统性重构，核心约束写在 [`00-conventions.md` § 10](./00-conventions.md)：

- **对象优于扁平**：同生同灭 / 状态扩展 / 配对单价金额 / 角色族 / 判别联合 字段必须封装为嵌套子对象（如 `owner` / `failure` / `reversal` / `source` / `connection` / `lastTest`）；
- **`AdminCommandResult` 双轨制已退役**：成功走 HTTP 2xx + 资源体，失败一律 RFC 7807 ProblemDetails；
- **操作类接口的失败统一为** `ok: false, error: { code, message } | null`（与 `LogEntry.error` 一致）；
- **命名统一**：时间一律 `*AtUtc`、IAM 主键一律 `iamUserUid`、字段一律 camelCase、枚举一律字符串；
- **列表 vs 详情投影分层**：含子树的资源列表只返概要，详情才完整下发。
