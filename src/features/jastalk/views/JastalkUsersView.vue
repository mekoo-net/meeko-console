<script setup lang="ts">
/**
 * Jastalk 用户：进过 Jastalk 的平台账号（浏览器 onboarding 落的行），按最近上线倒序。
 * 这里只有 Jastalk 自己知道的：什么时候来的、最近什么时候在、积分、停没停用。名字和邮箱在平台账户页看。
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime, fromNow } from '@/shared/lib/date';

import UserPointsDrawer from '../components/UserPointsDrawer.vue';
import { usePagedList } from '../composables/usePagedList';
import type { JastalkUser } from '../model/jastalk.types';
import { formatPoints, parseAccountUid } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const port = getJastalkAdminPort();

type BlockedFilter = 'all' | 'active' | 'blocked';
const blank = (): { uid: string; blocked: BlockedFilter } => ({ uid: '', blocked: 'all' });
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<JastalkUser>((p) => {
  const uid = parseAccountUid(filter.value.uid);
  if (!uid.ok) return Promise.resolve(fail({ code: 'validation', message: '账户 UID 只能是数字' }));
  const blocked = filter.value.blocked === 'all' ? undefined : filter.value.blocked === 'blocked';
  return port.listUsers({ accountUid: uid.value, blocked }, p);
});

function reset(): void {
  filter.value = blank();
  reload();
}

// ─── 积分 ────────────────────────────────────────────────

const pointsOf = ref<number | null>(null);

// ─── 停用 / 恢复 ─────────────────────────────────────────

const toggling = ref<number | null>(null);

async function toggleBlocked(row: JastalkUser): Promise<void> {
  const blocking = row.blockedAt === null;
  try {
    await ElMessageBox.confirm(
      blocking
        ? `停用账号 ${row.accountUid}？停用后他连不上 Jastalk、也发不了消息；正在回的那一句照常回完、照常扣积分。积分和聊天记录都留着。`
        : `恢复账号 ${row.accountUid}？恢复后他可以照常使用。`,
      blocking ? '停用账号' : '恢复账号',
      { type: 'warning', confirmButtonText: blocking ? '停用' : '恢复', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  toggling.value = row.accountUid;
  try {
    const r = await port.setBlocked(row.accountUid, blocking);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(blocking ? '已停用' : '已恢复');
    await load();
  } finally {
    toggling.value = null;
  }
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="用户" />
    </template>

    <template #filters>
      <el-form
        inline
        class="filters"
        @submit.prevent="reload"
      >
        <el-form-item label="账户 UID">
          <el-input
            v-model="filter.uid"
            placeholder="精确匹配"
            clearable
            class="filters__uid"
            @keyup.enter="reload"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.blocked"
            class="filters__status"
            @change="reload"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              label="正常"
              value="active"
            />
            <el-option
              label="已停用"
              value="blocked"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            @click="reload"
          >
            查询
          </el-button>
          <el-button @click="reset">
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="accountUid"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="账户 UID"
        min-width="140"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <span class="mono">{{ row.accountUid }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="可用积分"
        width="150"
        align="right"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <div class="cell-stack cell-stack--end">
            <span class="num">{{ formatPoints(row.pointsAvailable) }}</span>
            <span
              v-if="row.pointsHeld > 0"
              class="cell-sub num"
              title="进行中的调用冻着的"
            >冻结 {{ formatPoints(row.pointsHeld) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="加入时间"
        width="160"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <span class="cell-date">{{ formatDateTime(row.joinedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="最近上线"
        width="130"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <span
            class="cell-date"
            :title="formatDateTime(row.lastSeenAt, 'YYYY-MM-DD HH:mm:ss')"
          >{{ fromNow(row.lastSeenAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="150"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <el-tag
            v-if="row.blockedAt === null"
            size="small"
            type="success"
            effect="plain"
          >
            正常
          </el-tag>
          <el-tag
            v-else
            size="small"
            type="danger"
            effect="plain"
            :title="`停用于 ${formatDateTime(row.blockedAt, 'YYYY-MM-DD HH:mm:ss')}`"
          >
            已停用 · {{ fromNow(row.blockedAt) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="140"
        align="center"
        fixed="right"
      >
        <template #default="{ row }: { row: JastalkUser }">
          <el-button
            link
            type="primary"
            @click="pointsOf = row.accountUid"
          >
            积分
          </el-button>
          <el-button
            link
            :type="row.blockedAt === null ? 'danger' : 'primary'"
            :loading="toggling === row.accountUid"
            @click="toggleBlocked(row)"
          >
            {{ row.blockedAt === null ? '停用' : '恢复' }}
          </el-button>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的用户"
          description="调整筛选条件或重置后重试。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <UserPointsDrawer
    :account-uid="pointsOf"
    @close="pointsOf = null"
    @changed="load"
  />
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}

.filters :deep(.el-form-item) {
  margin-bottom: 0;
}

.filters__uid {
  width: 180px;
}

.filters__status {
  width: 120px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.cell-stack--end {
  align-items: flex-end;
}
</style>
