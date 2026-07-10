<script setup lang="ts">
/**
 * DemuxAI 系统设置 —— 速率设置（Token 速率限制）。
 *
 * 顶部分三个 Tab：
 * - 全局设置：总开关 + 产品默认策略（所有账户未单独覆盖时生效）
 * - 账户设置：按账户的独立策略，优先于全局默认
 * - IP 设置：平台级单 IP 限制（与账户无关，独立开关）
 *
 * 每条账户策略三个维度（0 = 不限）：
 * - 请求数 / 窗口：单位时间内的请求总数（含失败）
 * - 成功数 / 窗口：单位时间内的成功响应数（成功 = 实际计费成功）
 * - 并发数：同时在途请求数上限
 * 请求 / 成功共用同一统计窗口（秒 / 分钟 / 小时）。
 * 账户限制按账户统计（不区分 Token），保存后由网关解析 Token 时读取生效；
 * IP 限制由网关在 sk- 鉴权之前按客户端 IP 执行（无 key / 无效 key 的请求同样计入）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Delete, Refresh } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import RateLimitAccountDialog from '@/features/demuxai/components/RateLimitAccountDialog.vue';
import { formatDateTime } from '@/shared/lib/date';
import type {
  AccountRateLimitOverride,
  IpRateLimitSettings,
  IpRateOverride,
  RateLimitPolicy,
} from '@/features/demuxai/model/rateLimit.types';
import { getDemuxaiRateLimitPort } from '@/features/demuxai/services';
import { getAccountAdminPort } from '@/features/accounts/services';
import { accountTypeLabel, type Account, type AccountType } from '@/features/accounts/model/account.types';

const port = getDemuxaiRateLimitPort();
const accountPort = getAccountAdminPort();

interface AccountBrief {
  displayName: string;
  email: string;
  type: AccountType;
}

/** UID → 账户展示信息（用于覆盖表格展示，按需异步解析）。 */
const accountMap = reactive<Record<string, AccountBrief>>({});
const dialogOpen = ref(false);
const existingUids = computed(() => state.overrides.map((o) => o.accountUid));

function typeLabel(brief?: AccountBrief): string {
  return brief ? accountTypeLabel[brief.type] : '';
}

const windowUnits = [
  { value: 'second', label: '秒' },
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
] as const;

const activeTab = ref<'global' | 'account' | 'ip'>('global');
const loading = ref(false);
const saving = ref(false);
const updatedAtUtc = ref(0);
const snapshot = ref<string>('');

function emptyPolicy(): RateLimitPolicy {
  return { windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxSuccesses: 0, maxConcurrency: 0 };
}

function emptyIp(): IpRateLimitSettings {
  return { enabled: false, windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxConcurrency: 0, overrides: [] };
}

function emptyIpOverride(): IpRateOverride {
  return { ip: '', enabled: true, windowValue: 1, windowUnit: 'minute', maxRequests: 0, maxConcurrency: 0 };
}

function addIpOverride(): void {
  state.ip.overrides.unshift(emptyIpOverride());
}

function removeIpOverride(row: IpRateOverride): void {
  const idx = state.ip.overrides.indexOf(row);
  if (idx >= 0) state.ip.overrides.splice(idx, 1);
}

const state = reactive<{
  enabled: boolean;
  defaultPolicy: RateLimitPolicy;
  overrides: AccountRateLimitOverride[];
  ip: IpRateLimitSettings;
}>({
  enabled: true,
  defaultPolicy: emptyPolicy(),
  overrides: [],
  ip: emptyIp(),
});

function policyTuple(p: RateLimitPolicy): unknown[] {
  return [p.windowValue, p.windowUnit, p.maxRequests, p.maxSuccesses, p.maxConcurrency];
}

function ipTuple(ip: IpRateLimitSettings): unknown[] {
  return [
    ip.enabled,
    ip.windowValue,
    ip.windowUnit,
    ip.maxRequests,
    ip.maxConcurrency,
    [...ip.overrides]
      .map((o) => [o.ip.trim(), o.enabled, o.windowValue, o.windowUnit, o.maxRequests, o.maxConcurrency])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ];
}

function serialize(
  enabled: boolean,
  defaultPolicy: RateLimitPolicy,
  overrides: AccountRateLimitOverride[],
  ip: IpRateLimitSettings,
): string {
  return JSON.stringify([
    enabled,
    policyTuple(defaultPolicy),
    [...overrides]
      .map((o) => [o.accountUid.trim(), o.enabled, policyTuple(o.policy)])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ipTuple(ip),
  ]);
}

const isDirty = computed(
  () => serialize(state.enabled, state.defaultPolicy, state.overrides, state.ip) !== snapshot.value,
);

