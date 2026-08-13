import { computed, ref, type ComputedRef, type Ref } from 'vue';

import { getDemuxLogsPort } from '@/features/demux/services';
import type { BillReverseCode } from '@demux/common';

/**
 * 批量驳回账单的前端编排。
 *
 * 后端没有批量端点：账单驳回是「一条日志 → 一条账单」的事务，逐条调用才能保证
 * 某条失败不牵连其它条（重复驳回、账单不存在都是常见的部分失败）。这里做三件事：
 *  1. 把粘贴的文本解析成去重后的账单号清单，明显不合法的行直接标出来不发请求；
 *  2. 用 `resolveByBillSerials` 一次把账单号换成日志号（驳回接口的入参是日志号）；
 *  3. 串行逐条驳回，逐行回显结果，失败的账单号可以复制出来重试。
 *
 * 条数不设上限：数量大时靠串行 + 进度条 + 随时可停来控制风险，
 * 而不是拦着不让提交。
 */

/** 账单号：`BL` + UTC 日期（8 位）+ 序列（9 位起，序列溢出时会更长）。 */
const BILL_SERIAL_PATTERN = /^BL\d{17,}$/;

/** 一次解析多少个账单号。后端按 IN 查询，太长的参数列表容易打到网关的 body 限制。 */
const RESOLVE_CHUNK_SIZE = 200;

export type BatchReverseStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'not_found'
  | 'invalid';

export interface BatchReverseRow {
  billSerialNo: string;
  status: BatchReverseStatus;
  /** 失败 / 未找到时的说明；成功行为空。 */
  message?: string;
}

export interface ParsedBillSerials {
  rows: BatchReverseRow[];
  /** 被去掉的重复行数，用于给用户一个「我少了几行」的解释。 */
  duplicateCount: number;
}

export interface BatchReverseSummary {
  total: number;
  success: number;
  failed: number;
  notFound: number;
  invalid: number;
  pending: number;
}

/**
 * 把粘贴的文本切成账单号清单。
 *
 * 按行分割是主约定，但运营常从表格 / 聊天记录里复制，会混进逗号、分号、空格，
 * 所以顺带把这些也当分隔符；大小写统一成大写（账单号本身是大写前缀）。
 */
