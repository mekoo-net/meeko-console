# DemuxAI 数据表设计（渠道 / 供应商模型 / 映射）

本文描述管理台与调度 BFF 共用的**关系型库表**约定。

- **渠道主键** `providers.id`：**UUID v7**。
- **供应商模型主键** `provider_model.id`：**UUID v7**（单行表示「某渠道下的一个可路由模型实体」；计费/对外可与该 UUID 对齐，或由应用另挂业务 slug）。
- **枚举入库**：`api_type`、`status`、`auto_disabled_code`、`family` 均使用 **`SMALLINT`**，取值见 **§9**（与 `enums.ts` / `provider.types.ts` 语义对齐，整数码由后端统一维护）。

---

## 1. 实体关系概览

```
providers (1) ──< provider_model (N)
       │                    ^
       │                    │ provider_model.id
       └──< provider_model_mappings >──┘
       │
       └──< provider_runtime_stats (1:1 或 1:多按版本策略) >
```

- **渠道** `providers`：凭据、接入配置、调度字段；**不含**探测延迟 / 24h 错误率等易变指标（见拆表）。
- **供应商模型** `provider_model`：归属某 `provider_id`；主键 **`id`**（UUID v7）；**`model_name`** 为调用上游时写入请求体 `model` 字段的**技术名**（与上游 `/v1/models` 或文档一致）。
- **映射** `provider_model_mappings`：在某 `provider_id` 下，通过 **`provider_model_id` → `provider_model.id`** 关联一行模型；**`display_name`** 为**真正展示给终端用户的名称**（列表、控制台、对客文案等）。发往上游的 `model` 字符串由 **`provider_model.model_name`** 提供（按外键查 `provider_model` 即可），**不**再在本表存一份「上游 model id」冗余列。
- **运行指标** `provider_runtime_stats`：原 `providers` 上的探测与 24h 聚合字段，按渠道拆分。

---

## 2. 表：`providers`（渠道 / 供应商）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `UUID` | PK | UUID v7 |
| `name` | `VARCHAR(64)` | NOT NULL | 展示名 |
| `api_type` | `SMALLINT` | NOT NULL | 协议族枚举码，见 §9.1 |
| `base_url` | `VARCHAR(512)` | NOT NULL | 上游 Base URL |
| `api_key` | `TEXT` | NOT NULL | **明文** API Key（按产品决策） |
| `weight` | `SMALLINT` | NOT NULL, CHECK 0–100 | 同 `priority` 池内加权 |
| `priority` | `INT` | NOT NULL | 调度优先级，越大越优先 |
| `status` | `SMALLINT` | NOT NULL | 渠道状态枚举码，见 §9.2 |
| `auto_disabled_code` | `SMALLINT` | NULL | 仅 `status = auto_disabled` 时有意义；枚举码见 §9.3 |
| `notes` | `VARCHAR(500)` | NULL | 备注 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

**索引建议**

- `INDEX idx_providers_status_priority (status, priority DESC)`。

**说明**

- 列表接口的 `api_key_masked` 由应用层从 `api_key` 计算，不必落库。

---

## 3. 表：`provider_runtime_stats`（渠道运行指标，从 `providers` 拆出）

一行对应一个 `provider_id`（若需保留历史可改为按日分区表；默认「当前快照」一行）。

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `provider_id` | `UUID` | PK, FK → `providers.id` | 与渠道 1:1 |
| `test_latency_ms` | `INT` | NULL | 最近一次探测延迟（ms） |
| `test_succeeded_at` | `TIMESTAMPTZ` | NULL | 最近一次探测成功时间 |
| `error_rate_24h` | `DECIMAL(5,4)` | NULL | 24h 错误率 0..1 |
| `call_count_24h` | `BIGINT` | NULL | 24h 调用次数 |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | 聚合或探测回写时间 |

**级联**

- `ON DELETE CASCADE`：删除渠道则删除对应统计行。

---

## 4. 表：`provider_model`（按供应商归属的模型）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `UUID` | PK | UUID v7；全局唯一 |
| `provider_id` | `UUID` | NOT NULL, FK → `providers.id` | 所属供应商 |
| `model_name` | `VARCHAR(128)` | NOT NULL | 上游请求体中的 **`model` 技术名**（与上游约定一致）；调度发往上游时使用本列 |
| `family` | `SMALLINT` | NOT NULL | 模型族枚举码，固定集合，见 §9.4 |
| `capabilities` | `JSONB` | NOT NULL | 能力标签数组 |
| `visible_min_tier` | `SMALLINT` | NOT NULL, DEFAULT 1 | 最低可见等级 |
| `max_context_tokens` | `INT` | NOT NULL | 上下文上限 |
| `max_output_tokens` | `INT` | NULL | 单次输出上限；NULL 时由应用约定 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

