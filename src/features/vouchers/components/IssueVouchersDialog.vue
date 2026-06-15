<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Search, Ticket } from '@element-plus/icons-vue';

import LargeDialog from '@/shared/ui/LargeDialog.vue';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';
import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';
import { ACHIEVEMENT_CATALOG, findAchievementDef } from '@/features/accounts/model/achievementCatalog';
import { debounce } from '@/shared/lib/debounce';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  VoucherDeductKind,
  VoucherScopeKind,
  VoucherValidityKind,
  applyModeLabels,
  deductKindLabels,
  type IssueVouchersResult,
  type VoucherTemplate,
} from '../model/voucher.types';
import { getVoucherPort } from '../services';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  issued: [result: IssueVouchersResult];
}>();

const voucherPort = getVoucherPort();
const accountPort = getAccountAdminPort();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

/* ---------------- 抵扣券信息卡片 ---------------- */

function ruleSummary(t: VoucherTemplate): string {
  const r = t.rule;
  if (r.kind === VoucherDeductKind.NoThreshold) return `无门槛减 ${formatMoney(r.faceValue)}`;
  if (r.kind === VoucherDeductKind.FullReduction)
    return `满 ${formatMoney(r.thresholdAmount)} 减 ${formatMoney(r.faceValue)}`;
  const pct = Math.round(r.discountRate * 100) / 10;
  return `满 ${formatMoney(r.thresholdAmount)} 打 ${pct} 折（封顶 ${formatMoney(r.capValue)}）`;
}

function validitySummary(t: VoucherTemplate): string {
  const v = t.validity;
  if (v.kind === VoucherValidityKind.RelativeDays) return `领取后 ${v.days} 天`;
  return `${formatDateTime(v.fromUtc)} ~ ${formatDateTime(v.toUtc)}`;
}

function scopeSummary(t: VoucherTemplate): string {
  if (t.scopeKind === VoucherScopeKind.AllProducts) return '全部产品';
  return t.scopeProductCodes.length ? t.scopeProductCodes.join('、') : '指定产品';
}

/* ---------------- 候选 / 已选 ---------------- */

const submitting = ref(false);

// 候选用户：服务端按 关键字 / 等级 / 徽章 筛选 + 分页（只刷新候选表格）。
const candidateAccounts = ref<Account[]>([]);
const candidateLoading = ref(false);
const candidatePage = ref(1);
const candidatePageSize = 10;
const candidateTotal = ref(0);

const filters = reactive({
  keyword: '',
  tier: '' as number | '',
  badge: '',
});

// 已选用户：纯客户端维护 + 客户端分页。
const selected = ref<Account[]>([]);
const selectedUids = computed(() => new Set(selected.value.map((a) => a.uid)));
const selectedPage = ref(1);
const selectedPageSize = 10;
const selectedView = computed<Account[]>(() => {
  const start = (selectedPage.value - 1) * selectedPageSize;
  return selected.value.slice(start, start + selectedPageSize);
});

function tierName(tier: number): string {
  return TIER_THRESHOLDS.find((t) => t.level === tier)?.name ?? `Lv${tier}`;
}

function badgeIcons(account: Account): string {
  return (account.achievementCodes ?? [])
    .map((code) => findAchievementDef(code)?.icon ?? '')
    .filter(Boolean)
    .join(' ');
}

function accountEmail(a: Account): string {
  return a.owner.email ?? '';
}

function isSelected(uid: string): boolean {
  return selectedUids.value.has(uid);
}

function addAccount(a: Account): void {
  if (isSelected(a.uid)) return;
  selected.value = [...selected.value, a];
}

function removeAccount(uid: string): void {
  selected.value = selected.value.filter((a) => a.uid !== uid);
  const lastPage = Math.max(1, Math.ceil(selected.value.length / selectedPageSize));
  if (selectedPage.value > lastPage) selectedPage.value = lastPage;
}

function addPage(): void {
  for (const a of candidateAccounts.value) addAccount(a);
}

async function loadCandidates(): Promise<void> {
  candidateLoading.value = true;
  try {
    const keyword = filters.keyword.trim();
    const r = await accountPort.listAccounts({
      page: candidatePage.value,
      pageSize: candidatePageSize,
      filter: {
        accountUid: /^\d+$/.test(keyword) ? keyword : '',
        contactKeyword: /^\d+$/.test(keyword) ? '' : keyword,
        type: 'all',
        status: 'active',
        tier: filters.tier === '' ? null : filters.tier,
        badgeCode: filters.badge || undefined,
      },
    });
    if (r.success) {
      candidateAccounts.value = r.data.items;
      candidateTotal.value = r.data.total;
    } else {
      candidateAccounts.value = [];
      candidateTotal.value = 0;
      ElMessage.error(r.error.message);
    }
  } finally {
    candidateLoading.value = false;
  }
}

