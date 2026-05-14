# 11 · 调用日志（DemuxAI Logs）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/logs` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/LogQueryView.vue` |
| 抽屉 | `src/features/demuxai/components/LogDetailDrawer.vue` |
| Port | `src/features/demuxai/services/ports/demuxaiLogsPort.ts` + 三个字典源 Port |

## 业务定义

> 调用日志属于**数据面**，大概率独立微服务（ClickHouse / ES 网关），HttpAdapter 对应独立 baseUrl。
>
> 设计要点：
>
> - `uid` 是单调递增的 snowflake，可作为"上一页 / 下一页" cursor；
> - `createAt` 是调用发生时间 UTC ISO8601（原命名 `occurredAtUtc` 已简化）；
> - **租户身份用 `account: { uid, iamId }` 嵌套对象**表达：`uid` 是主账户（扣费主体 / billing 主键），`iamId` 是发起调用的 IAM 子账户。一次拿到关联关系，UI 展示和后端 join 都更方便，替代原先并列的 `accountUid` + `iamUserUid`；
> - **`providerId` 是模型渠道的 int 主键**（= `Provider.id`，非 string UID）：日志是高吞吐写入数据，int FK 索引比 string UID 紧凑得多，join 性能也更好；前端展示渠道名通过 `provider.id → name` 反查；
> - **`modelName`** 是用户请求体里的 `model` 字段值（如 `'demux-gpt-4o'`），快照写入；上游真实 model 名不再单独记录（之前的 `providerModelId` 字段已删除）—— 知道命中哪个渠道 + 用户请求 `modelName` 足以定位调度路径，多记一份是冗余；
> - **`convId`** 是会话 ID：多轮对话同一 `convId`，便于按对话排障 / 复盘 / IAM 反查；
> - **计费快照内聚在 `cost` 对象**：`multiplierSnapshot`（倍率快照）+ `tierSnapshot`（LV 快照）已下沉到 `cost` 内 —— 它们是计费上下文，跟 `cost` 强相关（费用 = 用量 × 单价 × multiplier × tier 折扣），放顶层是错位；
> - **`per_token` 的 `usage` / `cost` 按 input / output 父子集分组（嵌套结构）**：
>
>   ```
>   usage = {
>     totalTokens,
>     input:  { tokens, cachedReadTokens, cachedWrite5mTokens, cachedWrite1hTokens, audioTokens },
>     output: { tokens, reasoningTokens, audioTokens },
>   }
>   cost = {
>     input:  { perMToken, amount,
>               cachedRead:    { perMToken, amount },
>               cachedWrite5m: { perMToken, amount },
>               cachedWrite1h: { perMToken, amount },
>               audio:         { perMToken, amount } },
>     output: { perMToken, amount,
>               reasoning: { perMToken, amount },
>               audio:     { perMToken, amount } },
>     multiplierSnapshot, tierSnapshot, total,
>   }
>   ```
>
>   每个维度的 `{ perMToken, amount }` **配对内联**（可复用类型 `DimensionCost`），看一眼就知道
>   "这个维度用了多少 / 单价多少 / 扣了多少"，无需在两份扁平字典里交叉查找；
> - **字段语义跟厂家对齐**（与 OpenAI Responses API / Anthropic Messages API / Google Gemini `usageMetadata` camelCase 化）：
>   - `usage.input.tokens` ↔ OpenAI `input_tokens` / Anthropic `input_tokens` / Gemini `prompt_token_count`
>   - `usage.output.tokens` ↔ OpenAI `output_tokens` / Anthropic `output_tokens` / Gemini `candidates_token_count`
>   - `usage.input.cachedReadTokens` ↔ OpenAI `input_tokens_details.cached_tokens` / Anthropic `cache_read_input_tokens` / Gemini `cached_content_token_count`
>   - `usage.input.cachedWrite{5m,1h}Tokens` ↔ Anthropic `cache_creation.ephemeral_{5m,1h}_input_tokens`
>   - `usage.output.reasoningTokens` ↔ OpenAI `output_tokens_details.reasoning_tokens` / Gemini `thoughts_token_count`
>   - `usage.input.audioTokens` ↔ OpenAI `prompt_tokens_details.audio_tokens`（GPT-4o-audio）
>   - `usage.output.audioTokens` ↔ OpenAI `completion_tokens_details.audio_tokens`（GPT-4o-audio）
> - **Anthropic cache TTL 5m / 1h 分单价**：默认 5min TTL，也支持显式 1h TTL；写入单价完全不同（**1h 比 5m 贵约 60%**）。两者的用量与单价都分两个字段记录，按统一单价会少算 1h cache 用户的账单；
> - **音频 token 用于多模态**：GPT-4o-audio / Realtime API 把音频拆成 token，单价远贵于文本（GPT-4o-audio audio token ≈ text × 16）。纯文本模型写 `0`；
> - **`cost` 必须自我描述**：所有维度（父集 input/output 与子维度 cachedRead/audio/...）的 `{ perMToken, amount }` 都**必填**、未触发的维度写 `0` 而不省略 —— 事后看历史 log 能直接读出"调用那一刻完整定价是什么、各维度产生了多少费用"，不必反查 Pricing 表；
> - **单价单位选 元 / 1M tokens**（`perMToken`）跟 OpenAI / Anthropic / Google 等厂家定价页对齐，减少对账换算；
> - **扣费公式（per 维度）**：
>
>   ```
>   cost.input.amount             = usage.input.tokens             / 1_000_000 × cost.input.perMToken             × multiplierSnapshot
>   cost.input.cachedRead.amount  = usage.input.cachedReadTokens   / 1_000_000 × cost.input.cachedRead.perMToken  × multiplierSnapshot
>   …其它子维度同理；cost.total = 所有 amount 之和
>   ```
>
> - 价格 / 倍率 / LV 是**快照**字段，事后改定价不影响历史账单；
> - **`billingType` 是判别字段**（discriminated union），决定同一条日志里 `usage` 与 `cost` 的形状。**所有 `billingType` 的 `cost` 都内含调用时单价快照** —— 即便 `per_image` / `per_video` 是按 tier 分级单价的，也只快照"命中那条 tier 的单价"（具体哪档由 `usage.tier` 定位，不必复制整个 tiers 数组）：
>   - `per_token`        → `cost = { input: {...}, output: {...}, multiplier/tier, total }`（嵌套结构，见上）；
>   - `per_call`         → `cost = { pricePerCall, cachedPricePerCall, multiplier/tier, total }`；
>   - `per_image`        → `cost = { pricePerImage, multiplier/tier, total }`；
>   - `per_video`        → `cost = { pricePerSecond, multiplier/tier, total }`；
>   - `per_audio_minute` → `cost = { pricePerMinute, multiplier/tier, total }`；
>   - `per_character`    → `cost = { pricePerKChar, multiplier/tier, total }`；
>   - 单价命名与 Pricing 文档**完全一致**，对账时不用脑内 mapping；
> - **数据库存储建议**：`usage` 与 `cost` 都按 JSON / JSONB 字段落库（PostgreSQL JSONB / ClickHouse JSON / ES nested），方便不同 billingType 共表；用于聚合的 `cost.total` 单独冗余一列做索引；
> - **`tokenLatency` 语义按 `streamed` 切换**（单位 ms）：
>   - `streamed: true`  → 首字延迟（TTFT，到首 token 的耗时），反映上游响应健康度；
>   - `streamed: false` → 端到端总耗时（请求发出 → 响应完整返回），非流式调用没有"首字"概念，这是唯一有意义的延迟维度；
>   - 失败请求一律 `null`；
>   - **统计聚合（`stats.avgTokenLatency` / `p95TokenLatency`）只取 `streamed && success` 样本** —— 两种语义混合算平均没意义；
> - **`success: boolean` 表达成败二元**：
>   - `true` → `error` 必为 `null`，不要读取；
>   - `false` → 必有 `error: { code, message, httpStatus }`，失败的细分类（timeout / rate_limited / cancelled / 上游 5xx 等）全部通过 `error.code` 区分；
>   - 不再单列 `status` 枚举 —— 它混合了"是否成功"和"失败原因"两个维度，不纯粹；
> - `error.httpStatus` 是上游 / 网关返回的 HTTP 状态码（无上游响应时填 `0`，比如 cancelled）；成功调用默认 200 无需单列，仅出错时才有诊断价值（502 / 504 / 429 等）；
> - **不存 prompt / completion 原文**（隐私 + 体积），调试用另一套抓样系统。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表（带 cursor 友好的 uid 排序） | `list(input)` | GET | `/api/demuxai/logs` |
| 统计（与 list 同 filter） | `stats(filter)` | GET | `/api/demuxai/logs/stats` |
| Model 字典 | `DemuxaiModelPort.list` | GET | `/api/admin/demuxai/models` |
| Provider 字典 | `DemuxaiProviderPort.list` | GET | `/api/admin/demuxai/providers` |
| Account 字典 | `AccountAdminPort.listAccounts` | GET | `/accounts` |

