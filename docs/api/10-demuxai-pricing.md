# 10 · 模型定价（DemuxAI Pricing）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demuxai/pricing` |
| 角色 | **Admin** |
| 视图 | `src/features/demuxai/views/PricingView.vue`（含「模型定价」与「未配置」两个 Tab） |
| 对话框 | `src/features/demuxai/components/PricingEditDialog.vue` |
| Port | `src/features/demuxai/services/ports/demuxaiPricingPort.ts` + `DemuxaiModelPort.list`（取未配置模型列表） |

## 业务定义

> 模型定价与 `Model` 是 **1..1** —— 每个 `modelId` 一条 Pricing 记录。删除 Model 必须级联删除 Pricing。
>
> **数据形状（discriminated union）**：顶层 `billingType` 作为判别字段，`pricing` 是与之配对的嵌套对象，**形状随 `billingType` 变化**。这样：
> - 没有「5 个 null 占 4 个」的扁平反范式；
> - 每种类型清晰说出自己需要哪些价格分项（如 `per_token` 天然分 input / output / cachedInput）；
> - 新增计费类型只是加一个 `billingType` 枚举值 + 新的 `pricing` 形状，外层结构不动。
>
> **支持的 `billingType` 一览**（适用场景见下面「`billingType` 与 `pricing` 形状」）：
>
> | 类型 | 典型模型 | 计费维度 |
> | --- | --- | --- |
> | `per_token` | GPT / Claude / Gemini / Qwen 等文本 LLM；embedding；rerank | 输入/输出 token 数；可分缓存读/写、推理 token |
> | `per_call` | 单次平价（function call、moderation、轻量分类等） | 次数 |
> | `per_image` | DALL-E / SD / Midjourney 文生图 | 张数 × **(尺寸 × 质量)** 档 |
> | `per_video` | Sora / Gen-3 / Kling 文生视频 | 输出秒数 × **分辨率** 档 |
> | `per_audio_minute` | Whisper / 转写 / 实时 ASR | 音频时长（分钟） |
> | `per_character` | TTS / ElevenLabs / 阿里 CosyVoice 等合成语音 | 合成字符数（千字符） |
>
> 关键概念：
>
> - **金额单位**：与钱包同币种、同尺度（默认元）；不同 `billingType` 用各自计量单位。
> - **`multiplier`**：全局倍率（如统一调价 1.2x）。
> - **`tierMultipliers`**：按用户 LV 单独覆盖的倍率（如 `"5": 0.7` 表示 Lv5 享 7 折）；未列出的 LV 走 `1.0`。**与 `pricing.tiers[]`（产品档位）是两个概念**——前者是"用户级折扣"，后者是"产品分辨率/质量档"。
> - **`effectiveFromUtc`**：生效时间。`> now()` = 预生效记录，BFF 调度按"最近一条已生效"取数。
> - **历史价格不可修改**，只能用新的 `effectiveFromUtc` 覆盖。
>
> **单价单位约定**：`per_token` 走 **元 / 1M tokens**（与 OpenAI / Anthropic / Google 等厂家
> 定价页一致，对账不用反复 ×1000）；`per_character` 走 **元 / 1K 字符**（字符量级跟 token 不
> 在一个数量级，1K 是行业常用刻度）。字段命名直接编码单位（`*PerMToken` / `pricePerKChar`），
> 让 schema 自我说明。
>
> **`per_token` 定价按 input / output 父子集嵌套**（与 `log.cost` 结构对称，BFF 拷贝快照时 1:1 path 映射）：
>
> ```ts
> pricing = {
>   input: {
>     perMToken,                      // 主输入单价（必填）
>     cachedRead?:    number,         // cache 读（约 base × 0.1~0.5）
>     cachedWrite5m?: number,         // 5min TTL cache 写（Anthropic，约 base × 1.25）
>     cachedWrite1h?: number,         // 1h TTL  cache 写（Anthropic，约 base × 2.0）
>     audio?:         number,         // 输入音频（GPT-4o-audio，约 base × 16）
>   },
>   output: {
>     perMToken,                      // 主输出单价（必填，embedding/rerank 填 0）
>     reasoning?: number,             // o1 / extended thinking / Gemini thoughts
>     audio?:     number,             // 输出音频（GPT-4o-audio，约 base × 8）
>   },
> }
> ```
>
> 子维度直接用 `number?` 而不是 `{ perMToken }?` —— pricing 端每个维度本质上就是一个单价数字，
> 没必要为了视觉对称多包一层（log.cost 端要包是因为每个维度有 `perMToken + amount` 一对）。
>
> 计费公式（**按 `billingType` 分别计算**，最后统一乘上 `multiplier × tierMultiplier`）：
>
> ```
> per_token        amount = (
>     pricing.input.perMToken          × usage.input.tokens
>   + (pricing.input.cachedRead    ?? 0) × usage.input.cachedReadTokens
>   + (pricing.input.cachedWrite5m ?? 0) × usage.input.cachedWrite5mTokens
>   + (pricing.input.cachedWrite1h ?? 0) × usage.input.cachedWrite1hTokens
>   + (pricing.input.audio         ?? 0) × usage.input.audioTokens
>   + pricing.output.perMToken         × usage.output.tokens
>   + (pricing.output.reasoning    ?? 0) × usage.output.reasoningTokens
>   + (pricing.output.audio        ?? 0) × usage.output.audioTokens
> ) / 1_000_000
> per_call         amount = pricePerCall × calls
>                           （命中缓存的次数用 cachedPricePerCall）
> per_image        amount = Σ tier.pricePerImage  按命中的 (size, quality) 档求和
> per_video        amount = Σ tier.pricePerSecond × seconds  按命中的 resolution 档求和
> per_audio_minute amount = pricePerMinute × minutes
> per_character    amount = pricePerKChar × chars / 1000
> ```
>
> **`per_token` 子维度的语义**（与 OpenAI Responses API / Anthropic Messages API / Google Gemini `usageMetadata` 对齐）：
>
> - `usage.input.tokens` = 总输入 token 数（**含**所有 input 子集）
> - `usage.output.tokens` = 总输出 token 数（**含**所有 output 子集）
> - `usage.input.cachedReadTokens` = input 中走 cache 读的部分（按 cache 读单价，通常便宜很多）
> - `usage.input.cachedWrite5mTokens` = input 中触发 **5min TTL** cache 写的部分（Anthropic 默认 TTL，约 base × 1.25）
> - `usage.input.cachedWrite1hTokens` = input 中触发 **1h TTL** cache 写的部分（Anthropic 长 TTL，约 base × 2.0）
> - `usage.output.reasoningTokens` = output 中"内部推理"部分（o1 / Claude extended thinking / Gemini thoughts）
> - `usage.input.audioTokens` = input 中音频部分（GPT-4o-audio；单价远贵于文本）
> - `usage.output.audioTokens` = output 中音频部分（GPT-4o-audio）
>
> 因此精确实现里应**先把 cache / reasoning / audio 子集从父集 input/output 中扣掉再分别计费**，
> 上面公式是直观的可读形式，BFF 真实计费器需按"互不重叠"切分。