const debouncedReload = debounce(() => {
  candidatePage.value = 1;
  void loadCandidates();
}, 300);

watch(() => filters.keyword, () => debouncedReload());
watch(
  () => [filters.tier, filters.badge],
  () => {
    candidatePage.value = 1;
    void loadCandidates();
  },
);

function onCandidatePageChange(page: number): void {
  candidatePage.value = page;
  void loadCandidates();
}

function reset(): void {
  filters.keyword = '';
  filters.tier = '';
  filters.badge = '';
  selected.value = [];
  selectedPage.value = 1;
  candidatePage.value = 1;
  void loadCandidates();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset();
  },
);

async function onSubmit(): Promise<void> {
  if (!props.template) return;
  const accountUids = selected.value.map((a) => a.uid);
  if (accountUids.length === 0) {
    ElMessage.warning('请先选择至少一个账户');
    return;
  }
  submitting.value = true;
  try {
    const r = await voucherPort.issue(props.template.id, { accountUids });
    if (r.success) {
      ElMessage.success(`已发放 ${r.data.issuedCount} / ${r.data.requestedCount} 张`);
      emit('issued', r.data);
      visible.value = false;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <LargeDialog
    v-model="visible"
    title="下发抵扣券"
  >
    <div class="issue-wrap lg-fill">
      <section
        v-if="template"
        class="voucher-card"
      >
        <div class="voucher-card__main">
          <div class="voucher-card__icon">
            <el-icon><Ticket /></el-icon>
          </div>
          <div class="voucher-card__head">
            <div class="voucher-card__title">
              <span class="voucher-card__name">{{ template.name }}</span>
              <el-tag
                size="small"
                type="primary"
                effect="dark"
                round
              >
                {{ deductKindLabels[template.rule.kind] }}
              </el-tag>
            </div>
            <div class="voucher-card__rule">{{ ruleSummary(template) }}</div>
          </div>
          <el-tag
            size="small"
            type="info"
            effect="plain"
            class="voucher-card__code"
          >
            {{ template.code }}
          </el-tag>
        </div>
        <dl class="voucher-card__grid">
          <div class="vc-field">
            <dt>有效期</dt>
            <dd>{{ validitySummary(template) }}</dd>
          </div>
          <div class="vc-field">
            <dt>适用范围</dt>
            <dd>{{ scopeSummary(template) }}</dd>
          </div>
          <div
            v-if="template.rule.kind === VoucherDeductKind.Discount"
            class="vc-field"
          >
            <dt>抵扣周期</dt>
            <dd>{{ applyModeLabels[template.applyMode] }}</dd>
          </div>
          <div class="vc-field">
            <dt>已发放</dt>
            <dd>
              {{ template.issuedCount }}<span v-if="template.totalQuota"> / {{ template.totalQuota }}</span>
            </dd>
          </div>
          <div class="vc-field">
            <dt>每户限领</dt>
            <dd>{{ template.perUserLimit ?? '不限' }}</dd>
          </div>
        </dl>
      </section>

      <div class="panes lg-fill">
        <!-- 候选用户 -->
        <section class="pane">
          <header class="pane__head">
            <span class="pane__title">候选用户</span>
            <span class="pane__count">共 {{ candidateTotal }}</span>
          </header>

          <div class="filters">
            <el-input
              v-model="filters.keyword"
              :prefix-icon="Search"
              placeholder="搜索 用户ID / 邮箱 / 名称"
              clearable
              size="small"
              class="filters__kw"
            />
            <el-select
              v-model="filters.tier"
              placeholder="等级"
              clearable
              size="small"
              class="filters__tier"
            >
              <el-option
                v-for="t in TIER_THRESHOLDS"
                :key="t.level"
                :label="t.name"
                :value="t.level"
              />
            </el-select>
            <el-select
              v-model="filters.badge"
              placeholder="徽章"
              clearable
              filterable
              size="small"
              class="filters__badge"
            >
              <el-option
                v-for="b in ACHIEVEMENT_CATALOG"
                :key="b.code"
                :label="`${b.icon} ${b.name}`"
                :value="b.code"
              />
            </el-select>
            <el-button
              size="small"
              :disabled="candidateAccounts.length === 0"
              @click="addPage"
            >
              添加本页
            </el-button>
          </div>

          <el-table
            v-loading="candidateLoading"
            :data="candidateAccounts"
            size="small"
            height="100%"
            row-key="uid"
            class="pane__table"
            :empty-text="'无匹配用户'"
          >
            <el-table-column
              label="用户"
              min-width="180"
            >
              <template #default="{ row }: { row: Account }">
                <div class="u">
                  <span class="u__name">{{ row.displayName }}</span>
                  <span class="u__meta">
                    {{ row.uid }}<template v-if="accountEmail(row)"> · {{ accountEmail(row) }}</template>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="等级"
              width="64"
            >
              <template #default="{ row }: { row: Account }">
                {{ tierName(row.tier) }}
              </template>
            </el-table-column>
            <el-table-column
              label="徽章"
              width="80"
            >
              <template #default="{ row }: { row: Account }">
                <span class="u__badges">{{ badgeIcons(row) || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="76"
              fixed="right"
            >
              <template #default="{ row }: { row: Account }">
                <el-button
                  v-if="!isSelected(row.uid)"
                  link
                  type="primary"
                  :icon="Plus"
                  @click="addAccount(row)"
                >
                  添加
                </el-button>
                <span
                  v-else
                  class="u__added"
                >已添加</span>
              </template>
            </el-table-column>
          </el-table>

          <footer class="pane__foot">
            <el-pagination
              :current-page="candidatePage"
              :page-size="candidatePageSize"
              :total="candidateTotal"
              layout="total, prev, pager, next"
              background
              small
              @current-change="onCandidatePageChange"
            />
          </footer>
        </section>

        <!-- 已选用户 -->
        <section class="pane">
          <header class="pane__head">
            <span class="pane__title">已选用户</span>
            <span class="pane__count">共 {{ selected.length }}</span>
          </header>

          <el-table
            :data="selectedView"
            size="small"
            height="100%"
            row-key="uid"
            class="pane__table pane__table--selected"
            :empty-text="'尚未选择用户'"
          >
            <el-table-column
              label="用户"
              min-width="180"
            >
              <template #default="{ row }: { row: Account }">
                <div class="u">
                  <span class="u__name">{{ row.displayName }}</span>
                  <span class="u__meta">
                    {{ row.uid }}<template v-if="accountEmail(row)"> · {{ accountEmail(row) }}</template>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column
              label="等级"
              width="64"
            >
              <template #default="{ row }: { row: Account }">
                {{ tierName(row.tier) }}
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="76"
              fixed="right"
            >
              <template #default="{ row }: { row: Account }">
                <el-button
                  link
                  type="danger"
                  @click="removeAccount(row.uid)"
                >
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <footer class="pane__foot">
            <el-pagination
              v-model:current-page="selectedPage"
              :page-size="selectedPageSize"
              :total="selected.length"
              layout="total, prev, pager, next"
              background
              small
            />
          </footer>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="issue-foot">
        <span class="foot-hint">将向已选 {{ selected.length }} 个账户各发放 1 张（重复下发幂等不重复）</span>
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="selected.length === 0"
          @click="onSubmit"
        >
          下发（{{ selected.length }}）
        </el-button>
      </div>
    </template>
  </LargeDialog>
</template>

<style scoped>
.issue-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 顶部抵扣券信息卡片 */
.voucher-card {
  flex: none;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(
    135deg,
    var(--el-color-primary-light-9),
    var(--el-fill-color-lighter) 70%
  );
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.voucher-card__main {
  display: flex;
  align-items: center;
  gap: 12px;
}
.voucher-card__icon {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  background: var(--el-color-primary);
  box-shadow: 0 4px 10px var(--el-color-primary-light-5);
}
.voucher-card__head {
  flex: 1;
  min-width: 0;
}
.voucher-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.voucher-card__name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.voucher-card__rule {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.voucher-card__code {
  flex: none;
  font-family: var(--el-font-family-mono, monospace);
}
.voucher-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px 18px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color);
}
.vc-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vc-field dt {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.vc-field dd {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

/* 两栏：候选 / 已选 */
.panes {
  display: flex;
  gap: 14px;
  min-height: 0;
}
.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-bg-color);
}
.pane__head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
.pane__title {
  font-weight: 600;
}
.pane__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.filters {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}
.filters__kw {
  flex: 1;
  min-width: 120px;
}
.filters__tier {
  width: 92px;
}
.filters__badge {
  width: 120px;
}
.pane__table {
  flex: 1;
  min-height: 0;
}
.pane__foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.u {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.u__name {
  font-weight: 500;
}
.u__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.u__badges {
  letter-spacing: 1px;
}
.u__added {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.issue-foot {
  display: flex;
  align-items: center;
  gap: 12px;
}
.foot-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: auto;
}
</style>