## 请求 / 响应

### `GET /api/demuxai/logs`

参数（**必传时间范围且最长 7 天**）：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1，BFF 内部基于 uid cursor，但对前端用 page 暴露 |
| `pageSize` | int | 是 | ≤ 100 |
| `fromUtc` | ISO8601 | **是** | 必填，BFF 在缺省时返回 400 |
| `toUtc` | ISO8601 | **是** | 同上 |
| `accountUid` | string | 否 | 精确匹配主账户（= `account.uid`） |
| `iamId` | string | 否 | 精确匹配 IAM 子账户（= `account.iamId`） |
| `convId` | string | 否 | 精确匹配会话 ID，常用于按对话排障 |
| `modelName` | string | 否 | 模糊匹配模型名 |
| `providerId` | int | 否 | 精确匹配渠道 int 主键（= `Provider.id`） |
| `apiType` | enum | 否 | 见 `apiTypeValues` |
| `errorOnly` | boolean | 否 | 仅看失败调用（`success === false`） |
| `errorCode` | string | 否 | 精确过滤 `error.code`，仅对失败调用生效；常配合 `errorOnly = true` 用于排障（如 `upstream_5xx` / `rate_limited`） |

响应（按 `billingType` 给出 4 种代表样本：text-LLM 成功 / text-LLM 异常 / 图像 / 视频）：