## 接口清单

| 业务动作 | Port 方法 | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/api/admin/demuxai/pricing` |
| 按 modelId 取现行价 | `get(modelId)` | GET | `/api/admin/demuxai/pricing/{modelId}` |
| 新增 / 更新（upsert） | `upsert(input)` | PUT | `/api/admin/demuxai/pricing/{modelId}` |
| 删除 | `delete(modelId)` | DELETE | `/api/admin/demuxai/pricing/{modelId}` |
| 未配置模型（前端从 `models - pricing` 派生） | `DemuxaiModelPort.list` | GET | `/api/admin/demuxai/models` |

## 请求 / 响应

### 列表 `GET /api/admin/demuxai/pricing`

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 是 | 起始 1 |
| `pageSize` | int | 是 | 默认 20 |
| `keyword` | string | 否 | 模糊匹配 `modelId` |
| `billingType` | enum/`'all'` | 否 | `per_token` / `per_call` / `per_image` / `per_video` / `per_audio_minute` / `per_character` |

响应：

```json
{
  "items": [
    {
      "uid": "PRC-001",
      "modelId": "demux-gpt-4o",
      "billingType": "per_token",
      "pricing": {
        "input": {
          "perMToken": 25,
          "cachedRead": 6.25,
          "cachedWrite5m": 31.25,
          "cachedWrite1h": 50
        },
        "output": {
          "perMToken": 75
        }
      },
      "multiplier": 1.2,
      "currency": "CNY",
      "tierMultipliers": { "3": 0.9, "5": 0.7 },
      "effectiveFromUtc": "2025-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-01T00:00:00Z",
      "updatedByIamUid": "200000099"
    }
  ],
  "total": 12
}
```

外层字段（与 `billingType` 无关）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `uid` | string | 定价记录主键。 |
| `modelId` | string | 与 `Model` 一一对应。 |
| `billingType` | enum | 判别字段：`per_token` / `per_call` / `per_image` / `per_video` / `per_audio_minute` / `per_character`；决定 `pricing` 的形状。 |
| `pricing` | object | 嵌套定价对象，形状由 `billingType` 决定（见下节）。 |
| `multiplier` | number (>0) | 全局倍率。 |
| `currency` | string | ISO 4217（`CNY` / `USD`）。 |
| `tierMultipliers` | `{ [tier: string]: number }` | key 为 LV 整数字符串。 |
| `effectiveFromUtc` | ISO8601 | 未来时间 = 预生效。 |
| `updatedAtUtc` | ISO8601 | 最近修改时间。 |
| `updatedByIamUid` | string \| null | 最近改动操作人。 |

### `billingType` 与 `pricing` 形状

#### `per_token` —— 文本 / embedding / rerank

> **单价单位：元 / 1M tokens**。结构上与 `log.cost.input/output` 对称（input/output 父子集嵌套），
> BFF 拷贝快照到 log 时是 1:1 path 映射，只需在每个维度多写一个 `amount` 字段。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input.perMToken` | number | 是 | 主输入 token 单价（元 / 1M）。 |
| `input.cachedRead` | number | 否 | 命中 prompt cache 的输入单价（OpenAI cached input ≈ base × 0.5 / Anthropic cache read ≈ base × 0.1）；省略 = 不支持。 |
| `input.cachedWrite5m` | number | 否 | **5 分钟 TTL** cache 写单价（Anthropic prompt caching 默认 TTL，约 base × 1.25）；省略 = 不支持。 |
| `input.cachedWrite1h` | number | 否 | **1 小时 TTL** cache 写单价（Anthropic 长 TTL，约 base × 2.0，比 5m 贵 ~60%）；省略 = 不支持。 |
| `input.audio` | number | 否 | 输入音频 token 单价（GPT-4o-audio / Realtime API；约 base × 16）；省略 = 不支持音频输入。 |
| `output.perMToken` | number | 是 | 主输出 token 单价。**embedding / rerank 等无输出场景填 `0`。** |
| `output.reasoning` | number | 否 | 推理 token 单价（o1 / o3 / Claude extended thinking / Gemini thoughts）；省略 = 与 output 等价。 |
| `output.audio` | number | 否 | 输出音频 token 单价（GPT-4o-audio；约 base × 8）；省略 = 不支持音频输出。 |

