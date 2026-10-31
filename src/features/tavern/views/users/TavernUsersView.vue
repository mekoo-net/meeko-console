<script setup lang="ts">
/**
 * Tavern 用户：进过 Tavern 的玩家（客户端 onboarding 落的行），按最近活跃倒序，版式同调用日志页。
 * 点进去是这个人的用户视角：世界、角色卡、调用日志、积分。关键字搜平台账户的名字 / 邮箱 / 手机。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime, fromNow } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import { accountName, initialOf } from '../../model/contentFormat';
import { formatCredits, parseAccountUid } from '../../model/meteringFormat';
import type { TavernUser } from '../../model/users.types';
import { getTavernUsersPort } from '../../services';

const port = getTavernUsersPort();
const router = useRouter();

const blank = () => ({ uid: '', keyword: '' });
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<TavernUser>((p) => {
  const uid = parseAccountUid(filter.value.uid);
  return uid.ok
    ? port.list({ uid: uid.value, keyword: filter.value.keyword.trim() || undefined }, p)
    : Promise.resolve(fail({ code: 'validation', message: '账户 UID 只能是数字' }));
}, filter);

function open(row: TavernUser): void {
  void router.push({ name: 'tavern-user', params: { uid: String(row.account.uid) } });
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="用户" />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.uid"
        v-model:contact-keyword="filter.keyword"
        contact-keyword-label="关键字"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      />
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      :row-key="(row: TavernUser) => String(row.account.uid)"
      size="small"
      class="compact-table clickable-table"
      height="100%"
      :empty-text="' '"
      @row-click="open"
    >
      <el-table-column
        label="用户"
        min-width="220"
      >
        <template #default="{ row }: { row: TavernUser }">
          <div class="cell-user">
            <el-avatar
              :size="32"
              shape="square"
              class="cell-user__avatar"
            >
              {{ initialOf(accountName(row.account)) }}
            </el-avatar>
            <div class="cell-stack">
              <span class="cell-title">{{ accountName(row.account) }}</span>
              <span class="cell-uid">{{ row.account.uid }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="联系方式"
        min-width="200"
      >
        <template #default="{ row }: { row: TavernUser }">
          <div class="cell-stack">
            <span v-if="row.account.email">{{ row.account.email }}</span>
            <span
              v-if="row.account.phone"
              class="cell-sub"
            >{{ row.account.phone }}</span>
            <span
              v-if="!row.account.email && !row.account.phone"
              class="cell-muted"
            >—</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="可用积分"
        width="130"
        align="right"
      >
        <template #default="{ row }: { row: TavernUser }">
          <div class="cell-stack cell-stack--end">
            <span class="num">{{ formatCredits(row.credits.available) }}</span>
            <span
              v-if="row.credits.held > 0"
              class="cell-sub num"
              title="进行中的回合预扣着的"
            >预扣 {{ formatCredits(row.credits.held) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="加入时间"
        width="150"
      >
        <template #default="{ row }: { row: TavernUser }">
          <span class="cell-date">{{ formatDateTime(row.joinedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="最近活跃"
        width="120"
      >
        <template #default="{ row }: { row: TavernUser }">
          <span
            class="cell-date"
            :title="formatDateTime(row.lastSeenAt, 'YYYY-MM-DD HH:mm:ss')"
          >{{ fromNow(row.lastSeenAt) }}</span>
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
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.clickable-table :deep(.el-table__row) {
  cursor: pointer;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cell-user__avatar {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
}

.cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-stack--end {
  align-items: flex-end;
}

.cell-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-primary);
}
</style>