```json
{
  "items": [
    {
      "uid": "LG-1700000000001",
      "createAt": "2025-09-12T11:00:01Z",
      "account": { "uid": "100000001", "iamId": "200000050" },
      "convId": "CV-050-a3",
      "modelName": "demux-gpt-4o",
      "providerId": 1001,
      "apiType": "openai",
      "billingType": "per_token",
      "usage": {
        "totalTokens": 787,
        "input": {
          "tokens": 482,
          "cachedReadTokens": 120,
          "cachedWrite5mTokens": 0,
          "cachedWrite1hTokens": 0,
          "audioTokens": 0
        },
        "output": {
          "tokens": 305,
          "reasoningTokens": 0,
          "audioTokens": 0
        }
      },
      "cost": {
        "input": {
          "perMToken": 25,
          "amount": 0.01205,
          "cachedRead":    { "perMToken": 12.5,  "amount": 0.0015 },
          "cachedWrite5m": { "perMToken": 31.25, "amount": 0 },
          "cachedWrite1h": { "perMToken": 50,    "amount": 0 },
          "audio":         { "perMToken": 0,     "amount": 0 }
        },
        "output": {
          "perMToken": 75,
          "amount": 0.02288,
          "reasoning": { "perMToken": 0, "amount": 0 },
          "audio":     { "perMToken": 0, "amount": 0 }
        },
        "multiplierSnapshot": 1.2,
        "tierSnapshot": 3,
        "total": 0.03523
      },
      "tokenLatency": 320,
      "success": true,
      "error": null,
      "requestIp": "203.0.113.7",
      "streamed": true
    },
    {
      "uid": "LG-1700000000002",
      "createAt": "2025-09-12T11:00:03Z",
      "account": { "uid": "100000001", "iamId": "200000050" },
      "convId": "CV-050-a3",
      "modelName": "demux-gpt-4o",
      "providerId": 1001,
      "apiType": "openai",
      "billingType": "per_token",
      "usage": {
        "totalTokens": 312,
        "input": {
          "tokens": 312,
          "cachedReadTokens": 0,
          "cachedWrite5mTokens": 0,
          "cachedWrite1hTokens": 0,
          "audioTokens": 0
        },
        "output": {
          "tokens": 0,
          "reasoningTokens": 0,
          "audioTokens": 0
        }
      },
      "cost": {
        "input": {
          "perMToken": 25,
          "amount": 0.0078,
          "cachedRead":    { "perMToken": 12.5,  "amount": 0 },
          "cachedWrite5m": { "perMToken": 31.25, "amount": 0 },
          "cachedWrite1h": { "perMToken": 50,    "amount": 0 },
          "audio":         { "perMToken": 0,     "amount": 0 }
        },
        "output": {
          "perMToken": 75,
          "amount": 0,
          "reasoning": { "perMToken": 0, "amount": 0 },
          "audio":     { "perMToken": 0, "amount": 0 }
        },
        "multiplierSnapshot": 1.2,
        "tierSnapshot": 3,
        "total": 0.0078
      },
      "tokenLatency": null,
      "success": false,
      "error": {
        "code": "upstream_5xx",
        "message": "upstream returned 502 Bad Gateway",
        "httpStatus": 502
      },
      "requestIp": "203.0.113.8",
      "streamed": true
    },
    {
      "uid": "LG-1700000000003",
      "createAt": "2025-09-12T11:00:05Z",
      "account": { "uid": "100000002", "iamId": "700000010" },
      "convId": "CV-010-b2",
      "modelName": "demux-dalle-3",
      "providerId": 1009,
      "apiType": "openai",
      "billingType": "per_image",
      "usage": {
        "tier": { "size": "1024x1024", "quality": "hd" },
        "count": 4
      },
      "cost": {
        "pricePerImage": 0.42,
        "multiplierSnapshot": 1.0,
        "tierSnapshot": 3,
        "total": 1.68
      },
      "tokenLatency": 4200,
      "success": true,
      "error": null,
      "requestIp": "203.0.113.10",
      "streamed": false
    },
    {
      "uid": "LG-1700000000004",
      "createAt": "2025-09-12T11:00:08Z",
      "account": { "uid": "100000003", "iamId": "700000020" },
      "convId": "CV-020-c1",
      "modelName": "demux-kling-v2",
      "providerId": 1010,
      "apiType": "self_hosted_openai_compat",
      "billingType": "per_video",
      "usage": {
        "tier": { "resolution": "1080p" },
        "seconds": 8
      },
      "cost": {
        "pricePerSecond": 1.2,
        "multiplierSnapshot": 1.0,
        "tierSnapshot": 4,
        "total": 9.6
      },
      "tokenLatency": 18500,
      "success": true,
      "error": null,
      "requestIp": "203.0.113.20",
      "streamed": false
    }
  ],
  "total": 12450
}
```

