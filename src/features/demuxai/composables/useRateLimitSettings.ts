import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

import type {
  IpRateOverride,
  RateLimitPolicy,
  RateLimitSettings,
} from '@/features/demux/model/rateLimit.types';
import { getDemuxaiRateLimitPort } from '@/features/demux/services';

export const windowUnits = [
  { value: 'second', label: '秒' },
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
] as const;

/** 可编辑草稿 = 服务端设置去掉只读的 updatedAtUtc。 */
type Draft = Omit<RateLimitSettings, 'updatedAtUtc'>;

export function emptyPolicy(): RateLimitPolicy {
  return { windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxSuccesses: 0, maxConcurrency: 0 };
}

export function emptyIpOverride(): IpRateOverride {
  return { ip: '', enabled: true, windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxConcurrency: 0 };
}

function cloneDraft(d: Draft): Draft {
  return {
    enabled: d.enabled,
    defaultPolicy: { ...d.defaultPolicy },
    overrides: d.overrides.map((o) => ({ ...o, policy: { ...o.policy } })),
    ip: { ...d.ip, overrides: d.ip.overrides.map((o) => ({ ...o })) },
  };
}

/*
 * 三个页面各自负责草稿的一个切片：
 * - 总开关页：enabled、ip.enabled、defaultPolicy、IP 默认策略字段
 * - 账户页：overrides
 * - IP 页：ip.overrides
 */

function switchesKey(d: Draft): string {
  return JSON.stringify([
    d.enabled,
    d.ip.enabled,
    d.defaultPolicy,
    d.ip.windowValue,
    d.ip.windowUnit,
    d.ip.maxRequests,
    d.ip.maxConcurrency,
  ]);
}

function accountKey(d: Draft): string {
  const overrides = d.overrides
    .map((o) => ({ ...o, accountUid: o.accountUid.trim() }))
    .sort((a, b) => a.accountUid.localeCompare(b.accountUid));
  return JSON.stringify(overrides);
}

function ipKey(d: Draft): string {
  const sorted = d.ip.overrides
    .map((o) => ({ ...o, ip: o.ip.trim() }))
    .sort((a, b) => a.ip.localeCompare(b.ip));
  return JSON.stringify(sorted);
}

const port = getDemuxaiRateLimitPort();

const draft = reactive<Draft>({
  enabled: true,
  defaultPolicy: emptyPolicy(),
  overrides: [],
  ip: { enabled: false, windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxConcurrency: 0, overrides: [] },
});

const baseline = ref<Draft | null>(null);
const updatedAtUtc = ref(0);
const loading = ref(false);
const saving = ref(false);

const loaded = computed(() => baseline.value !== null);

const isDirtySwitches = computed(() => baseline.value !== null && switchesKey(draft) !== switchesKey(baseline.value));
const isDirtyAccount = computed(() => baseline.value !== null && accountKey(draft) !== accountKey(baseline.value));
const isDirtyIp = computed(() => baseline.value !== null && ipKey(draft) !== ipKey(baseline.value));
const isDirty = computed(() => isDirtySwitches.value || isDirtyAccount.value || isDirtyIp.value);

function apply(settings: RateLimitSettings): void {
  draft.enabled = settings.enabled;
  draft.defaultPolicy = { ...settings.defaultPolicy };
  draft.overrides = settings.overrides.map((o) => ({ ...o, policy: { ...o.policy } }));
  draft.ip = { ...settings.ip, overrides: settings.ip.overrides.map((o) => ({ ...o })) };
  baseline.value = cloneDraft(draft);
  updatedAtUtc.value = settings.updatedAtUtc;
}

function resetSwitches(): void {
  const b = baseline.value;
  if (!b) return;
  draft.enabled = b.enabled;
  draft.defaultPolicy = { ...b.defaultPolicy };
  draft.ip.enabled = b.ip.enabled;
  draft.ip.windowValue = b.ip.windowValue;
  draft.ip.windowUnit = b.ip.windowUnit;
  draft.ip.maxRequests = b.ip.maxRequests;
  draft.ip.maxConcurrency = b.ip.maxConcurrency;
}

function resetAccount(): void {
  const b = baseline.value;
  if (!b) return;
  draft.overrides = b.overrides.map((o) => ({ ...o, policy: { ...o.policy } }));
}

