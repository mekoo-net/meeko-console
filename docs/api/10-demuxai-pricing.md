# 10 · 模型定价（DemuxAI Pricing）

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demux/pricing` |
| 角色 | **Admin** |
| 视图 | `src/features/demux/views/PricingView.vue`（Tab：**已配置** / **未配置**） |
| 布局 | 与供应商组相同的左右分栏：`ProviderGroupSidebar` + 定价表 |
| 对话框 | `src/features/demux/components/PricingEditDialog.vue` |
| Port | `DemuxaiPricingPort` + `DemuxaiCatalogPort` + `DemuxaiModelRoutePort` + `DemuxaiModelPort`（过渡） |

## 标识约定

| 字段 | 语义 |
| --- | --- |
| `id` | 实体主键（如定价行 `PRC-*`、模型路由 `MR-*`、Vendor `1001`） |
| `uid` | **仅 userId**：账户 `account.uid`、IAM `iamUserUid`、操作人 `updatedBy.iamUserUid` 等 |

与 [`11-demuxai-logs.md`](./11-demuxai-logs.md) 一致；勿用 `uid` 表示定价 / 路由 / Vendor 行主键。

## 业务定义

> 模型定价与对外模型名 **1..1** —— 每个 **`modelId`**（= 模型路由 **`alias`**）一条现行价记录。
>
> **按供应商组筛选**：左侧选 `queueGroup`（或「全部」）时，仅展示 `alias` 所属 `channelKey` 匹配的路由及其定价。
>
> **discriminated union**：顶层 `billingType` 判别，`pricing` 嵌套形状随类型变化（六种计费类型不变，详见下文）。
>
> 金额单位与旧版一致；`effectiveFromUtc` 现在只是响应里的审计字段，upsert 不收。
>
> **2026-09 起**：`tierMultipliers`（LV 折扣）已彻底删除；`cachedRead` / `cachedWrite` 缺省时按 `input.perMToken` 计费。
> 有效价的常态来路改为「价格表基准价 × 渠道倍率 × 路由倍率」自动编译，见文末[价格表 / 倍率](#价格表--倍率2026-09)。

### `modelId` 来源（2026-05）

| 来源 | 说明 |
| --- | --- |
| **主** | `ModelRoute.alias`（`status === 'enabled'`） |
| **过渡** | `DemuxaiModelPort.list` 中的 `modelId`（无路由时仍可出现） |

「未配置」Tab：

```ts
// 1) 所有 enabled 路由的 alias 减去已定价 modelId
// 2) 再合并 legacy models（按 channel 过滤）
// 未配置行用 modelFromAlias() 合成最小 Model 占位，点开即 upsert

```

## 接口清单
| 业务动作 | Port 方法 | HTTP | REST 端点 | 投影 |
| --- | --- | --- | --- | --- |
| 列表 | `list(input)` | GET | `/demux/api/admin/pricing` | 行级（含 `summary` 或完整 `pricing`，以实现为准） |
| 按 modelId 取现行价 | `get(modelId)` | GET | `/demux/api/admin/pricing/{modelId}` | 全字段 |
| 历史价 | `listHistory` | GET | `/demux/api/admin/model-routes/{modelId}/history` 等 | **前端 Port 有定义；BFF 待接** |
| upsert | `upsert(input)` | PUT | `/demux/api/admin/pricing/{groupCode}/{modelId}` | 全字段；单段 `/{modelId}` 时 group=default |
| 删除 | `delete(modelId)` | DELETE | `/demux/api/admin/pricing/{groupCode}/{modelId}` | — |
| 供应商组字典 | `DemuxaiCatalogPort.listProviderGroups` | GET | 见 [`08`](./08-demuxai-providers.md) | 左侧栏 |
| 别名列表 | `DemuxaiModelRoutePort.list` | GET | 见 [`08`](./08-demuxai-providers.md) | 筛选 / 未配置 |

> Demux 响应经 **`requestDemuxAi`** 解包 `{ success, data }`。
查询参数（列表）：`p`、`pageSize`、`keyword`（HttpAdapter）。

## 请求 / 响应
### 列表 `GET /demux/api/admin/pricing`
参数：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `p` | int | 是 | 页码，从 1 起 |
| `pageSize` | int | 是 | 默认 20 |
| `keyword` | string | 否 | 模糊匹配 `modelId`（alias） |
响应示例（**轻投影**推荐；完整 `pricing` 见详情）：

```json
{
  "items": [
    {
      "id": "PRC-001",
      "modelId": "demux-gpt-4o",
      "billingType": "per_token",
      "summary": {
        "inputPerMToken": 25,
        "outputPerMToken": 75
      },
      "currency": "CNY",
      "effectiveFromUtc": "2025-09-01T00:00:00Z",
      "updatedAtUtc": "2025-09-01T00:00:00Z",
      "updatedBy": { "iamUserUid": "200000099" },
      "sourcePriceId": "3001",
      "multiplierApplied": 1.2
    }
  ],
  "total": 12
}

