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
> 有效价的常态来路改为「价格表基准价 × 倍率」自动编译，见文末[价格表 / 倍率](#价格表--倍率2026-09)。
> **2026-11 起**渠道不再管理价格：价格按「渠道 × 模型家族」分组定（倍率 / 按次价 / 积分单价），别名可以再设独立倍率顶掉分组的（不叠乘）。

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
      "sourceModelKey": "gpt-4o",
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
| `sourceModelKey` / `multiplierApplied` | 编译审计：由价格表里哪个键的基准价 × 倍率算出（价格表没有行号，按键认行）；亲手写入的两者皆 `null` |

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

`groupCode` 与 Chat 请求体里的通道 slug 一致（如 `nai`、`default`）。

Body 为 `UpsertPricingInput`（含 `modelId`、`billingType`、`pricing`、可选 `groupCode`）。
**币种和生效时间不由控制台传**：币种恒为 CNY，生效时间取后端落库时刻——让人在表单里挑一个「未来生效」
只会写出跟账单对不上的价。

> 在这里直接写有效价会把该路由切成 `pricingMode = manual`（自定义）：人亲手写的价，编译器不再覆盖。
> 继承分组则 `setRoutePricing({ mode: compiled, multiplier: null })`，有效价跟别名所在模型家族的分组定价走
> （分组是倍率就是价格表 × 分组倍率，是按次 / 积分就是分组那个价）；
> 独立倍率则 `multiplier` 给数字，有效价 = 价格表 × 这个数（不看分组怎么定的）。

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

**价格定在模型家族上，渠道不管价格（2026-11）**。一个渠道里往往带着几家的模型（antigravity 既有 claude 又有 gemini），
各家的进价、结算方式不一样，挂在渠道上的一个倍率或一个积分单价定不准。现在渠道上没有任何定价字段和定价接口，
渠道设置里也只剩渠道名称；价格只定在两处：

- **家族分组定价**：渠道里每个模型家族一份，方式（`mode`）加一个值（`value`）：
  - `multiplier`：有效价 = 价格表 × 倍率，按 token 等用量计费；
  - `per_call`：值就是有效价，人民币 / 每次调用，不看价格表；
  - `credit`：值就是有效价，人民币 / 每 1 上游积分，按上游报的积分计费，不看价格表。

  家族不用手工建——后端照别名的上游模型名归类（claude → `anthropic`、gemini → `google`，认不出的进 `other`），
  键就是厂家键，展示名用 `modelFamilyLabel`（Claude / Gemini / …）。谁都没改过的组就是倍率 1——那就是它的定价，不存在「未设置」。
  分组只存一个值：换方式就是换这个值的含义，换回去要重新给。
- **独立倍率**：别名自己的（`price_multiplier`），有值就按价格表 × 它出价，顶掉分组的定价——二选一，**不叠乘**；
  分组是按次 / 积分时也一样（顶掉的是分组的整个定价方式）。

有效价（`vendor_rates`）有三条来路，模型定价页对每条别名三选一：

- **继承分组**（`pricing_mode = compiled`，`price_multiplier = null`）：跟分组定价走，分组一改后端重编译这条。
- **独立倍率**（`pricing_mode = compiled`，`price_multiplier` 有值）：`有效价 = 价格表 × 这个倍率`，分组再怎么改它不动。
- **自定义**（`pricing_mode = manual`）：管理员自己写按量 / 按次 / 图片等，编译器不覆盖。

存量：升级后后端启动时把旧的渠道定价照抄给该渠道现有的每个家族——倍率渠道抄成分组倍率，原来叠乘在上面的路由倍率折成独立倍率
（渠道倍率 × 路由倍率）；积分渠道抄成分组积分单价，路由上原来没人读的倍率清掉。有效价不变。

| 业务动作 | Port 方法（`DemuxPricingPort`） | HTTP | REST 端点 |
| --- | --- | --- | --- |
| 单条基准价 | `getModelPrice` | GET | `/demux/api/admin/pricing/catalog/{modelKey}` |
| 渠道的家族分组 | `listVendorFamilies` | GET | `/yomi/api/admin/pricing/vendors/{id}/families` → `items: { family, mode, value, routeCount, inheritingRouteCount }[]` |
| 家族分组定价 | `setFamilyPricing` | PATCH | `/yomi/api/admin/pricing/vendors/{id}/families/{family}` `{ mode: multiplier\|per_call\|credit, value }`（两样都必填） |
| 路由模式 / 独立倍率 | `setRoutePricing` | PATCH | `/yomi/api/admin/pricing/routes/{id}` `{ mode: compiled\|manual, multiplier }`（`multiplier: null` = 继承分组） |
| 下发到网页聊天 | `YomiVendorRoutePort.setChatVisible` | PATCH | `/yomi/api/admin/routes/{id}/chat-visible` `{ chatVisible }`（必填；推进路由快照版本，网关几秒内重拉；不重算价） |

**价格表不在这边（2026-11）**：价格表归 OneApi，全站一份，在管理端的「组件设置 → OneApi → 模型价格」（`/components/oneapi/ratecard`）里维护，
见本文末尾[模型价格](#模型价格组件设置--oneapi2026-11)。Yomi 分组下原来的价格表页（`/yomi/pricing`）已经去掉，旧地址跳到新页面。
写基准价（`PUT …/catalog`）、删基准价（`DELETE …/catalog/{id}`）、拉官方价（`POST …/sync/fetch`）、套用候选（`POST …/sync/apply`）
四个接口 Yomi 后端已经删掉；这边的端口只剩按键查一行（定价抽屉预览「牌价 × 倍率」用）。

单条查询回的一行是 `{ modelKey, maker, billingType, rate, currency: "USD", capabilities, routeCount, updatedAtUtc }`：
没有行号（按 `modelKey` 认行）、没有来源和生效时间；`updatedAtUtc` 是 Unix 毫秒；`routeCount` 单条查询是 0。

**下发到网页聊天（2026-11）**：模型定价页每条已定价别名有一个开关，默认开。网页聊天下发所有定了价、开关开着的别名，
不再按计费方式挑；按秒 / 按字符计价的网页上没有入口，开关置灰。关掉只影响网页聊天，API Key 照样能调。

定价列表（`GET /yomi/api/admin/vendor/model`）每条别名带 `chatVisible`；每条别名、未配置列表（`…/unconfigured`）每一行都带 `family`：页面照它把别名归到分组下，
不要自己照模型名再猜一遍——分组定价是按后端判的家族对的。
渠道定价的旧接口（`PATCH …/vendors/{id}/pricing`）已经删掉；供应商组的响应里也不再有 `pricingMode` / `pricingValue`。

后端还留着 `POST /yomi/api/admin/pricing/compile`（`{ modelKeys?, vendorKeys? }`）给运维在漏算时兜底，控制台不调它，端口上也没有对应的方法。

重算结果（改分组定价、改路由定价都回它）是
`{ compiled, unchanged, unmatchedModelKeys, newVersion, priceTableEmpty, invalidPriceKeys }`：
`priceTableEmpty = true` 是手上没有牌价（没读到、或者号池管理台还没发布），按牌价出价的路由这一遍都没重算、现有的有效价原样在用，
界面上要说「手上没有牌价，没有重算」而不是「无变化」；`invalidPriceKeys` 是牌价表里形状不对的那几行的键，用到它们的路由保留原价，界面上列出来。

**厂家（maker）**：`model_prices.maker` 是模型是谁做的（`openai` / `anthropic` / `google` / …，开放集合，见 `@demux/common` `maker.ts`），
与渠道（vendor / queueGroup）无关。判定按模型键而不是按源——阿里云也转售 `glm-5.2` / `kimi-k3`，厂家仍是智谱 / Moonshot。
**重算跟着改动走，页面上没有「全量重算」按钮（2026-11）**：改一个家族的分组定价，后端只重算这个渠道里这个家族的别名；
改一条别名的定价只重算这一条；牌价变了后端自己全量重算。别的家族、别的别名不在范围里，既不重算，也不计入结果里的「相同未动」。

**方向是模型名映射到价格表**：价格表登记的是厂家发布的模型，与下游用了哪些别名无关，
所以 `by-maker` 不带路由侧字段（`routeCount` / `vendorKeys` / 「在用但未定价」）。
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

## 模型价格（组件设置 · OneApi，2026-11）

| 项 | 值 |
| --- | --- |
| 路由 | `/components/oneapi/ratecard`（`/components`、`/components/oneapi`、旧的 `/yomi/pricing` 都跳到它） |
| 权限 | 看：`platform.settings.read`；新建 / 改 / 删 / 同步 / 接管：`platform.settings.write` |
| 视图 | `src/features/platform/components/oneapi/views/RatecardView.vue` |
| Port | `OneApiRatecardPort`（`src/features/platform/components/oneapi/services/ports`） |

表的主人是 OneApi 的号池后台。它自己登记到 Consul、自己声明路由，平台网关验完身份直接把 `/oneapi/vault/v1/ratecard/{rest}`
转给它的 `/v1/ratecard/{rest}`，不经 Bff：成功的回包就是号池后台的 JSON（不包信封），失败也是它自己按平台的标准错误回的
（它拒的是 `reason: "oneapi_vault_rejected"`，原话在 `errors.upstream[0]`；它不在线时是平台网关回的 502 / 503，没有原因码）；
时间是 Unix 毫秒，值为 null 的字段不写出来。接口上 GET 不用登录（牌价是公开的），POST / PUT / DELETE 要 Staff 且有
`platform.settings.write`——上表的「看」权限管的是这一页进不进得去。

开发反代（`vite.config.ts`）因此多一条 `/oneapi` → 网关。

页面上没有「发布」「导入」，也不显示发布和转发的状态：每个写操作号池后台当场发布，没发出去的它自己定时重发；
牌价的来源是上游同步，不从别处搬表。平台的 Bff 上那个转发状态的接口（`GET /admin/components/oneapi/ratecard/relay`）页面不再用。

| 业务动作 | Port 方法 | HTTP | 端点（前缀 `/oneapi/vault/v1/ratecard`） |
| --- | --- | --- | --- |
| 整张表，按厂家分组 / 搜索 | `listByMaker` | GET | `/catalog/by-maker?keyword` → `{ items: [{ maker, items }], total }` |
| 新建前查重 | `find` | GET | `/catalog/{modelKey}`（没有回 404） |
| 新建 / 改价 | `upsert` | PUT | `/catalog`：改价带 `id`（改的就是那一行，键不动），新建不带（键会收成干净名） |
| 删除 | `remove` | DELETE | `/catalog/{id}` |
| 上游同步 | `fetchCandidates` → `applyCandidates` | POST | `/sync/fetch`（只读）→ 勾选 → `/sync/apply` |
| 接管发布 | `takeover` | POST | `/publish?takeover=true`（只在登记的主人是别的库时，由提示里的按钮来点） |

每个写操作的回包都带 `publish: { ok, written, deleted, unchanged, failures: [{ maker, error }] }`。`ok = false` 时表里的改动是成了的，
只是没发布出去：页面顶上留一块提示逐条列出厂家和原因（`maker` 是 `*` 的写成「整张表」），
那个厂家之后发布成了、或者手动关掉才消失；发布成了的时候页面上什么都不提。

行是 `{ id, modelKey, maker, billingType, rate, currency, capabilities?, source, sourceRef?, fetchedAtUtc?, effectiveFromUtc }`。
`rate` 原样留着：页面按 Yomi 那七种形状读来显示和填表单，读不出来的行照样列出来（能删、不能改）；
改价时表单里没有的键（按 token 计价的图像入出价、按次计价的缓存命中价）从原来的 `rate` 上带回去，不丢。