function resetIp(): void {
  const b = baseline.value;
  if (!b) return;
  draft.ip.overrides = b.ip.overrides.map((o) => ({ ...o }));
}

function validatePolicy(p: RateLimitPolicy, label: string): string | null {
  if (p.windowValue < 1) return `${label}：统计窗口必须 ≥ 1。`;
  if (p.maxRequests < 0 || p.maxSuccesses < 0 || p.maxConcurrency < 0) return `${label}：上限必须 ≥ 0。`;
  return null;
}

/** 校验精确 IPv4/IPv6 或 CIDR 网段（仅前端粗校验，最终以后端为准）。 */
function isValidIpOrCidr(value: string): boolean {
  const slash = value.indexOf('/');
  const addr = slash < 0 ? value : value.slice(0, slash);
  if (slash >= 0) {
    const prefix = Number(value.slice(slash + 1));
    if (!Number.isInteger(prefix) || prefix < 0) return false;
    if (prefix > (addr.includes(':') ? 128 : 32)) return false;
  }
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(addr);
  const ipv6 = addr.includes(':') && /^[0-9a-fA-F:]+$/.test(addr);
  return ipv4 || ipv6;
}

function validateSwitchesSlice(): string | null {
  const accountErr = validatePolicy(draft.defaultPolicy, '账户默认策略');
  if (accountErr) return accountErr;
  if (draft.ip.windowValue < 1) return 'IP 默认策略：统计窗口必须 ≥ 1。';
  if (draft.ip.maxRequests < 0 || draft.ip.maxConcurrency < 0) return 'IP 默认策略：上限必须 ≥ 0。';
  return null;
}

function validateAccountSlice(): string | null {
  const seen = new Set<string>();
  for (const o of draft.overrides) {
    const uid = o.accountUid.trim();
    if (!uid) return '账户 Uid 不能为空。';
    if (!/^\d+$/.test(uid)) return `账户 Uid 必须为数字：${uid}。`;
    if (uid === '0') return '账户 Uid 不能为 0（0 为产品默认）。';
    if (seen.has(uid)) return `账户 Uid 重复：${uid}。`;
    seen.add(uid);
    const rowErr = validatePolicy(o.policy, `账户 ${uid}`);
    if (rowErr) return rowErr;
  }
  return null;
}

function validateIpSlice(): string | null {
  const seen = new Set<string>();
  for (const o of draft.ip.overrides) {
    const ip = o.ip.trim();
    if (!ip) return 'IP 覆盖：地址不能为空。';
    if (!isValidIpOrCidr(ip)) return `IP 覆盖：地址无效（需为精确 IP 或 CIDR 网段）：${ip}。`;
    if (seen.has(ip.toLowerCase())) return `IP 覆盖地址重复：${ip}。`;
    seen.add(ip.toLowerCase());
    if (o.windowValue < 1) return `IP ${ip}：统计窗口必须 ≥ 1。`;
    if (o.maxRequests < 0 || o.maxConcurrency < 0) return `IP ${ip}：上限必须 ≥ 0。`;
  }
  return null;
}

async function load(force = false): Promise<void> {
  if (loaded.value && !force) return;
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) apply(r.data);
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

/** 整包保存；提交前校验全部切片（PUT 为全量替换，任一页的脏数据都会随包提交）。 */
async function save(): Promise<void> {
  if (!isDirty.value) return;

  const err = validateSwitchesSlice() ?? validateAccountSlice() ?? validateIpSlice();
  if (err) {
    ElMessage.warning(err);
    return;
  }

  saving.value = true;
  try {
    const r = await port.update({
      enabled: draft.enabled,
      defaultPolicy: { ...draft.defaultPolicy },
      overrides: draft.overrides.map((o) => ({ ...o, accountUid: o.accountUid.trim(), policy: { ...o.policy } })),
      ip: { ...draft.ip, overrides: draft.ip.overrides.map((o) => ({ ...o, ip: o.ip.trim() })) },
    });
    if (r.success) {
      apply(r.data);
      ElMessage.success('已保存');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

export function useRateLimitSettings() {
  return {
    draft,
    loading,
    saving,
    loaded,
    updatedAtUtc,
    isDirty,
    isDirtySwitches,
    isDirtyAccount,
    isDirtyIp,
    load,
    save,
    resetSwitches,
    resetAccount,
    resetIp,
  };
}