```

| 字段 | 说明 |
| --- | --- |
| `id` | 定价行主键（如 `PRC-001`） |
| `modelId` | = 模型路由 `alias` |
| `updatedBy` | 可选 `{ iamUserUid }`，操作人 IAM userId |
| `sourcePriceId` / `multiplierApplied` | 编译审计：由哪条基准价 × 倍率算出；亲手写入的两者皆 `null` |

`summary` 按 `billingType` 形状见下表（与实现一致）。

#### `summary` 形状对照表
| `billingType` | `summary` 形状 |
| --- | --- |
| `per_token` | `{ inputPerMToken, outputPerMToken }` |
| `per_call` | `{ pricePerCall }` |
| `per_image` | `{ tierCount, minPricePerImage, maxPricePerImage }` |
| `per_video` | `{ tierCount, minPricePerSecond, maxPricePerSecond }` |
| `per_audio_minute` | `{ pricePerMinute }` |
| `per_character` | `{ pricePerKChar }` |

### `billingType` 与 `pricing` 形状
六种计费类型、`per_token` input/output 嵌套、cache 5m/1h、计费公式、厂家 usage 对齐等**不变**，详见 `src/features/demux/model/pricing.types.ts` 与 git 历史版本；BFF 校验规则：
- `pricing` 形状必须严格匹配 `billingType`；
- `per_image` 唯一键 `(size, quality)`；`per_video` 唯一键 `resolution`；
- 所有价格字段 ≥ 0；`cachedRead` / `cachedWrite` 可省略（省略 = 按 `input.perMToken` 计）。

### 现行价 `GET /demux/api/admin/pricing/{modelId}`
返回 `effectiveFromUtc <= now()` 的最新一条（BFF 约定）。

### upsert `PUT /demux/api/admin/pricing/{groupCode}/{modelId}`

`groupCode` 与 Chat 请求体 `model=帕米/gemini-2.5-pro` 的前缀一致（如 `帕米`、`default`）。

Body 为 `UpsertPricingInput`（含 `modelId`、`billingType`、`pricing`、可选 `groupCode`）。
**币种和生效时间不由控制台传**：币种恒为 CNY，生效时间取后端落库时刻——让人在表单里挑一个「未来生效」
只会写出跟账单对不上的价。

> 在这里直接写有效价会把该路由切成 `pricingMode = manual`（自定义）：人亲手写的价，编译器不再覆盖。
> 走渠道定价则 `setRoutePricing({ mode: compiled, multiplier: null })`，有效价 = 价格表 × 渠道倍率。

`per_token` 示例（单位：元 / 1M tokens）：

```json
{
  "modelId": "demux-gpt-4o",
  "billingType": "per_token",
  "pricing": {
    "input": { "perMToken": 25, "cachedRead": 6.25 },
    "output": { "perMToken": 75 }
  }
}

