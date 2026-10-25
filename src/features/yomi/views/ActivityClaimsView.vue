<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { useListQuery } from '@/shared/composables/useListQuery';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import { getYomiActivityPort, getYomiActivityRewardPort } from '../services';
import { activityTitle } from '../model/activity.types';
import { DEFAULT_LOCALE, messageKeys, type LocaleMessages } from '../model/activityMessages';
import {
  CLAIM_STATUSES,
  SHIPPING_COMPANIES,
  claimStatusLabels,
  claimStatusTagType,
  rewardTypeLabels,
  type ActivityClaim,
  type ActivityReward,
  type ClaimDelivery,
  type ClaimStatus,
} from '../model/activityReward.types';

/**
 * 一场活动的领取记录：实物在这里发货，代金券发放中或失败的在这里重试。
 * 卡密只显示末四位，明文只有领到的用户自己能看。
 */
const route = useRoute();
const activityPort = getYomiActivityPort();
const rewardPort = getYomiActivityRewardPort();

const activityId = computed(() => String(route.params.id));
const title = ref('');
const rewards = ref<ActivityReward[]>([]);
/** 默认语言的语言包，登记项和选项的名称从这里取 */
const pack = ref<LocaleMessages>({});

interface PageFilter {
  accountUid: string;
  dateRange: [string, string] | null;
  rewardId: string;
  status: ClaimStatus | 'all';
}

// 默认不限时间：一场活动的领取记录本来就在活动期内，不像充值记录那样需要先收窄到近 24 小时。
const defaultFilter = (): PageFilter => ({ accountUid: '', dateRange: null, rewardId: 'all', status: 'all' });

const filter = ref<PageFilter>(defaultFilter());

const list = useListQuery({
  filter,
  filterKey: () => JSON.stringify(filter.value),
  fetcher: ({ page, pageSize, filter: f }) => {
    const { fromUtc, toUtc } = dateRangeToEpochMillis(f.dateRange);
    const uid = f.accountUid.trim();
    return rewardPort.claims(activityId.value, {
      page,
      pageSize,
      rewardId: f.rewardId === 'all' ? null : f.rewardId,
      status: f.status === 'all' ? null : f.status,
      // 后端按数字精确匹配；没输完整的 UID 先不带，免得请求直接报错。
      accountUid: /^\d+$/.test(uid) ? uid : null,
      fromUtc: fromUtc ?? null,
      toUtc: toUtc ?? null,
    });
  },
  pageSize: 20,
});

const rows = computed(() => list.items.value?.items ?? []);

function resetFilter(): void {
  filter.value = defaultFilter();
}

onMounted(async () => {
  const [a, r, m] = await Promise.all([
    activityPort.get(activityId.value),
    rewardPort.list(activityId.value),
    activityPort.messages(activityId.value),
  ]);
  if (a.success) title.value = activityTitle(a.data);
  if (r.success) rewards.value = r.data;
  if (m.success) pack.value = m.data[DEFAULT_LOCALE] ?? {};
});

/** 用户填的登记项，按奖励里的顺序，名称和选项都换成文字；奖励后来删掉的登记项也照样列出来。 */
function answersOf(c: ActivityClaim): { label: string; value: string }[] {
  const answers = c.answers;
  if (!answers) return [];
  const reward = rewards.value.find((x) => x.id === c.rewardId);
  const fields = reward?.form?.fields ?? [];
  const ids = [...fields.map((f) => f.id).filter((id) => id in answers), ...Object.keys(answers).filter((id) => !fields.some((f) => f.id === id))];
  return ids.map((id) => {
    const field = fields.find((f) => f.id === id);
    const answer = answers[id]!;
    const option = (v: string) => (field && 'options' in field ? pack.value[messageKeys.registrationOption(c.rewardKey, id, v)] || v : v);
    return {
      label: pack.value[messageKeys.registrationField(c.rewardKey, id)] || id,
      value: Array.isArray(answer) ? answer.map(option).join('、') : option(answer),
    };
  });
}

function detail(d: ClaimDelivery): string {
  switch (d.type) {
    case 'code':
      return d.hint ? `卡密尾号 ${d.hint}` : '';
    case 'voucher':
      return d.userVoucherId ? `用户券 ${d.userVoucherId}` : '';
    case 'physical':
      return d.shipment ? `${d.shipment.company} ${d.shipment.trackingNo}` : '';
  }
}