字段说明（`LogEntry`，详见 `src/features/demuxai/model/log.types.ts`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | snowflake，按 ID 即按时间排序。 |
| `createAt` | ISO8601 string | 调用发生时间 UTC。原命名 `occurredAtUtc`，简化为 `createAt`。 |
| `account` | object | 租户身份聚合对象：`{ uid: string, iamId: string }`。`uid` = 主账户 UID（扣费主体 / billing 主键），`iamId` = 发起调用的 IAM 子账户 UID。一次拿到关联关系，UI 展示和后端 join 一步到位。 |
| `convId` | string | 多轮对话会话 ID。同一对话的多次调用共享同一 `convId`，便于按对话维度排障 / 复盘。 |
| `modelName` | string | 用户请求体里的 `model` 字段值（如 `'demux-gpt-4o'`），快照写入。上游真实 model 名不再单独记录。 |
| `providerId` | int | 命中渠道的**数据库 int 主键**（= `Provider.id`），非 string UID。日志量大，int FK 索引更紧凑。 |
| `apiType` | enum | 该次调用走的协议。 |
| `billingType` | enum | 计费类型快照（判别字段）。取值见 [`10-demuxai-pricing.md`](./10-demuxai-pricing.md) 的 `BillingType`。 |
| `usage` | object | **形状随 `billingType` 变化**，详见下方"`usage` / `cost` 形状对照表"。`per_token` 用量字段与 OpenAI Responses API / Anthropic Messages API 对齐。 |
| `cost` | object | 扣费快照（元）。**形状随 `billingType` 变化**。`per_token` 按 `input` / `output` 父子集嵌套，每个维度包含一对 `{ perMToken, amount }`（可复用类型 `DimensionCost`），父集 input/output 自身有 `{ perMToken, amount }` 表示主输入/主输出，子维度（`cachedRead` / `cachedWrite5m` / `cachedWrite1h` / `audio` / `reasoning`）作为嵌套 `DimensionCost` —— 未触发为 `0` 不省略；其它 `billingType` 必含对应单价快照 + `multiplierSnapshot` + `tierSnapshot` + `total`。`cost.total` 用于聚合，建议单列冗余落库以便走索引。 |
| `tokenLatency` | int \| null | 单位 ms。语义**随 `streamed` 切换**：`streamed: true` → 首字延迟（TTFT）；`streamed: false` → 端到端总耗时；失败请求一律 `null`。统计聚合（avg / p95）只取 `streamed && success` 样本，混合算平均没意义。 |
| `success` | boolean | 调用是否成功（二元）。`true` 时 `error` 必为 `null`；`false` 时必有 `error`，失败的细分类全部从 `error.code` 读取。 |
| `error` | object \| null | `success === true` 时为 `null`；否则 `{ code, message, httpStatus }`。`code` 是上游 / 网关错误码（如 `upstream_5xx` / `upstream_timeout` / `rate_limited` / `context_too_long` / `cancelled`），`message` 是上游原文摘要（≤ 200 字符），`httpStatus` 是上游或网关返回的 HTTP 状态码（无上游响应时填 `0`）。成功调用默认 200 无需单列。 |
| `requestIp` | string \| null | 用于风控复盘。 |
| `streamed` | boolean | 是否流式调用。决定 `tokenLatency` 的语义维度。 |