> **为什么 cache 写要按 5m / 1h 分两个字段？** Anthropic prompt caching 默认 TTL 是 5 分钟，但
> 也支持显式声明 `cache_control: { type: "ephemeral", ttl: "1h" }` 走 1 小时 TTL；两者的写入单价
> 完全不同（1h 比 5m 贵约 60%），上游 API usage 里也分两个字段上报
> (`cache_creation.ephemeral_5m_input_tokens` / `cache_creation.ephemeral_1h_input_tokens`)，
> 我们必须分别记录单价，否则按统一单价对账会少算 1h cache 用户。
>
> **`input.audio` / `output.audio` 是为多模态准备的**。OpenAI 在 GPT-4o-audio
> 系列里把 audio token 跟 text token 分开计费 —— audio token 远贵于 text，按文本单价算账会
> 严重少算。纯文本模型省略即可。

#### `per_call` —— 平价按次

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pricePerCall` | number | 是 | 每次调用单价。 |
| `cachedPricePerCall` | number | 否 | 命中缓存的单价；省略 = 不支持。 |

#### `per_image` —— 文生图

按 **尺寸 × 质量** 笛卡尔分档；模型只有一档时也用同一形状（数组长度 1）。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tiers[]` | `ImageTier[]` | 是 | 每档一行：`{ size, quality, pricePerImage }`。 |
| `tiers[].size` | string | 是 | 例：`"1024x1024"` / `"1792x1024"`。 |
| `tiers[].quality` | string | 是 | 例：`"standard"` / `"hd"` / `"draft"`；模型只有一档时填 `"default"`。 |
| `tiers[].pricePerImage` | number | 是 | 该档每张单价。 |

