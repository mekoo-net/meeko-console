import { z } from 'zod';

/**
 * OneApi 的请求分类器：按规则认出每个请求是什么（酒馆、小手机、Claude Code……），给它打一个标签。
 *
 * 规则是一份 JSON 文档，存在 Consul KV 上，OneApi 网关跟着它。这一页经平台网关直接找 OneApi 的号池后台读写它
 * （`/oneapi/vault/v1/classifier`，不经 Bff），回包不包信封，字段照号池后台的 `ClassifierDtos.cs`。
 * 文档的形状和网关怎么读它，见 OneApi 仓库的 `src/OneApi.Gateway/request-classifier.md`。
 *
 * 文档原样留着、不按形状收紧：网关以后多认一种写法，或者有人直接在 Consul 里加了这一页不认识的键
 * （比如渠道的放行和拒绝 `channels`），存回去的时候都得还在。所以规则和文档都是「认识的字段有类型，其余的照搬」。
 */

/** 一条规则。`when` 是条件树，这一页用 `classifier.ts` 里的函数读它。 */
export const classifierRuleSchema = z.looseObject({
  id: z.string(),
  label: z.string(),
  /** 不写算开着。 */
  enabled: z.boolean().optional(),
  /** 只管这些 vendor；不写 = 所有 vendor 通用。 */
  vendors: z.array(z.string()).optional(),
  when: z.unknown().optional(),
});
export type ClassifierRule = z.infer<typeof classifierRuleSchema>;

export const classifierDocSchema = z.looseObject({
  rules: z.array(classifierRuleSchema).optional(),
});
export type ClassifierDoc = z.infer<typeof classifierDocSchema>;

/** 读回来的文档和版本号。还没有文档时号池后台两个都不带。 */
export const classifierDocumentResponseSchema = z.object({
  value: classifierDocSchema.nullish(),
  version: z.string().nullish(),
});

/** 页面上拿着的那一份：文档，和存的时候要带回去的版本号（还没有文档时是 null）。 */
export interface ClassifierSnapshot {
  doc: ClassifierDoc;
  version: string | null;
}

/** 网关读不懂的一处：`subject` 是 `rule 'id'` / `rule #3` / `channel 'x'` / `document`，`reason` 是英文的一句话。 */
export const classifierProblemSchema = z.object({
  subject: z.string(),
  reason: z.string(),
});
export type ClassifierProblem = z.infer<typeof classifierProblemSchema>;

export const classifierValidationResponseSchema = z.object({
  problems: z.array(classifierProblemSchema),
});

/** 规则里能写什么：字段、每种字段能用的运算符、有哪些 vendor。字段和运算符是网关的编译器自己报的。 */
export const classifierSchemaResponseSchema = z.object({
  fields: z.array(z.object({ name: z.string(), kind: z.string() })),
  operators: z.record(z.string(), z.array(z.string())),
  vendors: z.array(z.object({ key: z.string(), displayName: z.string() })),
});
export type ClassifierSchema = z.infer<typeof classifierSchemaResponseSchema>;
export type ClassifierVendor = ClassifierSchema['vendors'][number];
