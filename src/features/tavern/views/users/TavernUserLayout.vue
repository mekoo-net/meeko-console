<script setup lang="ts">
/**
 * 用户视角：一个玩家的世界线、联系人、卡片（世界卡 / 角色卡）、市场、调用日志、积分，版式同平台账户页（头部 + 路由驱动的标签页）。
 * 头部的名字、邮箱是平台账户的；世界线和联系人数来自 WorldLine，它不通时显示「—」，其余照常。
 */
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { TopRight } from '@element-plus/icons-vue';

import RouteViewport from '@/shared/ui/RouteViewport.vue';
import { formatDate, fromNow } from '@/shared/lib/date';

import CopyableId from '../../components/metering/CopyableId.vue';
import { TavernUserKey } from '../../composables/tavernUserContext';
import { accountName, initialOf } from '../../model/contentFormat';
import { formatCredits } from '../../model/meteringFormat';
import type { TavernUserDetail } from '../../model/users.types';
import { getTavernUsersPort } from '../../services';

const props = defineProps<{ uid: number }>();

const port = getTavernUsersPort();
const route = useRoute();
const router = useRouter();

const detail = ref<TavernUserDetail | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.get(props.uid);
    if (r.success) {
      detail.value = r.data;
      error.value = null;
    } else {
      error.value = r.error.message;
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

provide(TavernUserKey, { detail, refresh: () => void load() });

// 世界线是用世界卡开的世界，联系人是用角色卡建的、玩家起了名字的那一个；两类卡在「卡片」里分页。
const tabs = [
  { key: 'worlds', label: '世界线' },
  { key: 'contacts', label: '联系人' },
  { key: 'cards', label: '卡片' },
  { key: 'market', label: '市场' },
  { key: 'logs', label: '调用日志' },
  { key: 'credits', label: '积分' },
] as const;

const activeTab = computed(() => {
  const seg = route.path.split('/')[4];
  return tabs.find((t) => t.key === seg)?.key ?? tabs[0].key;
});

function onTabChange(key: string | number): void {
  if (key === activeTab.value) return;
  void router.push(`/tavern/users/${props.uid}/${String(key)}`);
}

const user = computed(() => detail.value?.user ?? null);
const label = computed(() => (user.value ? accountName(user.value.account) : `UID ${props.uid}`));

const stats = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const count = (n: number | undefined) => (n == null ? '—' : String(n));
  return [
    { key: 'available', label: '可用积分', value: formatCredits(d.user.credits.available) },
    { key: 'held', label: '预扣中', value: formatCredits(d.user.credits.held) },
    { key: 'worlds', label: '世界线', value: count(d.content?.worlds) },
    { key: 'contacts', label: '联系人', value: count(d.content?.cards) },
    { key: 'world-cards', label: '世界卡', value: String(d.cards.worldCards) },
    { key: 'character-cards', label: '角色卡', value: String(d.cards.characterCards) },
    { key: 'listed', label: '上架', value: String(d.market.listed) },
  ];
});

watch(
  () => props.uid,
  () => {
    detail.value = null;
    void load();
  },
);

onMounted(() => void load());
</script>

<template>
  <div class="user-page">
    <section class="user-head">
      <el-breadcrumb class="user-head__crumb">
        <el-breadcrumb-item :to="{ name: 'tavern-users' }">
          用户
        </el-breadcrumb-item>
        <el-breadcrumb-item>{{ label }}</el-breadcrumb-item>
      </el-breadcrumb>

      <div class="user-head__main">
        <el-avatar
          :size="56"
          shape="square"
          class="user-head__avatar"
        >
          {{ initialOf(label) }}
        </el-avatar>
        <div class="user-head__info">
          <h1 class="user-head__title">
            {{ label }}
          </h1>
          <div class="user-head__meta">
            <span class="meta">
              UID
              <CopyableId
                :value="uid"
                label="UID"
              />
            </span>
            <template v-if="user">
              <span
                v-if="user.account.email"
                class="meta"
              >{{ user.account.email }}</span>
              <span
                v-if="user.account.phone"
                class="meta"
              >{{ user.account.phone }}</span>
              <span class="meta">加入于 {{ formatDate(user.joinedAt) }}</span>
              <span class="meta">最近活跃 {{ fromNow(user.lastSeenAt) }}</span>
            </template>
          </div>
        </div>
        <router-link
          :to="`/accounts/${uid}`"
          class="user-head__link"
        >
          平台账户 <el-icon><TopRight /></el-icon>
        </router-link>
      </div>

      <dl
        v-if="stats.length"
        class="user-head__stats"
      >
        <div
          v-for="s in stats"
          :key="s.key"
          class="stat"
        >
          <dt>{{ s.label }}</dt>
          <dd>{{ s.value }}</dd>
        </div>
      </dl>

      <el-tabs
        :model-value="activeTab"
        class="user-head__tabs"
        @tab-change="onTabChange"
      >
        <el-tab-pane
          v-for="t in tabs"
          :key="t.key"
          :name="t.key"
          :label="t.label"
        />
      </el-tabs>
    </section>

    <el-alert
      v-if="error && !detail"
      type="error"
      :title="error"
      show-icon
      :closable="false"
    />

    <section
      v-loading="loading && !detail"
      class="user-body"
    >
      <RouteViewport />
    </section>
  </div>
</template>

<style scoped>
/* 撑满主区域：标签页里的表格在内容卡片里自己滚动、分页贴底，同平台账户页。 */
.user-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 56px - 52px);
  min-height: 640px;
}

.user-head {
  flex-shrink: 0;
  padding: 16px 24px 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.user-head__crumb {
  margin-bottom: 14px;
}

.user-head__main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-head__avatar {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 8px;
}

.user-head__info {
  flex: 1;
  min-width: 0;
}

.user-head__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta + .meta::before {
  content: '';
  width: 1px;
  height: 12px;
  margin: 0 12px;
  background: var(--el-border-color);
}

.user-head__link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--el-color-primary);
  text-decoration: none;
}

.user-head__stats {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  margin: 20px 0 4px;
  padding: 14px 0;
  border-top: 1px solid var(--el-border-color-extra-light);
}

.stat {
  padding: 0 20px;
}

.stat:first-child {
  padding-left: 0;
}

.stat + .stat {
  border-left: 1px solid var(--el-border-color-lighter);
}

.stat dt {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.stat dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

/* 标签栏贴在头部卡片底边，卡片本身有边框，去掉标签栏自带的底线。 */
.user-head__tabs :deep(.el-tabs__header) {
  margin: 0;
}

.user-head__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.user-head__tabs :deep(.el-tabs__item) {
  height: 44px;
  font-size: 14px;
}

.user-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.user-body > :deep(.route-viewport) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.user-body > :deep(.route-viewport) > .route-viewport__page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