#### `per_video` —— 文生视频

按 **分辨率** 分档，每档给"每秒单价"；可选最小 / 最大时长用于校验生成请求合法性。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tiers[]` | `VideoTier[]` | 是 | 每档一行：`{ resolution, pricePerSecond }`。 |
| `tiers[].resolution` | string | 是 | 例：`"720p"` / `"1080p"` / `"4k"`。 |
| `tiers[].pricePerSecond` | number | 是 | 该分辨率下每秒单价。 |
| `minSeconds` | number | 否 | 模型允许的最短生成时长（< 此值拒单）。 |
| `maxSeconds` | number | 否 | 模型允许的最长生成时长（> 此值拒单）。 |

#### `per_audio_minute` —— 语音转写（ASR）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pricePerMinute` | number | 是 | 每分钟单价；不足 1 分钟按 BFF 取整规则计（建议向上取整到秒级再换算）。 |

#### `per_character` —— 文生语音（TTS）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pricePerKChar` | number | 是 | 每千字符单价（业界常用 K 字符为粒度）。 |

#### 联合类型示意

```ts
type Pricing = PricingBase & (
  | { billingType: 'per_token'; pricing: {
      input: {
        perMToken: number;
        cachedRead?:    number;
        cachedWrite5m?: number;
        cachedWrite1h?: number;
        audio?:         number;
      };
      output: {
        perMToken: number;
        reasoning?: number;
        audio?:     number;
      };
    } }
  | { billingType: 'per_call'; pricing: {
      pricePerCall: number;
      cachedPricePerCall?: number;
    } }
  | { billingType: 'per_image'; pricing: {
      tiers: Array<{ size: string; quality: string; pricePerImage: number }>;
    } }
  | { billingType: 'per_video'; pricing: {
      tiers: Array<{ resolution: string; pricePerSecond: number }>;
      minSeconds?: number;
      maxSeconds?: number;
    } }
  | { billingType: 'per_audio_minute'; pricing: { pricePerMinute: number } }
  | { billingType: 'per_character';    pricing: { pricePerKChar: number } }
);
```

- BFF 写入前做 zod / 等价校验：**`pricing` 形状必须严格匹配 `billingType`**，多余字段视为非法。  
- `tiers[]` 类计费：**档位组合（key）必须唯一**——`per_image` 唯一键 `(size, quality)`、`per_video` 唯一键 `resolution`；重复视为 `validation` 错误。  
- 真实计费在调用日志侧记录命中的档位（如 `1024x1024 / hd`、`1080p × 8 sec`），便于对账。

### 现行价 `GET /api/admin/demuxai/pricing/{modelId}`

返回在 `now()` 时点生效的那一条 Pricing（按 `effectiveFromUtc <= now()` DESC 取第一条）。

### upsert `PUT /api/admin/demuxai/pricing/{modelId}` （`UpsertPricingInput`）

外层始终相同（`modelId` / `billingType` / `pricing` / `multiplier` / `currency` / `tierMultipliers` / `effectiveFromUtc`）；以下按 `billingType` 给六种典型示例。

**`per_token`**（含 prompt cache 与推理 token）：