#### `usage` / `cost` 形状对照表

| `billingType` | `usage` 形状 | `cost` 形状 |
| --- | --- | --- |
| `per_token` | `{ totalTokens, input: { tokens, cachedReadTokens, cachedWrite5mTokens, cachedWrite1hTokens, audioTokens }, output: { tokens, reasoningTokens, audioTokens } }` （全必填，未触发为 0） | `{ input: { perMToken, amount, cachedRead, cachedWrite5m, cachedWrite1h, audio }, output: { perMToken, amount, reasoning, audio }, multiplierSnapshot, tierSnapshot, total }` —— 其中 input/output 的子维度（`cachedRead` 等）类型是 `DimensionCost = { perMToken, amount }`；全必填、未触发为 0 |
| `per_call` | `{ calls }` | `{ pricePerCall, cachedPricePerCall, multiplierSnapshot, tierSnapshot, total }` |
| `per_image` | `{ tier: { size, quality }, count }` | `{ pricePerImage, multiplierSnapshot, tierSnapshot, total }` |
| `per_video` | `{ tier: { resolution }, seconds }` | `{ pricePerSecond, multiplierSnapshot, tierSnapshot, total }` |
| `per_audio_minute` | `{ minutes }` | `{ pricePerMinute, multiplierSnapshot, tierSnapshot, total }` |
| `per_character` | `{ characters }` | `{ pricePerKChar, multiplierSnapshot, tierSnapshot, total }` |

#### 各 `billingType` 的扣费公式（`m = multiplierSnapshot × tierMultipliers[tierSnapshot]`）

