/**
 * 用量明细按「一件事」看。用户聊了一句、角色主动发了一条（唤醒）……背后是一条调用链：先翻记忆的向量、重排，
 * 再是对话模型，带语音、配图的还有语音合成、生图——一步一次调用，几步加起来才是这件事花的积分。
 * 所以管理端和用户那边的使用日志一样，一件事一行，点开看链上的每一次调用和它扣积分的依据
 * （2026-11-21 用户：「我们是对话或者唤醒，是调用链，会完成 N 次调用」）。
 *
 * 后端记的是一次结算一行（一次结算里可以有几条用量），这里按 actionId 归并：链上的一步 = 一条用量，按结算的先后排。
 */
import type { UsageLine, UsageLog, UsageStatus } from './jastalk.types';

export interface UsageCall {
  /** 链上第几步，从 1 起。 */
  step: number;
  line: UsageLine;
  /** 哪一次结算记的这一步。 */
  settlementId: number;
  at: number;
  /** 那一次结算上游成没成（同一次结算里的几条用量是一样的）。 */
  upstreamSuccess: boolean;
  traceId: string | null;
}

export interface UsageAction {
  actionId: string;
  accountUid: number;
  purpose: string;
  conversationId: string | null;
  /** 链上第一次结算的时间。 */
  at: number;
  /** 实扣的积分，几次结算加起来。 */
  amount: number;
  /** 一点都没扣（每一次都没产出、冻结整笔退回）是 voided。 */
  status: UsageStatus;
  /** 每一次上游都成了。 */
  upstreamSuccess: boolean;
  /** 几次结算（用来说明分页的缺口，页面不摆它）。 */
  settlements: number;
  calls: UsageCall[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 按 actionId 归并成一件事一行，新的在前；一件事里的调用按先后排。 */
export function groupUsageActions(logs: readonly UsageLog[]): UsageAction[] {
  const byAction = new Map<string, UsageLog[]>();
  for (const log of logs) {
    const list = byAction.get(log.actionId);
    if (list) list.push(log);
    else byAction.set(log.actionId, [log]);
  }

  const actions: UsageAction[] = [];
  for (const [actionId, list] of byAction) {
    const ordered = [...list].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    const first = ordered[0]!;
    const calls: UsageCall[] = [];
    for (const log of ordered) {
      for (const line of log.lines) {
        calls.push({
          step: calls.length + 1,
          line,
          settlementId: log.id,
          at: log.createdAt,
          upstreamSuccess: log.upstreamSuccess,
          traceId: log.traceId,
        });
      }
    }
    const amount = round2(ordered.reduce((s, l) => s + l.amount, 0));
    actions.push({
      actionId,
      accountUid: first.accountUid,
      purpose: first.purpose,
      conversationId: ordered.find((l) => l.conversationId)?.conversationId ?? null,
      at: first.createdAt,
      amount,
      status: amount > 0 ? 'charged' : 'voided',
      upstreamSuccess: ordered.every((l) => l.upstreamSuccess),
      settlements: ordered.length,
      calls,
    });
  }
  return actions.sort((a, b) => b.at - a.at || b.actionId.localeCompare(a.actionId));
}

/** 列表里写哪个模型：对话那一步的（一件事的主角）；没有对话的写最贵的那一步。 */
export function mainCall(action: UsageAction): UsageCall | null {
  const chats = action.calls.filter((c) => c.line.kind === 'chat');
  if (chats.length > 0) return chats[chats.length - 1]!;
  return action.calls.reduce<UsageCall | null>((best, c) => (!best || c.line.points > best.line.points ? c : best), null);
}

/** 逐次加起来应扣多少（取两位）；账上不够时扣到 0 为止，实扣会比它少。 */
export function dueAmount(action: UsageAction): number {
  return round2(action.calls.reduce((s, c) => s + c.line.points, 0));
}