function apply(
  enabled: boolean,
  defaultPolicy: RateLimitPolicy,
  overrides: AccountRateLimitOverride[],
  ip: IpRateLimitSettings,
): void {
  state.enabled = enabled;
  state.defaultPolicy = { ...defaultPolicy };
  state.overrides = overrides.map((o) => ({ accountUid: o.accountUid, enabled: o.enabled, policy: { ...o.policy } }));
  state.ip = { ...ip, overrides: ip.overrides.map((o) => ({ ...o })) };
  snapshot.value = serialize(enabled, defaultPolicy, overrides, ip);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get();
    if (r.success) {
      apply(r.data.enabled, r.data.defaultPolicy, r.data.overrides, r.data.ip);
      updatedAtUtc.value = r.data.updatedAtUtc;
      void resolveAccounts(r.data.overrides.map((o) => o.accountUid));
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

/** 解析覆盖列表里账户的展示信息（昵称 / 邮箱 / 类型）。 */
async function resolveAccounts(uids: string[]): Promise<void> {
  const pending = [...new Set(uids)].filter((uid) => uid && !(uid in accountMap));
  await Promise.all(
    pending.map(async (uid) => {
      const r = await accountPort.getAccount(uid);
      if (r.success) {
        accountMap[uid] = {
          displayName: r.data.displayName,
          email: r.data.owner.email ?? '',
          type: r.data.type,
        };
      }
    }),
  );
}

function onAccountPicked(account: Account): void {
  if (existingUids.value.includes(account.uid)) return;
  accountMap[account.uid] = {
    displayName: account.displayName,
    email: account.owner.email ?? '',
    type: account.type,
  };
  state.overrides.unshift({ accountUid: account.uid, enabled: true, policy: { ...state.defaultPolicy } });
}

function removeOverride(row: AccountRateLimitOverride): void {
  const idx = state.overrides.indexOf(row);
  if (idx >= 0) state.overrides.splice(idx, 1);
}

function reset(): void {
  void load();
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
    const max = addr.includes(':') ? 128 : 32;
    if (prefix > max) return false;
  }
  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(addr);
  const ipv6 = addr.includes(':') && /^[0-9a-fA-F:]+$/.test(addr);
  return ipv4 || ipv6;
}

function validate(): string | null {
  const defErr = validatePolicy(state.defaultPolicy, '默认策略');
  if (defErr) {
    activeTab.value = 'global';
    return defErr;
  }

  const seen = new Set<string>();
  for (const o of state.overrides) {
    const uid = o.accountUid.trim();
    const fail = (msg: string): string => {
      activeTab.value = 'account';
      return msg;
    };
    if (!uid) return fail('账户 Uid 不能为空。');
    if (!/^\d+$/.test(uid)) return fail(`账户 Uid 必须为数字：${uid}。`);
    if (uid === '0') return fail('账户 Uid 不能为 0（0 为产品默认）。');
    if (seen.has(uid)) return fail(`账户 Uid 重复：${uid}。`);
    seen.add(uid);
    const err = validatePolicy(o.policy, `账户 ${uid}`);
    if (err) return fail(err);
  }

  const ipFail = (msg: string): string => {
    activeTab.value = 'ip';
    return msg;
  };
  if (state.ip.windowValue < 1) return ipFail('IP 默认策略：统计窗口必须 ≥ 1。');
  if (state.ip.maxRequests < 0 || state.ip.maxConcurrency < 0) return ipFail('IP 默认策略：上限必须 ≥ 0。');

  const seenIp = new Set<string>();
  for (const o of state.ip.overrides) {
    const ip = o.ip.trim();
    if (!ip) return ipFail('IP 覆盖：地址不能为空。');
    if (!isValidIpOrCidr(ip)) return ipFail(`IP 覆盖：地址无效（需为精确 IP 或 CIDR 网段）：${ip}。`);
    if (seenIp.has(ip.toLowerCase())) return ipFail(`IP 覆盖地址重复：${ip}。`);
    seenIp.add(ip.toLowerCase());
    if (o.windowValue < 1) return ipFail(`IP ${ip}：统计窗口必须 ≥ 1。`);
    if (o.maxRequests < 0 || o.maxConcurrency < 0) return ipFail(`IP ${ip}：上限必须 ≥ 0。`);
  }
  return null;
}

async function save(): Promise<void> {
  if (!isDirty.value) return;
  const err = validate();
  if (err) {
    ElMessage.warning(err);
    return;
  }
  saving.value = true;
  try {
    const r = await port.update({
      enabled: state.enabled,
      defaultPolicy: { ...state.defaultPolicy },
      overrides: state.overrides.map((o) => ({ accountUid: o.accountUid.trim(), enabled: o.enabled, policy: { ...o.policy } })),
      ip: {
        ...state.ip,
        overrides: state.ip.overrides.map((o) => ({ ...o, ip: o.ip.trim() })),
      },
    });
    if (r.success) {
      apply(r.data.enabled, r.data.defaultPolicy, r.data.overrides, r.data.ip);
      updatedAtUtc.value = r.data.updatedAtUtc;
      ElMessage.success('已保存');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="速率设置"
    />

    <el-card v-loading="loading" shadow="never" class="rl-card">
      <el-alert
        v-if="isDirty"
        class="rl-alert"
        type="warning"
        show-icon
        :closable="false"
        title="有未保存的更改，请保存后生效。"
      />

      <el-tabs v-model="activeTab" class="rl-tabs">
        <!-- 全局设置 -->
        <el-tab-pane label="全局设置" name="global">
          <el-form
            label-width="140px"
            label-position="left"
            class="rl-form"
          >
            <el-form-item label="启用速率限制">
              <el-switch v-model="state.enabled" />
            </el-form-item>

            <el-collapse-transition>
              <div v-show="state.enabled">
                <el-form-item label="统计窗口">
                  <el-input v-model.number="state.defaultPolicy.windowValue" type="number" :min="1" class="rl-field">
                    <template #append>
                      <el-select v-model="state.defaultPolicy.windowUnit" class="rl-unit">
                        <el-option v-for="u in windowUnits" :key="u.value" :label="u.label" :value="u.value" />
                      </el-select>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item label="请求数 / 窗口">
                  <el-input-number v-model="state.defaultPolicy.maxRequests" :min="0" :step="10" controls-position="right" class="rl-field" />
                </el-form-item>

                <el-form-item label="成功数 / 窗口">
                  <el-input-number v-model="state.defaultPolicy.maxSuccesses" :min="0" :step="10" controls-position="right" class="rl-field" />
                </el-form-item>

                <el-form-item label="并发数">
                  <el-input-number v-model="state.defaultPolicy.maxConcurrency" :min="0" :step="1" controls-position="right" class="rl-field" />
                </el-form-item>
              </div>
            </el-collapse-transition>
          </el-form>
        </el-tab-pane>

        <!-- 账户设置 -->
        <el-tab-pane label="账户设置" name="account">
          <el-empty v-if="!state.enabled" description="速率限制已关闭" :image-size="76" />

          <div v-else class="ov">
            <div class="ov__head">
              <el-button :icon="Plus" type="primary" plain @click="dialogOpen = true">添加账户</el-button>
            </div>

            <el-table :data="state.overrides" class="ov-table" empty-text="暂无账户覆盖">
              <el-table-column label="账户" min-width="220">
                <template #default="{ row }">
                  <div class="acc-cell__name">
                    <span>{{ accountMap[row.accountUid]?.displayName || '未命名账户' }}</span>
                    <el-tag
                      v-if="accountMap[row.accountUid]"
                      size="small"
                      effect="plain"
                      :type="accountMap[row.accountUid]?.type === 'organization' ? 'warning' : 'info'"
                    >
                      {{ typeLabel(accountMap[row.accountUid]) }}
                    </el-tag>
                  </div>
                  <div class="acc-cell__sub">
                    UID: {{ row.accountUid }}
                    <template v-if="accountMap[row.accountUid]?.email"> · {{ accountMap[row.accountUid]?.email }}</template>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="启用" width="70" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.enabled" size="small" />
                </template>
              </el-table-column>

              <el-table-column label="统计窗口" min-width="180">
                <template #default="{ row }">
                  <el-input v-model.number="row.policy.windowValue" type="number" :min="1" :disabled="!row.enabled">
                    <template #append>
                      <el-select v-model="row.policy.windowUnit" :disabled="!row.enabled" class="rl-unit">
                        <el-option v-for="u in windowUnits" :key="u.value" :label="u.label" :value="u.value" />
                      </el-select>
                    </template>
                  </el-input>
                </template>
              </el-table-column>

              <el-table-column label="请求数 / 窗口" min-width="130">
                <template #default="{ row }">
                  <el-input-number v-model="row.policy.maxRequests" :min="0" :step="10" :disabled="!row.enabled" controls-position="right" class="ov-num" />
                </template>
              </el-table-column>

              <el-table-column label="成功数 / 窗口" min-width="130">
                <template #default="{ row }">
                  <el-input-number v-model="row.policy.maxSuccesses" :min="0" :step="10" :disabled="!row.enabled" controls-position="right" class="ov-num" />
                </template>
              </el-table-column>

              <el-table-column label="并发数" min-width="110">
                <template #default="{ row }">
                  <el-input-number v-model="row.policy.maxConcurrency" :min="0" :step="1" :disabled="!row.enabled" controls-position="right" class="ov-num" />
                </template>
              </el-table-column>

              <el-table-column label="操作" width="72" align="center">
                <template #default="{ row }">
                  <el-button :icon="Delete" type="danger" text @click="removeOverride(row)" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- IP 设置（平台级，与账户无关） -->
        <el-tab-pane label="IP 设置" name="ip">
          <el-form
            label-width="140px"
            label-position="left"
            class="rl-form"
          >
            <el-alert
              class="rl-ip-hint"
              type="info"
              show-icon
              :closable="false"
              title="平台级单 IP 限制：网关在 sk- 鉴权之前按客户端 IP 执行，无 key / 无效 key 的请求同样计入，用于抵御洪水与 key 爆破。"
            />

            <el-form-item label="启用 IP 限制">
              <el-switch v-model="state.ip.enabled" />
            </el-form-item>

            <el-collapse-transition>
              <div v-show="state.ip.enabled">
                <el-form-item label="统计窗口">
                  <el-input v-model.number="state.ip.windowValue" type="number" :min="1" class="rl-field">
                    <template #append>
                      <el-select v-model="state.ip.windowUnit" class="rl-unit">
                        <el-option v-for="u in windowUnits" :key="u.value" :label="u.label" :value="u.value" />
                      </el-select>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item label="请求数 / 窗口">
                  <el-input-number v-model="state.ip.maxRequests" :min="0" :step="10" controls-position="right" class="rl-field" />
                </el-form-item>

                <el-form-item label="并发数">
                  <el-input-number v-model="state.ip.maxConcurrency" :min="0" :step="1" controls-position="right" class="rl-field" />
                </el-form-item>
              </div>
            </el-collapse-transition>
          </el-form>

          <div v-show="state.ip.enabled" class="ov ov--ip">
            <div class="ov__head">
              <span class="ov__title">针对 IP 调整</span>
              <el-button :icon="Plus" type="primary" plain @click="addIpOverride">添加 IP</el-button>
            </div>

            <el-table :data="state.ip.overrides" class="ov-table" empty-text="暂无 IP 覆盖">
              <el-table-column label="IP / CIDR" min-width="190">
                <template #default="{ row }">
                  <el-input v-model="row.ip" placeholder="1.2.3.4 或 10.0.0.0/8" />
                </template>
              </el-table-column>

              <el-table-column label="启用" width="70" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.enabled" size="small" />
                </template>
              </el-table-column>

              <el-table-column label="统计窗口" min-width="180">
                <template #default="{ row }">
                  <el-input v-model.number="row.windowValue" type="number" :min="1" :disabled="!row.enabled">
                    <template #append>
                      <el-select v-model="row.windowUnit" :disabled="!row.enabled" class="rl-unit">
                        <el-option v-for="u in windowUnits" :key="u.value" :label="u.label" :value="u.value" />
                      </el-select>
                    </template>
                  </el-input>
                </template>
              </el-table-column>

              <el-table-column label="请求数 / 窗口" min-width="130">
                <template #default="{ row }">
                  <el-input-number v-model="row.maxRequests" :min="0" :step="10" :disabled="!row.enabled" controls-position="right" class="ov-num" />
                </template>
              </el-table-column>

              <el-table-column label="并发数" min-width="110">
                <template #default="{ row }">
                  <el-input-number v-model="row.maxConcurrency" :min="0" :step="1" :disabled="!row.enabled" controls-position="right" class="ov-num" />
                </template>
              </el-table-column>

              <el-table-column label="操作" width="72" align="center">
                <template #default="{ row }">
                  <el-button :icon="Delete" type="danger" text @click="removeIpOverride(row)" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>

      <RateLimitAccountDialog
        v-model="dialogOpen"
        :existing-uids="existingUids"
        @select="onAccountPicked"
      />

      <div class="rl-footer">
        <span v-if="updatedAtUtc && !isDirty" class="rl-footer__meta">
          最后保存 {{ formatDateTime(updatedAtUtc) }}
        </span>
        <el-button :icon="Refresh" text @click="load">刷新</el-button>
        <el-button :disabled="!isDirty" @click="reset">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!isDirty" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px - 52px);
  min-height: 480px;
}

.rl-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
}
.rl-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.rl-alert {
  margin: 16px 24px 0;
  width: auto;
}

.rl-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 24px 4px;
}
.rl-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}
.rl-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 全局设置表单 */
.rl-form {
  max-width: 760px;
}
.rl-ip-hint {
  margin-bottom: 18px;
}
.rl-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.rl-form :deep(.el-form-item__label) {
  color: var(--el-text-color-primary);
}
.rl-field {
  width: 220px;
}
.rl-unit {
  width: 80px;
}

/* 账户设置 */
.ov__head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 16px;
}
.ov--ip {
  margin-top: 8px;
}
.ov__title {
  margin-right: auto;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.ov-table {
  width: 100%;
}
.ov-num {
  width: 100%;
}
.acc-cell__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.acc-cell__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.rl-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.rl-footer__meta {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
