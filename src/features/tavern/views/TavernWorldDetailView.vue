<script setup lang="ts">
/**
 * Tavern 世界详情，版式同账户详情：头部卡片（面包屑、标题、元信息、操作、统计、标签栏）+ 内容卡片。
 *
 *  - 标签页是一张表：每页用哪个 pane、从世界详情里拿什么。切到哪页才渲染，渲染过的留着（纪事、节拍来回切不丢页码）
 *  - 设定、世界书、规则书、成员、会话、记忆都在世界详情一次下发；纪事和节拍量大，各自分页拉
 *  - 会话（含成员私聊）在抽屉里看消息和记忆；抽屉里删了、清了、遗忘了，回来重读世界，计数跟着变
 */
import { computed, onMounted, ref, watch, type Component } from 'vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDate, formatDateTime, fromNow } from '@/shared/lib/date';
import type { AppError } from '@/shared/api/httpTypes';

import SessionDrawer from '../components/content/SessionDrawer.vue';
import WorldBeatsPane from '../components/content/WorldBeatsPane.vue';
import WorldBookPane from '../components/content/WorldBookPane.vue';
import WorldChroniclePane from '../components/content/WorldChroniclePane.vue';
import WorldMembersPane from '../components/content/WorldMembersPane.vue';
import WorldRulebookPane from '../components/content/WorldRulebookPane.vue';
import WorldRuntimePane from '../components/content/WorldRuntimePane.vue';
import WorldSessionsPane from '../components/content/WorldSessionsPane.vue';
import WorldSettingsPane from '../components/content/WorldSettingsPane.vue';
import CopyableId from '../components/metering/CopyableId.vue';
import { deleteWorld } from '../composables/contentActions';
import { LifecycleStateLabel, LifecycleStateTone, type WorldDetail, type WorldKey } from '../model/content.types';
import { accountName, initialOf } from '../model/contentFormat';
import { getTavernContentPort } from '../services';

/** 路由只认数字 UID，这里拿到的已经是数。 */
const props = defineProps<{ accountUid: number; worldId: string }>();

const port = getTavernContentPort();

const key = computed<WorldKey>(() => ({ accountUid: props.accountUid, worldId: props.worldId }));

const detail = ref<WorldDetail | null>(null);
const loading = ref(false);
const loadError = ref<AppError | null>(null);

const world = computed(() => detail.value?.world ?? null);
const title = computed(() => world.value?.title ?? props.worldId);

async function load(): Promise<void> {
  const worldId = props.worldId;
  loading.value = true;
  try {
    const r = await port.world(key.value);
    if (worldId !== props.worldId) return;
    if (r.success) {
      detail.value = r.data;
      loadError.value = null;
    } else {
      loadError.value = r.error;
    }
  } finally {
    loading.value = false;
  }
}

async function removeWorld(): Promise<void> {
  if (world.value && (await deleteWorld(world.value))) await load();
}

// ─── 会话抽屉 ────────────────────────────────────────────

const sessionOpen = ref(false);
const sessionId = ref<string | null>(null);
const sessionRow = computed(() => detail.value?.sessions.find((s) => s.id === sessionId.value) ?? null);

function openSession(id: string): void {
  sessionId.value = id;
  sessionOpen.value = true;
}

// ─── 标签页 ──────────────────────────────────────────────

interface Tab {
  /** 抽屉里也有 messages / memory 两个标签，el-tabs 按 name 生成 DOM id，这里的 key 别和它撞名。 */
  key: string;
  label: string;
  pane: Component;
  props: (d: WorldDetail) => Record<string, unknown>;
}

const tabs: readonly [Tab, ...Tab[]] = [
  { key: 'settings', label: '设定', pane: WorldSettingsPane, props: (d) => ({ settings: d.settings }) },
  { key: 'book', label: '世界书', pane: WorldBookPane, props: (d) => ({ worldBook: d.worldBook }) },
  { key: 'rules', label: '规则书', pane: WorldRulebookPane, props: (d) => ({ rulebook: d.rulebook, runtime: d.runtime }) },
  { key: 'members', label: '成员', pane: WorldMembersPane, props: (d) => ({ members: d.members, onOpen: openSession }) },
  { key: 'sessions', label: '会话', pane: WorldSessionsPane, props: (d) => ({ sessions: d.sessions, onOpen: openSession }) },
  { key: 'runtime', label: '记忆', pane: WorldRuntimePane, props: (d) => ({ runtime: d.runtime }) },
  { key: 'chronicle', label: '纪事', pane: WorldChroniclePane, props: () => ({ world: key.value }) },
  { key: 'beats', label: '心理节拍', pane: WorldBeatsPane, props: (d) => ({ world: key.value, members: d.members }) },
];

const activeTab = ref(tabs[0].key);
const tab = computed(() => tabs.find((t) => t.key === activeTab.value) ?? tabs[0]);