```
per_token        总扣费 = (
    usage.input.tokens                × cost.input.perMToken
  + usage.input.cachedReadTokens      × cost.input.cachedRead.perMToken
  + usage.input.cachedWrite5mTokens   × cost.input.cachedWrite5m.perMToken
  + usage.input.cachedWrite1hTokens   × cost.input.cachedWrite1h.perMToken
  + usage.input.audioTokens           × cost.input.audio.perMToken
  + usage.output.tokens               × cost.output.perMToken
  + usage.output.reasoningTokens      × cost.output.reasoning.perMToken
  + usage.output.audioTokens          × cost.output.audio.perMToken
) / 1_000_000 × m

每个维度的 amount 单独落库：cost.<path>.amount = usage.<path>Tokens / 1_000_000 × cost.<path>.perMToken × m
cost.total = 所有 amount 之和

per_call         total = (calls - cachedCalls) × pricePerCall × m
                       + cachedCalls × cachedPricePerCall × m
per_image        total = count   × pricePerImage  × m
per_video        total = seconds × pricePerSecond × m
per_audio_minute total = minutes × pricePerMinute × m
per_character    total = characters / 1000 × pricePerKChar × m
```

> **`per_image` / `per_video` 的单价快照来自命中 tier**：调用时根据 `usage.tier.{size,quality}`
> (或 `usage.tier.resolution`) 在 Pricing 表的 `tiers[]` 中**唯一命中一条**，把那条的 `pricePerImage`
> / `pricePerSecond` 复印到 `cost`。usage 里已经记了"命中哪档"，cost 里只需记单价本身，无需复制
> 整个 tiers 数组 —— 避免冗余且不影响可追溯性。

> **说明**：
> - **嵌套设计动机**：`per_token` 的 `usage` / `cost` 都按 **input / output 父子集**分组，子维度（cache / audio / reasoning）作为嵌套对象自然归属父集 —— 跟"cached read 是 input 子集"这种业务语义一致；
> - **`DimensionCost = { perMToken, amount }` 是可复用子类型**：每个维度的"单价快照 + 实际扣费金额"配对内联，前端 / BI 不用在两份扁平字典里交叉查找。父集 input / output 自身也是 `{ perMToken, amount, …子维度 }` 形态；
> - **字段语义跟厂家对齐**（OpenAI Responses API、Anthropic Messages API、Google Gemini `usageMetadata`），见上方"业务定义"段的字段映射；
> - **Anthropic cache TTL 双单价**：5m TTL（默认）与 1h TTL 写入单价差 ~60%；用量与单价都分开记录；
> - **音频 token（GPT-4o-audio / Realtime）单价远贵于文本**，必须独立记录单价快照与扣费金额，否则按文本单价算账会严重少算（audio token ≈ text × 16）；
> - **`cost` 字段为何看似比 `usage` 多？** 每个 usage 维度都对应 `DimensionCost = { perMToken, amount }` 一对快照：
>   1. **单价快照**（`perMToken`）—— 不可推导，必须钉死。Pricing 表事后修改不能影响历史 log；
>   2. **金额拆分**（`amount`）—— 数学上可由"用量 × 单价 × multiplier"重算，但**坚持落库**有四个理由：①审计自我描述（前端 / BI / 客服 / 对账直接读字段，不内嵌计算器）；②防浮点重算 rounding 偏差，保证账实一致；③避免每个消费者各写一份公式 = 错一次到处错；④未来公式演进（阶梯折扣 / 补贴 / 税收）时，历史账单**不会被新公式追溯改写**；
>   3. 外加 `multiplierSnapshot` / `tierSnapshot` 两个**计费上下文**（解释"为什么扣这么多"，跟 token 用量无关，所以 `usage` 里没有对应物）+ 一个 `total` 合计；
>
>   一句话：`usage` 是**事实**（用了多少），`cost` 是**完整账单复印件**（单价 / 各维度小计 / 折扣 / 总额），账单天然比用量记录信息密度高。

#### 各家厂家 usage 字段映射表

> 这张表说明上游 API 字段如何映射到我们的统一 schema。BFF 拉取上游响应时按这张表 normalize。