已**不包含**别名表；多名称需求可通过多条 **`provider_model_mappings`**（不同 `display_name`）指向同一 `provider_model_id` 实现，或由应用层规则扩展。

**索引建议**

- `INDEX idx_provider_model_provider_family (provider_id, family)`。
- **`INDEX idx_provider_model_lookup (provider_id, id, model_name)`**：便于后台按渠道 + 主键 + 技术名检索。

---

## 5. 表：`provider_model_mappings`（渠道内上架子集 + 对客展示名）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `UUID` | PK | 行 id，建议 UUID v7 |
| `provider_id` | `UUID` | NOT NULL, FK → `providers.id` | 须与 `provider_model.provider_id` 一致（应用层或触发器校验） |
| `provider_model_id` | `UUID` | NOT NULL, FK → `provider_model.id` | 关联供应商模型主键 |
| `display_name` | `VARCHAR(128)` | NOT NULL | **对终端用户展示的真实名称**（产品名、营销名等） |
| `mapping_weight` | `SMALLINT` | NOT NULL, DEFAULT 100, CHECK 0–100 | 同 `(provider_id, provider_model_id)` 多行分流时使用 |
| `enabled` | `BOOLEAN` | NOT NULL, DEFAULT TRUE | 软关闭 |
| `sort_order` | `INT` | NOT NULL, DEFAULT 0 | UI 排序 |
| `notes` | `VARCHAR(500)` | NULL | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | |

**调度语义**

1. 用户或网关根据业务选中 **`provider_model_mappings.display_name`**（或内部先解析到 `provider_model_id`）。  
2. 通过 **`provider_model_id`** 读取 **`provider_model.model_name`**，作为上游 HTTP 请求 body 中的 **`model`** 字段。  
3. **`display_name`** 仅用于展示与运营配置，**不**默认等同于上游 `model` 字符串。

**唯一约束（二选一）**

- 每渠道每个供应商模型一条上架记录：`UNIQUE (provider_id, provider_model_id)`。  
- 若允许**同一** `provider_model_id` 在同一渠道下配置**多条**映射（例如不同 `display_name` 的套餐名指向同一上游技术名）：`UNIQUE (provider_id, provider_model_id, display_name)`，并去掉上一行的唯一约束。

**索引建议**

- `INDEX idx_mappings_provider (provider_id)`。  
- **`INDEX idx_mappings_provider_model_display (provider_id, provider_model_id, display_name)`**：列表与排重。

---

## 6. 外键与级联（建议）

| 子表 | 行为 |
|------|------|
| `provider_runtime_stats.provider_id` | `ON DELETE CASCADE` |
| `provider_model.provider_id` | `ON DELETE CASCADE` |
| `provider_model_mappings.provider_id` | `ON DELETE CASCADE` |
| `provider_model_mappings.provider_model_id` | `ON DELETE CASCADE` 或 `RESTRICT` |

---

## 7. 与现有 TypeScript 命名对照（迁移时注意改名）

| 代码 / 旧文档 | 表 / 列 |
|----------------|---------|
| `Provider.uid` | `providers.id` |
| `Provider.apiType` | `providers.api_type`（SMALLINT） |
| `Provider.status` | `providers.status`（SMALLINT） |
| `Provider.autoDisabledCode` | `providers.auto_disabled_code`（SMALLINT） |
| `Model.modelId`（原字符串） | `provider_model.id`（**UUID**） |
| `Model.displayName`（对客） | `provider_model_mappings.display_name` |
| 上游 `model` 技术名 | `provider_model.model_name` |
| `Model.family` | `provider_model.family`（SMALLINT） |
| `Provider.modelMappings[].platformModelId` | `provider_model_mappings.provider_model_id`（= `provider_model.id`） |
| ~~`Provider.modelMappings[].upstreamModelId`~~ | 由 **`provider_model.model_name`** 承担，不再单独存映射列 |
| 探测 / 24h 指标 | `provider_runtime_stats.*` |

---

## 8. DDL 示例（PostgreSQL）