const stats = computed(() => {
  const d = detail.value;
  if (!d) return [];
  return [
    { key: 'members', label: '成员', value: d.world.stats.members },
    { key: 'sessions', label: '会话', value: d.world.stats.sessions },
    { key: 'messages', label: '消息', value: d.world.stats.messages },
    { key: 'nodes', label: '世界书节点', value: d.worldBook?.document.nodes.length ?? 0 },
  ];
});

// 换了世界从头来：清掉详情，挂在它下面的 KeepAlive 连同渲染过的标签页一起丢。
watch(key, () => {
  detail.value = null;
  activeTab.value = tabs[0].key;
  void load();
});

onMounted(() => void load());
</script>

<template>
  <div class="world-page">
    <section class="world-head">
      <el-breadcrumb class="world-head__crumb">
        <el-breadcrumb-item :to="{ name: 'tavern-worlds' }">
          世界
        </el-breadcrumb-item>
        <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
      </el-breadcrumb>

      <div class="world-head__main">
        <el-avatar
          :size="56"
          shape="square"
          class="world-head__avatar"
        >
          {{ initialOf(title) }}
        </el-avatar>
        <div class="world-head__info">
          <div class="world-head__title">
            <h1>{{ title }}</h1>
            <StatusTag
              v-if="world?.deletedAt != null"
              :label="LifecycleStateLabel.deleted"
              :tone="LifecycleStateTone.deleted"
            />
          </div>
          <div class="world-head__meta">
            <span class="meta">
              ID
              <CopyableId
                :value="worldId"
                label="世界 ID"
              />
            </span>
            <template v-if="world">
              <span class="meta">
                <router-link
                  :to="`/accounts/${world.account.uid}`"
                  class="meta__link"
                >{{ accountName(world.account) }}</router-link>
                <span
                  v-if="world.account.displayName"
                  class="meta__mono"
                >{{ world.account.uid }}</span>
              </span>
              <span
                v-if="world.account.email"
                class="meta"
              >{{ world.account.email }}</span>
              <span class="meta">创建于 {{ formatDate(world.createdAt) }}</span>
              <span
                v-if="world.lastActiveAt != null"
                class="meta"
                :title="formatDateTime(world.lastActiveAt, 'YYYY-MM-DD HH:mm:ss')"
              >最近活跃 {{ fromNow(world.lastActiveAt) }}</span>
              <span
                v-if="world.deletedAt != null"
                class="meta"
              >删除于 {{ formatDateTime(world.deletedAt) }}</span>
            </template>
          </div>
        </div>
        <div
          v-if="world && world.deletedAt == null"
          class="world-head__actions"
        >
          <el-button
            type="danger"
            plain
            @click="removeWorld"
          >
            删除世界
          </el-button>
        </div>
      </div>

      <dl
        v-if="stats.length"
        class="world-head__stats"
      >
        <div
          v-for="s in stats"
          :key="s.key"
          class="stat"
        >
          <dt>{{ s.label }}</dt>
          <dd>{{ s.value.toLocaleString() }}</dd>
        </div>
      </dl>

      <el-tabs
        v-model="activeTab"
        class="world-head__tabs"
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
      v-if="loadError"
      type="error"
      :title="`加载失败：${loadError.code}`"
      :description="loadError.message"
      show-icon
      :closable="false"
    />

    <section
      v-loading="loading && !detail"
      class="world-body"
    >
      <div
        v-if="detail"
        class="world-body__pane"
      >
        <KeepAlive>
          <component
            :is="tab.pane"
            :key="tab.key"
            v-bind="tab.props(detail)"
          />
        </KeepAlive>
      </div>
    </section>

    <!-- 按会话重建：换个会话就是一个新抽屉，不用手动清上一个的消息和记忆。 -->
    <SessionDrawer
      v-if="sessionId"
      :key="sessionId"
      v-model:visible="sessionOpen"
      :account-uid="accountUid"
      :session-id="sessionId"
      :session="sessionRow"
      @changed="load"
    />
  </div>
</template>

<style scoped>
/* 撑满主区域：标签页里的表格要能在内容卡片里自己滚动、分页贴底。 */
.world-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 56px - 52px);
  min-height: 640px;
}

.world-head {
  flex-shrink: 0;
  padding: 16px 24px 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.world-head__crumb {
  margin-bottom: 14px;
}
.world-head__main {
  display: flex;
  align-items: center;
  gap: 16px;
}
.world-head__avatar {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 8px;
}
.world-head__info {
  flex: 1;
  min-width: 0;
}
.world-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.world-head__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.world-head__meta {
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
.meta__mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--el-text-color-regular);
}
.meta__link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.world-head__actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}
.world-head__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.world-head__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
.world-head__tabs :deep(.el-tabs__header) {
  margin: 0;
}
.world-head__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.world-head__tabs :deep(.el-tabs__item) {
  height: 44px;
  font-size: 14px;
}

.world-body {
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
.world-body__pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

</style>