| 我方字段 | OpenAI Responses API | OpenAI Chat Completions (legacy) | Anthropic Messages API | Google Gemini |
| --- | --- | --- | --- | --- |
| `usage.input.tokens` | `input_tokens` | `prompt_tokens` | `input_tokens` | `prompt_token_count` |
| `usage.output.tokens` | `output_tokens` | `completion_tokens` | `output_tokens` | `candidates_token_count` |
| `usage.totalTokens` | `total_tokens` | `total_tokens` | （自行求和） | `total_token_count` |
| `usage.input.cachedReadTokens` | `input_tokens_details.cached_tokens` | `prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` | `cached_content_token_count` |
| `usage.input.cachedWrite5mTokens` | — | — | `cache_creation.ephemeral_5m_input_tokens` | — |
| `usage.input.cachedWrite1hTokens` | — | — | `cache_creation.ephemeral_1h_input_tokens` | — |
| `usage.output.reasoningTokens` | `output_tokens_details.reasoning_tokens` | `completion_tokens_details.reasoning_tokens` | （extended thinking 含在 output 内，无独立字段，BFF 需自行估算） | `thoughts_token_count` |
| `usage.input.audioTokens` | （Responses API 暂未支持音频） | `prompt_tokens_details.audio_tokens` | — | （多模态归在 prompt 内） |
| `usage.output.audioTokens` | — | `completion_tokens_details.audio_tokens` | — | — |

> **未覆盖但可暂缓的字段**：
> - OpenAI `completion_tokens_details.accepted_prediction_tokens` / `rejected_prediction_tokens`
>   （Predicted Outputs，实际应用极少，且 Responses API 已淘汰）—— 暂不映射；
> - Gemini `tool_use_prompt_token_count`（Function Calling / Code Execution 内部 token，按 input 同价计费）
>   —— BFF 端合并进 `inputTokens` 即可，不独立暴露；
> - Anthropic `server_tool_use.web_search_requests`（按"次数"独立计费）—— 不属于 token 维度，
>   建议未来作为独立的 `per_call` 子 LogEntry 记录，而非混在 `per_token` 里。

#### `error.code` 常见取值

> 字段本身是开放 `string` —— 上游错误码千差万别，BFF 端不做白名单过滤；下面列前端 UI 已知的典型值供运维定位。

| `error.code` | 典型 `httpStatus` | 含义 |
| --- | --- | --- |
| `upstream_5xx` | 502 / 503 | 上游模型服务返回 5xx |
| `upstream_4xx` | 400 / 422 | 上游拒绝请求（参数 / 模型未授权等） |
| `upstream_timeout` | 504 | 上游响应超时 |
| `rate_limited` | 429 | 被上游 / 网关限流 |
| `context_too_long` | 400 | 上下文超出模型上限 |
| `cancelled` | 0 | 客户端主动断开（无上游响应） |
| `auth_failed` | 401 / 403 | 鉴权失败（凭据失效 / IAM 无权限） |
| `unknown` | 0 / 500 | 未分类错误 |

TypeScript 形状示意（与 `Pricing` 一致的 discriminated union）：