export function parseBillSerials(text: string): ParsedBillSerials {
  const seen = new Set<string>();
  const rows: BatchReverseRow[] = [];
  let duplicateCount = 0;

  for (const token of text.split(/[\s,;，；]+/)) {
    const serial = token.trim().toUpperCase();
    if (!serial) continue;
    if (seen.has(serial)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(serial);
    rows.push(
      BILL_SERIAL_PATTERN.test(serial)
        ? { billSerialNo: serial, status: 'pending' }
        : { billSerialNo: serial, status: 'invalid', message: '账单号格式不正确' },
    );
  }

  return { rows, duplicateCount };
}

export interface BatchReverseInput {
  reasonCode: BillReverseCode;
  remark?: string;
}

export interface UseBatchReverseBills {
  rows: Ref<BatchReverseRow[]>;
  duplicateCount: Ref<number>;
  running: Ref<boolean>;
  /** 至少跑过一轮，用于决定是否展示结果区。 */
  executed: Ref<boolean>;
  summary: ComputedRef<BatchReverseSummary>;
  /** 已出结果的行数 / 总行数，喂给进度条。 */
  progress: ComputedRef<number>;
  parse(text: string): void;
  run(input: BatchReverseInput): Promise<void>;
  cancel(): void;
  reset(): void;
  /** 失败 + 未找到的账单号，按行拼接，便于复制后重试。 */
  retryableText(): string;
}

export function useBatchReverseBills(): UseBatchReverseBills {
  const logsPort = getDemuxLogsPort();

  const rows = ref<BatchReverseRow[]>([]);
  const duplicateCount = ref(0);
  const running = ref(false);
  const executed = ref(false);
  let cancelled = false;

  const summary = computed<BatchReverseSummary>(() => {
    const s: BatchReverseSummary = {
      total: rows.value.length,
      success: 0,
      failed: 0,
      notFound: 0,
      invalid: 0,
      pending: 0,
    };
    for (const row of rows.value) {
      switch (row.status) {
        case 'success':
          s.success += 1;
          break;
        case 'failed':
          s.failed += 1;
          break;
        case 'not_found':
          s.notFound += 1;
          break;
        case 'invalid':
          s.invalid += 1;
          break;
        default:
          s.pending += 1;
      }
    }
    return s;
  });

  const progress = computed(() => {
    const total = rows.value.length;
    if (total === 0) return 0;
    const settled = total - summary.value.pending;
    return Math.round((settled / total) * 100);
  });

  function parse(text: string): void {
    const parsed = parseBillSerials(text);
    rows.value = parsed.rows;
    duplicateCount.value = parsed.duplicateCount;
    executed.value = false;
  }

  function reset(): void {
    rows.value = [];
    duplicateCount.value = 0;
    executed.value = false;
    cancelled = false;
  }

  function cancel(): void {
    cancelled = true;
  }

  function settle(row: BatchReverseRow, status: BatchReverseStatus, message?: string): void {
    row.status = status;
    row.message = message;
  }

  async function resolveLogIds(targets: BatchReverseRow[]): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    for (let i = 0; i < targets.length; i += RESOLVE_CHUNK_SIZE) {
      if (cancelled) break;
      const chunk = targets.slice(i, i + RESOLVE_CHUNK_SIZE);
      const result = await logsPort.resolveByBillSerials(chunk.map((it) => it.billSerialNo));
      if (!result.success) {
        // 整批解析失败（鉴权 / 网络）：这一段全部标失败，剩余分片继续，
        // 让用户至少拿到「哪些成了」的确定结论。
        for (const row of chunk) settle(row, 'failed', result.error.message);
        continue;
      }
      for (const ref of result.data) resolved.set(ref.billSerialNo, ref.logId);
    }
    return resolved;
  }

  async function run(input: BatchReverseInput): Promise<void> {
    if (running.value) return;
    const targets = rows.value.filter((r) => r.status === 'pending');
    if (targets.length === 0) return;

    running.value = true;
    executed.value = true;
    cancelled = false;
    try {
      const resolved = await resolveLogIds(targets);

      const queue: Array<{ row: BatchReverseRow; logId: string }> = [];
      for (const row of targets) {
        if (row.status !== 'pending') continue;
        const logId = resolved.get(row.billSerialNo);
        if (!logId) {
          settle(row, 'not_found', '未找到该账单对应的调用日志');
          continue;
        }
        queue.push({ row, logId });
      }

      // 严格串行：每条都是钱包写事务，逐条提交才能保证出问题时「停」得干净，
      // 也不会因为并发把线上计费写入拖慢。
      for (const item of queue) {
        if (cancelled) break;
        item.row.status = 'running';
        const result = await logsPort.reverse({
          logId: item.logId,
          reasonCode: input.reasonCode,
          ...(input.remark ? { remark: input.remark } : {}),
        });
        if (result.success) settle(item.row, 'success');
        else settle(item.row, 'failed', result.error.message);
      }

      // 取消时把「已置 running 但没跑完」的行退回待处理，避免卡在中间态
      for (const row of rows.value) {
        if (row.status === 'running') settle(row, 'pending');
      }
    } finally {
      running.value = false;
    }
  }

  function retryableText(): string {
    return rows.value
      .filter((r) => r.status === 'failed' || r.status === 'not_found')
      .map((r) => r.billSerialNo)
      .join('\n');
  }

  return {
    rows,
    duplicateCount,
    running,
    executed,
    summary,
    progress,
    parse,
    run,
    cancel,
    reset,
    retryableText,
  };
}