```sql
-- §9 枚举由应用层/CHECK 维护

CREATE TABLE providers (
  id UUID PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  api_type SMALLINT NOT NULL,
  base_url VARCHAR(512) NOT NULL,
  api_key TEXT NOT NULL,
  weight SMALLINT NOT NULL CHECK (weight >= 0 AND weight <= 100),
  priority INT NOT NULL,
  status SMALLINT NOT NULL,
  auto_disabled_code SMALLINT,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_providers_status_priority ON providers (status, priority DESC);

CREATE TABLE provider_runtime_stats (
  provider_id UUID PRIMARY KEY REFERENCES providers (id) ON DELETE CASCADE,
  test_latency_ms INT,
  test_succeeded_at TIMESTAMPTZ,
  error_rate_24h DECIMAL(5,4),
  call_count_24h BIGINT,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE provider_model (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  model_name VARCHAR(128) NOT NULL,
  family SMALLINT NOT NULL,
  capabilities JSONB NOT NULL,
  visible_min_tier SMALLINT NOT NULL DEFAULT 1,
  max_context_tokens INT NOT NULL,
  max_output_tokens INT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_provider_model_provider_family ON provider_model (provider_id, family);
CREATE INDEX idx_provider_model_lookup ON provider_model (provider_id, id, model_name);

CREATE TABLE provider_model_mappings (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  provider_model_id UUID NOT NULL REFERENCES provider_model (id) ON DELETE CASCADE,
  display_name VARCHAR(128) NOT NULL,
  mapping_weight SMALLINT NOT NULL DEFAULT 100 CHECK (mapping_weight >= 0 AND mapping_weight <= 100),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_provider_model_mapping UNIQUE (provider_id, provider_model_id)
);

CREATE INDEX idx_mappings_provider ON provider_model_mappings (provider_id);
CREATE INDEX idx_mappings_provider_model_display ON provider_model_mappings (provider_id, provider_model_id, display_name);
```

若允许同一 `provider_model_id` 在同一渠道下多条映射（不同 `display_name`），将唯一约束改为：

```sql
CONSTRAINT uq_provider_model_display UNIQUE (provider_id, provider_model_id, display_name)
```

---

## 9. 枚举取值表（SMALLINT）

整数码 **必须与后端常量表一致**；下列为建议占位，落地时以服务端 `const` / 迁移种子为准。

### 9.1 `api_type`（对齐 `apiTypeValues`）

| 值 | 含义（`ApiType`） |
|----|-------------------|
| `1` | `openai` |
| `2` | `anthropic` |
| `3` | `gemini` |
| `4` | `azure_openai` |
| `5` | `baidu_qianfan` |
| `6` | `aliyun_dashscope` |
| `7` | `volcengine_ark` |
| `8` | `tencent_hunyuan` |
| `9` | `zhipu_glm` |
| `10` | `deepseek` |
| `11` | `moonshot` |
| `12` | `minimax` |
| `13` | `siliconflow` |
| `14` | `self_hosted_openai_compat` |

### 9.2 `status`（对齐 `providerStatusValues`）

| 值 | 含义 |
|----|------|
| `1` | `enabled` |
| `2` | `disabled` |
| `3` | `auto_disabled` |

### 9.3 `auto_disabled_code`（对齐 `providerAutoDisabledCodeLabel` 键）

| 值 | 含义（键名） |
|----|----------------|
| `1` | `upstream_5xx_burst` |
| `2` | `auth_failed` |
| `3` | `quota_exceeded` |
| `4` | `network_unreachable` |
| `5` | `rate_limited` |
| `6` | `manual_recovery_required` |

`status != 3` 时 **`auto_disabled_code` 应为 NULL**。

### 9.4 `family`（对齐 `modelFamilyValues` 顺序）

| 值 | 含义（`ModelFamily`） |
|----|------------------------|
| `1` | `gpt` |
| `2` | `claude` |
| `3` | `gemini` |
| `4` | `qwen` |
| `5` | `doubao` |
| `6` | `glm` |
| `7` | `deepseek` |
| `8` | `llama` |
| `9` | `mistral` |
| `10` | `embedding` |
| `11` | `image` |
| `12` | `audio` |
| `13` | `other` |

新增家族时在表尾递增，**禁止复用已删除的旧码**。

---

## 10. UUID v7

- `providers.id`、`provider_model.id`、`provider_model_mappings.id` 建议使用 UUID v7，由应用或数据库扩展生成。

---

文档版本：`provider_model` 主键列为 **`id`**；**`family`** 为 SMALLINT；映射表 **`display_name`** 为对客展示名，上游 **`model`** 使用 **`provider_model.model_name`**（经 **`provider_model_id`** 外键查询）；已移除 **`model_aliases`** 与 **`upstream_model_catalog`**；`api_key` 仍为明文存储。