async function copyAnswers(c: ActivityClaim): Promise<void> {
  try {
    await navigator.clipboard.writeText(answersOf(c).map((a) => `${a.label}：${a.value}`).join('\n'));
    ElMessage.success('登记信息已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

// ---------------- 发货 ----------------

const ship = reactive({ open: false, claim: null as ActivityClaim | null, company: '', trackingNo: '', saving: false });

const shipAnswers = computed(() => (ship.claim ? answersOf(ship.claim) : []));

function openShip(c: ActivityClaim): void {
  const shipment = c.delivery.type === 'physical' ? c.delivery.shipment : null;
  Object.assign(ship, { open: true, claim: c, company: shipment?.company ?? '', trackingNo: shipment?.trackingNo ?? '' });
}

async function submitShip(): Promise<void> {
  if (!ship.claim) return;
  if (!ship.company.trim() || !ship.trackingNo.trim()) {
    ElMessage.warning('快递公司和单号都要填');
    return;
  }
  ship.saving = true;
  try {
    const r = await rewardPort.ship(ship.claim.id, ship.company.trim(), ship.trackingNo.trim());
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success('已登记发货，用户在「我的奖品」里能看到单号');
    ship.open = false;
    void list.refresh();
  } finally {
    ship.saving = false;
  }
}

// ---------------- 重试 ----------------

const retrying = ref<string | null>(null);

async function retry(c: ActivityClaim): Promise<void> {
  retrying.value = c.id;
  try {
    const r = await rewardPort.retry(c.id);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    if (r.data.status === 'granted') ElMessage.success('已发放');
    else ElMessage.warning(`仍未成功：${r.data.failureReason ?? claimStatusLabels[r.data.status]}`);
    void list.refresh();
  } finally {
    retrying.value = null;
  }
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <el-breadcrumb class="claims-crumb">
        <el-breadcrumb-item :to="{ name: 'yomi-activities' }">
          活动中心
        </el-breadcrumb-item>
        <el-breadcrumb-item>{{ title || '活动' }}</el-breadcrumb-item>
        <el-breadcrumb-item>领取记录</el-breadcrumb-item>
      </el-breadcrumb>
      <PageHeader :title="title ? `领取记录 · ${title}` : '领取记录'" />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.accountUid"
        v-model:date-range="filter.dateRange"
        :loading="list.loading.value"
        @refresh="list.refresh()"
        @reset="resetFilter()"
      >
        <el-form-item label="奖励">
          <el-select v-model="filter.rewardId">
            <el-option
              label="全部奖励"
              value="all"
            />
            <el-option
              v-for="r in rewards"
              :key="r.id"
              :label="r.name"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status">
            <el-option
              label="全部状态"
              value="all"
            />
            <el-option
              v-for="st in CLAIM_STATUSES"
              :key="st"
              :label="claimStatusLabels[st]"
              :value="st"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="list.loading.value"
      :data="rows"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="领取时间"
        width="150"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          {{ formatDateTime(row.createdAtUtc) }}
        </template>
      </el-table-column>
      <el-table-column
        label="账户 UID"
        width="120"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          <span class="mono">{{ row.accountUid }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="奖励"
        min-width="180"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          <div class="cell-reward">
            <span>{{ row.rewardName }}</span>
            <span class="cell-reward__sub">{{ rewardTypeLabels[row.delivery.type] }} · {{ row.rewardKey }}<template v-if="row.seq > 1"> · 第 {{ row.seq }} 次</template></span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="状态"
        width="96"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          <el-tooltip
            :content="row.failureReason ?? ''"
            :disabled="!row.failureReason"
          >
            <el-tag
              size="small"
              :type="claimStatusTagType[row.status]"
              effect="light"
            >
              {{ claimStatusLabels[row.status] }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column
        label="详情"
        min-width="260"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          <div
            v-if="row.delivery.type === 'physical'"
            class="cell-form"
          >
            <span
              v-for="a in answersOf(row)"
              :key="a.label"
              class="cell-form__line"
            ><span class="cell-form__label">{{ a.label }}</span>{{ a.value }}</span>
            <span
              v-if="row.delivery.shipment"
              class="cell-form__track"
            >{{ row.delivery.shipment.company }} {{ row.delivery.shipment.trackingNo }}</span>
          </div>
          <span v-else>{{ detail(row.delivery) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="150"
        fixed="right"
      >
        <template #default="{ row }: { row: ActivityClaim }">
          <template v-if="row.delivery.type === 'physical'">
            <el-button
              link
              type="primary"
              @click="openShip(row)"
            >
              {{ row.status === 'shipped' ? '改单号' : '发货' }}
            </el-button>
            <template v-if="answersOf(row).length">
              <el-divider direction="vertical" />
              <el-button
                link
                @click="copyAnswers(row)"
              >
                复制登记
              </el-button>
            </template>
          </template>
          <el-button
            v-else-if="row.canRetry"
            link
            type="warning"
            :loading="retrying === row.id"
            @click="retry(row)"
          >
            重试发放
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState title="暂无领取记录" />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>

    <el-dialog
      v-model="ship.open"
      title="登记发货"
      width="420px"
      append-to-body
    >
      <dl
        v-if="shipAnswers.length"
        class="ship-to"
      >
        <template
          v-for="a in shipAnswers"
          :key="a.label"
        >
          <dt>{{ a.label }}</dt>
          <dd>{{ a.value }}</dd>
        </template>
      </dl>
      <el-form label-position="top">
        <el-form-item label="快递公司">
          <el-select
            v-model="ship.company"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入"
            style="width: 100%"
          >
            <el-option
              v-for="c in SHIPPING_COMPANIES"
              :key="c"
              :label="c"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="快递单号">
          <el-input
            v-model="ship.trackingNo"
            maxlength="64"
            @keyup.enter="submitShip"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ship.open = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="ship.saving"
          @click="submitShip"
        >
          确认发货
        </el-button>
      </template>
    </el-dialog>
  </FillListPageLayout>
</template>

<style scoped>
.claims-crumb {
  margin-bottom: 14px;
}
.mono {
  font-family: var(--el-font-family-mono, monospace);
}
.cell-reward,
.cell-form {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}
.cell-reward__sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.cell-form__line {
  font-size: 12px;
  white-space: pre-wrap;
}
.cell-form__label {
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}
.cell-form__track {
  font-size: 11px;
  color: var(--el-color-success);
}
.ship-to {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.6;
}
.ship-to dt {
  color: var(--el-text-color-secondary);
}
.ship-to dd {
  margin: 0;
  white-space: pre-wrap;
}
</style>
