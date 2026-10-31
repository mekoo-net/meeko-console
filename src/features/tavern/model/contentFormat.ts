/**
 * 内容管理页共用的展示辅助。
 */
import { SessionKindLabel, type AccountRef, type RuleTrigger, type RuleVariable, type SessionRow } from './content.types';

/** 账户没起名时露 UID，列表里至少有个能拿去搜的东西。 */
export function accountName(account: AccountRef): string {
  return account.displayName || `UID ${account.uid}`;
}

/** 没起标题的规范频道（新闻墙、导演席）按种类叫。 */
export function sessionName(session: SessionRow): string {
  return session.name ?? SessionKindLabel[session.kind];
}

/** 头像加载不出来时显示的那个字。 */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 故事时刻是世界里的虚拟钟（`yyyy-MM-ddTHH:mm:ss`，不带时区），不能当 UTC 换算到本地，只换个读法。
 */
export function formatStoryAt(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}

export function jsonText(value: unknown): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// ─── 按形状分派 ──────────────────────────────────────────

/** 联合里每种形状一条处理函数：新加一种形状、这里漏了就编译不过。 */
type ByKind<U extends Record<K, string>, K extends keyof U, R> = { [V in U[K]]: (v: Extract<U, Record<K, V>>) => R };

/** TS 关联不起「这条处理函数」和「这个值」的形状，断言只在这一处。 */
function dispatch<U extends Record<K, string>, K extends keyof U, R>(table: ByKind<U, K, R>, key: K, value: U): R {
  return (table[value[key]] as (v: U) => R)(value);
}

const RuleRange: ByKind<RuleVariable, 'type', string> = {
  int: (v) => (v.min == null && v.max == null ? '' : `${v.min ?? '−∞'} ~ ${v.max ?? '∞'}`),
  bool: () => '',
  enum: (v) => v.values.join(' / '),
  state: (v) => v.states.join(' → '),
};

/** 变量的取值范围读成一句话；布尔和没限范围的整数为空。 */
export const ruleRange = (v: RuleVariable): string => dispatch(RuleRange, 'type', v);

const DayLabel: Readonly<Record<string, string>> = {
  mon: '一',
  tue: '二',
  wed: '三',
  thu: '四',
  fri: '五',
  sat: '六',
  sun: '日',
};

const TriggerText: ByKind<RuleTrigger, 'kind', string> = {
  change: (t) => `变量 ${t.change} 变化`,
  event: (t) => `事件 ${t.event}`,
  clock: (t) => `故事钟 ${t.days.length ? `每周${t.days.map((d) => DayLabel[d] ?? d).join('')}` : '每天'} ${t.clock}`,
};

/** 规则的触发源读成一句话。 */
export const triggerText = (t: RuleTrigger): string => dispatch(TriggerText, 'kind', t);