```

### 删除 `DELETE /demux/api/admin/pricing/{modelId}`
Query：`groupCode`（HttpAdapter 默认 `default`）。

## 交互流程

```

onMounted → listProviderGroups + loadAllPricing + listModels + listModelRoutes
左侧切换 queueGroup → 本地过滤 priced / unconfigured（matchesChannel）
编辑/新建 → PricingEditDialog → upsert → refresh
删除 → confirmDanger → delete(modelId)

```

- **已配置** Tab：分页展示 `filteredPriced`。
- **未配置** Tab：由 `modelRoutes`（enabled）+ legacy `models` 减去已配置 `modelId` 派生，前端分页。

## 错误码

| code | 含义 |
| --- | --- |
| `validation` | `pricing` 与 `billingType` 不匹配；`tiers[]` 重复键 |
| `not_found` | `modelId` 无对应模型 / 路由 |

## 价格表 / 倍率（2026-09）

全平台按人民币计价：`model_prices` 里只有 CNY，没有别的币种，也没有运行期可配的汇率。
官方源（models.dev / OpenRouter / LiteLLM / NewAPI）报的美元价在 **拉取时** 就按固定 `1 USD = 7 CNY`
（`@demux/common` 的 `USD_CNY_FIXED_RATE`）折成人民币，候选里带 `sourceCurrency` / `fxApplied` 供审计。

有效价（`vendor_rates`）有两条来路，模型定价页对每条别名二选一：

- **渠道定价**（`pricing_mode = compiled`）：`有效价 = 价格表 × 渠道倍率`。价格表或渠道倍率一改，后端重编译这条。控制台不再单独叠路由倍率（`price_multiplier` 置空）。
- **自定义**（`pricing_mode = manual`）：管理员自己写按量 / 按次 / 图片等，编译器不覆盖。

`setRoutePricing` 仍接受 `multiplier`（兼容旧数据）；控制台渠道定价一律传 `null`。

| 业务动作 | Port 方法（`DemuxPricingPort`） | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 价格表（按厂家分组） | `listModelPricesByMaker` | GET | `/demux/api/admin/pricing/catalog/by-maker?keyword&maker` → `items: [{ maker, items: ModelPrice[] }]`，不分页 |
| 单条基准价 | `getModelPrice` | GET | `/demux/api/admin/pricing/catalog/{modelKey}` |
| 写基准价（含编译） | `upsertModelPrice` | PUT | `/demux/api/admin/pricing/catalog` |
| 删基准价（有效价保留） | `deleteModelPrice` | DELETE | `/demux/api/admin/pricing/catalog/{id}` |
| 渠道倍率 | `setVendorMultiplier` | PATCH | `/demux/api/admin/pricing/vendors/{id}/multiplier` |
| 路由模式 / 倍率 | `setRoutePricing` | PATCH | `/demux/api/admin/pricing/routes/{id}` `{ mode: compiled\|manual, multiplier }` |
| 手动重编译 | `compile` | POST | `/demux/api/admin/pricing/compile` `{ modelKeys?, vendorKeys? }` |
| 拉官方价 | `fetchPrices` | POST | `/demux/api/admin/pricing/sync/fetch` `{ sources: [{ kind, baseUrl?, apiKey?, name? }], makers?, onlyMatched }` |
| 套用候选 | `applyPrices` | POST | `/demux/api/admin/pricing/sync/apply` `{ items: [{ modelKey, maker, billingType, rate, sourceKind, sourceRef }] }`（`rate` 为 fetch 返回的人民币数值） |

**厂家（maker）**：`model_prices.maker` 是模型是谁做的（`openai` / `anthropic` / `google` / …，开放集合，见 `@demux/common` `maker.ts`），
与渠道（vendor / queueGroup）无关。判定按模型键而不是按源——阿里云也转售 `glm-5.2` / `kimi-k3`，厂家仍是智谱 / Moonshot。
价格表页按 maker 分组（左侧厂家、右侧价目）。点「上游同步」直接拉 **models.dev** 官方价（美元按 1:7 折人民币），弹出当前 vs 官方的 diff，勾选后套用——没有「选价格源」这一步。
页头下拉里是「全部上游同步」（不按厂家过滤），厂家面板里是「新建模型」。
`fetchPrices.sources` 仍可指定 openrouter / litellm / newapi，那是接口能力，控制台不同步渠道倍率、也不让人选源。
NewAPI 的「上游倍率同步」是从**已配置渠道**抄 `model_ratio`，和价格表不是一回事。
写入时不传 `maker` 后端按 `inferMaker(modelKey)` 推断；官方源候选带源给出的 maker。

**方向是模型名映射到价格表**：价格表登记的是厂家发布的模型，与下游用了哪些别名无关，
所以 `by-maker` / `fetchPrices` 都不带路由侧字段（`routeCount` / `vendorKeys` / 「在用但未定价」）。
哪条别名没映射上基准价，在 `/demux/rate` 的「未配置」里按路由看，可以选渠道定价（需价格表有这条）或自定义。

`source` 只标官方源（`priceSourceKindValues`）；运营自己改出来的价没有来源可标，落空串，页面不显示来源。

**计量方式与模型能力都来自官方目录，不是录价时的表单选项。** 一个模型按 token / 张 / 秒 / 分钟 /
字符计量，是它自己的属性：官方拉取时由目录带过来，手工加的模型在「新建模型」那一步问一次类型
（目录里查不到，只能问），录价对话框本身没有「计费方式」下拉——挑出来的和模型不符只会写出算不出账的价。

价格表里六种形状都可能存在（生图有 `(size, quality)` 档位、视频有分辨率档位和时长限制），
控制台按「模型 / 类型 / 价格」三列显示：类型列是色块 icon + 短名（LLM / 向量 / 图像 / 视频 / 音频 / 语音 / 按次），价格列用 icon 摊开各档（入↓ / 出↑ / 缓存写铅笔 / 缓存读打开阅读；生图是图片 icon + `1024² · HD`），
不再跟 `/ 1M tokens`。`cachedRead` / `cachedWrite` 留空时价格列照样列出这一档，取值为入价并压成占位色——
留空的语义是按入价计，不是不收费。向量化仍是 `per_token`，但 `capabilities.embedding = true`：类型列标「向量」，价格列只留入价。

`ModelPrice.capabilities`（`{ audio, reasoning, embedding }`）由官方源按模型 `kind` 带过来（LLM 才有 audio/reasoning，向量化才是 embedding），决定录价表单放出哪些档；`capabilities` 为空（手加的键）才把所有档放出来。改价不动 `capabilities`。

`sources[].kind` ∈ `models_dev` / `openrouter` / `litellm` / `newapi`；`newapi` 必填 `baseUrl`。
`fetchPrices` 返回 `items: [{ modelKey, maker, current, candidates }]`，
候选：`{ sourceKind, sourceName, sourceRef, maker, modelId, matchKind, billingType, rate(CNY), sourceCurrency, fxApplied, sameAsCurrent }`。

`PriceCompileResult`：`{ compiled, unchanged, unmatchedModelKeys[], newVersion }`。

分组视图 `GET /demux/api/admin/vendor/model` 的每行带 `routeId`、`pricingMode`。模型定价页对每条别名打开「定价」抽屉：渠道定价或自定义（按量 / 按次等）。

Console 页面：`/demux/pricing`（价格表 + 拉价 diff）、`/demux/rate`（每条别名：渠道定价或自定义）、`/demux/vendors`（渠道设置：名称 / 倍率）。

## 备注

- `effectiveFromUtc` 只在响应里出现（审计用），upsert 入参没有它。
- 日志扣费快照形状见 [`11-demuxai-logs.md`](./11-demuxai-logs.md)。