```json
{
  "modelId": "demux-gpt-4o",
  "billingType": "per_token",
  "pricing": {
    "input": {
      "perMToken": 25,
      "cachedRead": 6.25,
      "cachedWrite5m": 31.25,
      "cachedWrite1h": 50
    },
    "output": {
      "perMToken": 75
    }
  },
  "multiplier": 1.2,
  "currency": "CNY",
  "tierMultipliers": { "3": 0.9, "5": 0.7 },
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

**`per_call`**：

```json
{
  "modelId": "demux-moderation",
  "billingType": "per_call",
  "pricing": { "pricePerCall": 0.001 },
  "multiplier": 1.0,
  "currency": "CNY",
  "tierMultipliers": {},
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

**`per_image`**（DALL-E 3 风格的 size × quality 档）：

```json
{
  "modelId": "demux-dalle-3",
  "billingType": "per_image",
  "pricing": {
    "tiers": [
      { "size": "1024x1024", "quality": "standard", "pricePerImage": 0.28 },
      { "size": "1024x1792", "quality": "standard", "pricePerImage": 0.56 },
      { "size": "1024x1024", "quality": "hd",       "pricePerImage": 0.56 },
      { "size": "1024x1792", "quality": "hd",       "pricePerImage": 0.84 }
    ]
  },
  "multiplier": 1.0,
  "currency": "CNY",
  "tierMultipliers": {},
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

**`per_video`**（按分辨率档 × 每秒计费，并限制时长 5~10s）：

```json
{
  "modelId": "demux-sora-1",
  "billingType": "per_video",
  "pricing": {
    "tiers": [
      { "resolution": "720p",  "pricePerSecond": 0.30 },
      { "resolution": "1080p", "pricePerSecond": 0.60 }
    ],
    "minSeconds": 5,
    "maxSeconds": 10
  },
  "multiplier": 1.0,
  "currency": "CNY",
  "tierMultipliers": {},
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

**`per_audio_minute`**（Whisper 风格的语音转写）：

```json
{
  "modelId": "demux-whisper-1",
  "billingType": "per_audio_minute",
  "pricing": { "pricePerMinute": 0.04 },
  "multiplier": 1.0,
  "currency": "CNY",
  "tierMultipliers": {},
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

**`per_character`**（TTS 文生语音，按千字符）：

```json
{
  "modelId": "demux-tts-hd",
  "billingType": "per_character",
  "pricing": { "pricePerKChar": 0.10 },
  "multiplier": 1.0,
  "currency": "CNY",
  "tierMultipliers": {},
  "effectiveFromUtc": "2025-10-01T00:00:00Z"
}
```

- 存在则替换为新生效记录，**历史保留只读**；
- 不存在则创建；
- BFF 写入前校验：`modelId` 对应的 `Model` 存在；`pricing` 形状与 `billingType` 严格匹配；`tiers[]` 的唯一键不重复。

### 删除 `DELETE /api/admin/demuxai/pricing/{modelId}`

无请求体。删除后该模型不会再有现行价，BFF 应拒绝该 modelId 的计费请求直至重新设置。

## 「未配置」Tab 派生逻辑

前端不调用单独接口，而是：

```ts
unconfiguredModels = models.filter(m => !pricing.some(p => p.modelId === m.modelId))
```

- 「模型定价」Tab：展示已配置（带过滤 / 分页）。
- 「未配置」Tab：上述派生集合（前端再做一次本地分页），行点击直接打开 upsert 对话框。

## 交互流程

```
onMounted → loadModels() + fetchData()
切 Tab：
  - priced       → 已有过滤 + 分页
  - unconfigured → 派生数组 + 前端分页

编辑/新建 → PricingEditDialog → upsert(input) → fetchData()
删除 → confirmDanger → delete(modelId) → fetchData()
```

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `validation` | `pricing` 形状与 `billingType` 不匹配（缺必填 / 含多余字段）；`tiers[]` 重复键（`per_image` 的 `(size,quality)` 或 `per_video` 的 `resolution` 重复）；`tierMultipliers` 含 ≤0 值；`multiplier ≤ 0` |
| 403 | `forbidden` | 非 Admin |
| 404 | `not_found` | `modelId` 不存在（upsert 时 BFF 拒绝） |
| 409 | `conflict` | `effectiveFromUtc` 与历史记录冲突（重复时间点） |

## 备注

- 接入真 BFF 时，建议把 `effectiveFromUtc` 校验放服务端（不能早于 `now() - 1分钟` 防漂移）。
- 修改历史价格请走"新增一条 effectiveFromUtc=now 的覆盖记录"，而非 update。
