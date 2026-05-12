/**
 * Meeko 平台所有 uid 都是 Snowflake/long（int64）。
 * 浏览器 number 只能安全表达 53bit，**必须**统一用 string 承载，避免精度截断。
 *
 * 约定：
 * - 类型层：`type Uid = string`
 * - 接到 JSON 时直接保留字符串（后端 ASP.NET 默认对 long 序列化为 number；
 *   将来 HttpAdapter 必须用 `bigint` reviver 或 axios 自定义反序列化把它转 string）。
 * - Mock 内存自增 id 也直接生成 string。
 */
export type Uid = string;

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

/** 严格判断字符串是不是合法 long uid（只允许 1+ digit，无前导 0、不超过 19 位）。 */
export function isUid(value: unknown): value is Uid {
  if (typeof value !== 'string' || value.length === 0 || value.length > 19) return false;
  if (value.length > 1 && value[0] === '0') return false;
  for (const ch of value) {
    if (!isDigit(ch)) return false;
  }
  return true;
}

/** 把 number/string/bigint 都收敛成 string 形式的 Uid。null/undefined → undefined。 */
export function toUid(value: unknown): Uid | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return isUid(value) ? value : undefined;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
    return value.toString();
  }
  if (typeof value === 'bigint' && value > 0n) {
    return value.toString();
  }
  return undefined;
}

/** Mock 用：内存自增器，从一个起点开始，输出符合 Uid 约束的字符串。 */
export function createUidSeq(start: number = 1_000_000): () => Uid {
  let n = BigInt(start);
  return () => {
    n += 1n;
    return n.toString();
  };
}

/**
 * Mock 用：简化版雪花 ID 生成器，按时间有序、单调递增。
 *
 * 真实雪花 ID 结构 = `[41bit ms timestamp][10bit machine][12bit seq]`，
 * 这里前端 Mock 用 `[ms timestamp][4-digit seq]` 的 18 位字符串，
 * 既能保证按时间排序，也契合后端 long 形态。
 *
 * 适用：账单 / 充值等"按时间序"流水主键。
 */
export function createSnowflakeIdSeq(): () => Uid {
  let lastTs = 0n;
  let seq = 0n;
  return () => {
    let ts = BigInt(Date.now());
    if (ts === lastTs) {
      seq = (seq + 1n) & 0xfffn;
      if (seq === 0n) {
        ts = lastTs + 1n;
      }
    } else {
      seq = 0n;
    }
    lastTs = ts;
    const seqStr = seq.toString().padStart(4, '0');
    return `${ts.toString()}${seqStr}`;
  };
}
