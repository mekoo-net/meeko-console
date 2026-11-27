import { z } from 'zod';

/**
 * OneApi 网关的过滤器，像防火墙的对象和策略：
 * - **分类器**（全站一份）：什么样的请求算哪一类——`chat.app`、`chat.tavern`、`agent.claude`……
 *   独立于 Vendor，自己不放行也不拒绝，只给过滤规则引用；
 * - **过滤器**（一个 Vendor 一张规则表）：每条规则一个条件、一个动作（放行 / 拒绝）。条件可以引用分类器，
 *   也可以直接写请求头条件。从上往下，第一条成立的说了算，都不成立走默认动作。
 *
 * 文档存在 Consul KV 上，OneApi 网关跟着它。这一页经平台网关直接找 OneApi 的号池后台读写它
 * （`/oneapi/vault/v1/filter`，不经 Bff），回包不包信封，字段照号池后台的 `FilterDtos.cs`。
 * 文档的形状和网关怎么读它，见 OneApi 仓库的 `src/OneApi.Gateway/request-filter.md`。
 *
 * 文档原样留着、不按形状收紧：网关以后多认一种写法，或者有人直接在 Consul 里加了这一页不认识的键，
 * 存回去的时候都得还在。所以每一层都是「认识的字段有类型，其余的照搬」。
 */

/** 一个分类器。`when` 是条件树，这一页用 `filter.ts` 里的函数读它。 */
export const filterClassifierSchema = z.looseObject({
  /** `类别.名称`，过滤规则按它引用，遥测里按它统计。 */
  id: z.string(),
  /** 给人看的名字，可以不写。 */
  name: z.string().optional(),
  when: z.unknown().optional(),
});
export type FilterClassifier = z.infer<typeof filterClassifierSchema>;

/** 一条过滤规则：条件成立就按 `action` 办。 */
export const filterRuleSchema = z.looseObject({
  /** 被拒时错误码里写的就是它（`filter_rejected.<id>`），上层按它决定扣不扣费。 */
  id: z.string(),
  /** 不写算开着。 */
  enabled: z.boolean().optional(),
  /** `allow` 或 `deny`。 */
  action: z.string(),
  when: z.unknown().optional(),
});
export type FilterRule = z.infer<typeof filterRuleSchema>;

/** 一个 Vendor 的过滤器。 */
export const filterChannelSchema = z.looseObject({
  /** 都没匹配上时：`allow`（不写也是它）或 `deny`。 */
  default: z.string().optional(),
  /** false = 只标记：判了拒绝的请求照常放行，只在遥测里记一笔。**不写算 true**（网关的规矩）。 */
  enforce: z.boolean().optional(),
  rules: z.array(filterRuleSchema).optional(),
});
export type FilterChannel = z.infer<typeof filterChannelSchema>;

export const filterDocSchema = z.looseObject({
  classifiers: z.array(filterClassifierSchema).optional(),
  /** 键是 vendorKey（不分大小写）。 */
  filters: z.record(z.string(), filterChannelSchema).optional(),
});
export type FilterDoc = z.infer<typeof filterDocSchema>;

/** 读回来的文档和版本号。还没有文档时号池后台两个都不带。 */
export const filterDocumentResponseSchema = z.object({
  value: filterDocSchema.nullish(),
  version: z.string().nullish(),
});

/** 页面上拿着的那一份：文档，和存的时候要带回去的版本号（还没有文档时是 null）。 */
export interface FilterSnapshot {
  doc: FilterDoc;
  version: string | null;
}

/**
 * 网关读不懂的一处。`subject` 是 `classifier 'id'` / `filter 'vendor'` / `filter 'vendor' rule 'id'` / `document`……，
 * `reason` 是英文的一句话。
 */
export const filterProblemSchema = z.object({
  subject: z.string(),
  reason: z.string(),
});
export type FilterProblem = z.infer<typeof filterProblemSchema>;

export const filterValidationResponseSchema = z.object({
  problems: z.array(filterProblemSchema),
});

/** 条件里能写什么：字段、每种字段能用的运算符、有哪些 Vendor。字段和运算符是网关的编译器自己报的。 */
export const filterSchemaResponseSchema = z.object({
  fields: z.array(z.object({ name: z.string(), kind: z.string() })),
  operators: z.record(z.string(), z.array(z.string())),
  vendors: z.array(z.object({ key: z.string(), displayName: z.string() })),
});
export type FilterSchema = z.infer<typeof filterSchemaResponseSchema>;
export type FilterVendor = FilterSchema['vendors'][number];