```ts
type SnapshotCommon = {
  multiplierSnapshot: number;
  tierSnapshot: number;
  total: number;
};

type PerTokenUsage = {
  totalTokens: number;                  // 冗余总和（= input.tokens + output.tokens），方便聚合
  input: {
    tokens: number;                     // = OpenAI input_tokens / Anthropic input_tokens / Gemini prompt_token_count
    cachedReadTokens: number;           // OpenAI cached_tokens / Anthropic cache_read_input_tokens / Gemini cached_content_token_count
    cachedWrite5mTokens: number;        // Anthropic cache_creation.ephemeral_5m_input_tokens（默认 TTL）
    cachedWrite1hTokens: number;        // Anthropic cache_creation.ephemeral_1h_input_tokens（长 TTL，比 5m 贵 ~60%）
    audioTokens: number;                // GPT-4o-audio：prompt_tokens_details.audio_tokens
  };
  output: {
    tokens: number;                     // = OpenAI output_tokens / Anthropic output_tokens / Gemini candidates_token_count
    reasoningTokens: number;            // OpenAI reasoning_tokens / Gemini thoughts_token_count
    audioTokens: number;                // GPT-4o-audio：completion_tokens_details.audio_tokens
  };
};

/** 可复用：每个维度的"单价快照 + 实际扣费"配对。 */
type DimensionCost = {
  perMToken: number;                    // 调用时定价快照（元 / 1M tokens；未启用为 0）
  amount: number;                       // 该维度实际扣费金额（元；未触发为 0）
};

type PerTokenCost = {
  input: {
    perMToken: number;                  // 主输入单价（元 / 1M）
    amount: number;                     // 主输入扣费金额
    cachedRead: DimensionCost;          // cache 读（约 base × 0.1~0.5）
    cachedWrite5m: DimensionCost;       // 5m TTL cache 写（约 base × 1.25）
    cachedWrite1h: DimensionCost;       // 1h TTL cache 写（约 base × 2.0）
    audio: DimensionCost;               // 输入音频（GPT-4o-audio，约 base × 16）
  };
  output: {
    perMToken: number;                  // 主输出单价
    amount: number;                     // 主输出扣费金额
    reasoning: DimensionCost;           // o1 / extended thinking / Gemini thoughts
    audio: DimensionCost;               // 输出音频（GPT-4o-audio，约 base × 8）
  };
} & SnapshotCommon;

type LogEntry = LogEntryBase & (
  | { billingType: 'per_token';
      usage: PerTokenUsage;
      cost:  PerTokenCost }
  | { billingType: 'per_call';
      usage: { calls: number };
      cost: { pricePerCall: number; cachedPricePerCall: number } & SnapshotCommon }
  | { billingType: 'per_image';
      usage: { tier: { size: string; quality: string }; count: number };
      cost: { pricePerImage: number } & SnapshotCommon }
  | { billingType: 'per_video';
      usage: { tier: { resolution: string }; seconds: number };
      cost: { pricePerSecond: number } & SnapshotCommon }
  | { billingType: 'per_audio_minute';
      usage: { minutes: number };
      cost: { pricePerMinute: number } & SnapshotCommon }
  | { billingType: 'per_character';
      usage: { characters: number };
      cost: { pricePerKChar: number } & SnapshotCommon }
);
```

### `GET /api/demuxai/logs/stats`

见 [`07-demuxai-overview.md`](./07-demuxai-overview.md)。本页同样调用了 `stats`（行内/抽屉不调，但 Overview 页与本页共享 filter 形态）。

## 已删除模型的 UI 表现

如果 `modelName` 在 Models 表查不到（前端 Mock 走硬删；BFF 端走软删但仍能 join 到 displayName）：

- 前端在表格"模型"列展示 `<已删除>` tag + 历史的 `modelName`。
- 详情抽屉一样兼容（用 `modelDisplayName(row.modelName) ?? null`）。

> 强烈建议 BFF 端实现 `Model` 软删（保留 tombstone），让 `displayName` 可 join；否则历史日志会出现一堆"未知模型"。

## 已删除渠道的 UI 表现

类似地，如果 `providerId` 在 `Provider` 表查不到（渠道硬删 / 数据漂移）：

- 前端"模型渠道"列回退展示 `#<providerId>`（如 `#1007`）。
- 详情抽屉一样回退到 `#<providerId>`。

> 建议 BFF 端 Provider 也走软删；调用日志 → Provider 反查就稳定了。

## 交互流程

```
onMounted → loadDeps()  // models / providers / accounts 字典
            fetchData()  // list(...)

时间窗口 / 任意过滤项变化 → page=1 → fetchData()
点击行 View 图标 → LogDetailDrawer(detailLog)
仅看异常 checkbox → filter.errorOnly = true → list 仅返回 success=false
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | 缺时间范围 / 时间跨度 > 7 天 / `pageSize > 100` |
| 403 | `forbidden` | 非 Admin |
| 504 | `timeout` | 大跨度查询超时 |
| 503 | `dependency_down` | 日志网关挂掉（应与控制面解耦，不影响其它页） |
