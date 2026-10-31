<script setup lang="ts">
/**
 * 一个会话（私聊 / 场景 / 导演席……）的消息与记忆，版式同调用详情抽屉：分段标题 + 灰底原文，危险操作放底栏。
 *
 *  - 父页面按会话 id 给抽屉上 key：换会话整个重建，这里不用手动清状态；每次打开从消息页第 1 页重读
 *  - 消息按服务端分页：第 1 页是最新的一页，页内按 seq 升序，照着从上往下读就是对话顺序；正文按种类各一个组件
 *  - 记忆分开拉：摘要、状态卡、召回记忆条数一次，召回条目分页
 *  - 删除 / 清空 / 遗忘之后父页面要重读世界（消息数变了），所以统一抛 `changed`
 */
import { computed, reactive, ref, watch, type Component } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';

import { act } from '../../composables/contentActions';
import { usePagedList } from '../../composables/usePagedList';
import {
  MessageRoleLabel,
  MessageRoleTone,
  MessageSourceBadge,
  MessageStatusLabel,
  MessageStatusTone,
  SessionKindLabel,
  SessionKindTone,
  type MemoryItem,
  type MessageContent,
  type MessageRow,
  type SessionKey,
  type SessionMemory,
  type SessionRow,
} from '../../model/content.types';
import { formatStoryAt, jsonText, sessionName } from '../../model/contentFormat';
import { getTavernContentPort } from '../../services';
import CopyableId from '../metering/CopyableId.vue';
import MessageImageBody from './MessageImageBody.vue';
import MessageTextBody from './MessageTextBody.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{
  accountUid: number;
  sessionId: string;
  /** 列表里已有的行，标题不用等记忆接口回来；成员私聊这类没有现成行的传 null。 */
  session: SessionRow | null;
}>();
const emit = defineEmits<{ changed: [] }>();

const port = getTavernContentPort();

/** 正文按种类各一个组件；每种都得有，各自只收自己那种正文（TS 关联不起来，所以这里按 Component 收）。 */
const BodyView: Readonly<Record<MessageContent['kind'], Component>> = { text: MessageTextBody, image: MessageImageBody };

const key = computed<SessionKey>(() => ({ accountUid: props.accountUid, sessionId: props.sessionId }));

const tab = ref<'messages' | 'memory'>('messages');
const memory = ref<SessionMemory | null>(null);
const current = computed(() => memory.value?.session ?? props.session);
const title = computed(() => (current.value ? sessionName(current.value) : '会话'));

const messages = reactive(usePagedList((page) => port.messages(key.value, page)));
const items = reactive(usePagedList((page) => port.memoryItems(key.value, page)));

// ─── 记忆 ────────────────────────────────────────────────

const memoryLoading = ref(false);
/** 消息删了、清了，摘要不变但召回条数会变；切到记忆页时重拉。 */
let memoryStale = true;

async function loadMemory(): Promise<void> {
  memoryStale = false;
  memoryLoading.value = true;
  try {
    const r = await port.sessionMemory(key.value);
    if (r.success) memory.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    memoryLoading.value = false;
  }
  await items.load();
}

const stateCardRows = computed(() =>
  Object.entries(memory.value?.stateCard ?? {}).map(([name, value]) => ({ name, value: jsonText(value) })),
);

watch(tab, (t) => {
  if (t === 'memory' && memoryStale) void loadMemory();
});

watch(
  visible,
  (open) => {
    if (!open) return;
    tab.value = 'messages';
    memoryStale = true;
    messages.reload();
  },
  { immediate: true },
);

// ─── 处置 ────────────────────────────────────────────────

async function deleteMessage(m: MessageRow): Promise<void> {
  const done = await act(
    {
      title: '删除消息',
      message: `删除第 ${m.seq} 条消息？玩家那边也会看不到这条，它也会从召回记忆里拿掉。`,
      confirmText: '删除',
    },
    () => port.deleteMessage(key.value, m.id),
  );
  if (!done) return;
  memoryStale = true;
  emit('changed');
  await messages.load();
}

async function clearSession(): Promise<void> {
  const done = await act(
    { title: '清空会话', message: `清空「${title.value}」里的全部消息？玩家那边会变成一个空会话。`, confirmText: '清空' },
    () => port.clearSession(key.value),
    (r) => `已清空 ${r.affected} 条`,
  );
  if (!done) return;
  memoryStale = true;
  emit('changed');
  messages.reload();
  if (tab.value === 'memory') await loadMemory();
}

async function forget(item: MemoryItem): Promise<void> {
  const done = await act(
    {
      title: '遗忘记忆',
      message: `把第 ${item.seq} 条从召回记忆里拿掉？消息本身还在，只是角色不会再想起它。`,
      confirmText: '遗忘',
    },
    () => port.forgetMemoryItem(key.value, item.messageId),
    () => '已遗忘',
  );
  if (!done) return;
  emit('changed');
  // 消息头上的「记忆」标记跟着变。
  void messages.load();
  await loadMemory();
}
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="760px"
  >
    <template #header>
      <div class="drawer-title">
        <span class="drawer-title__text">{{ title }}</span>
        <el-tag
          v-if="current"
          size="small"
          :type="SessionKindTone[current.kind]"
          effect="plain"
        >
          {{ SessionKindLabel[current.kind] }}
        </el-tag>
        <el-tag
          v-if="current?.deletedAt != null"
          size="small"
          type="info"
          effect="plain"
        >
          已删除
        </el-tag>
        <CopyableId
          :value="sessionId"
          label="会话 ID"
          class="drawer-title__id"
        />
      </div>
    </template>

    <el-tabs
      v-model="tab"
      class="session-tabs"
    >
      <!-- ============ 消息 ============ -->
      <el-tab-pane
        label="消息"
        name="messages"
      >
        <div
          v-loading="messages.loading"
          class="msg-list"
        >
          <div
            v-for="m in messages.items"
            :key="m.id"
            class="msg"
            :class="{ 'msg--deleted': m.deletedAt != null }"
          >
            <div class="msg__head">
              <span class="msg__seq mono">#{{ m.seq }}</span>
              <el-tag
                size="small"
                :type="MessageRoleTone[m.role]"
                effect="light"
              >
                {{ MessageRoleLabel[m.role] }}
              </el-tag>
              <el-tag
                v-if="MessageSourceBadge[m.source]"
                size="small"
                type="warning"
                effect="plain"
              >
                {{ MessageSourceBadge[m.source] }}
              </el-tag>
              <span class="msg__time mono">{{ formatDateTime(m.createdAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
              <span
                v-if="m.content.storyAt"
                class="msg__story"
                title="故事时刻"
              >{{ formatStoryAt(m.content.storyAt) }}</span>
              <el-tag
                v-if="m.status !== 'completed'"
                size="small"
                :type="MessageStatusTone[m.status]"
                effect="plain"
              >
                {{ MessageStatusLabel[m.status] }}
              </el-tag>
              <el-tag
                v-if="m.deletedAt != null"
                size="small"
                type="info"
                effect="plain"
                :title="`删除于 ${formatDateTime(m.deletedAt, 'YYYY-MM-DD HH:mm:ss')}`"
              >
                已删除
              </el-tag>
              <el-tag
                v-if="m.memory"
                size="small"
                type="success"
                effect="plain"
                title="已进召回记忆"
              >
                记忆
              </el-tag>
              <el-button
                v-if="m.deletedAt == null"
                link
                type="danger"
                size="small"
                class="msg__action"
                @click="deleteMessage(m)"
              >
                删除
              </el-button>
            </div>

            <component
              :is="BodyView[m.content.kind]"
              :body="m.content"
            />
          </div>

          <el-empty
            v-if="!messages.loading && !messages.items.length"
            description="没有消息"
            :image-size="80"
          />
        </div>

        <div class="pager">
          <el-pagination
            v-model:current-page="messages.page"
            v-model:page-size="messages.pageSize"
            :total="messages.total"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            size="small"
            background
          />
        </div>
      </el-tab-pane>

      <!-- ============ 记忆 ============ -->
      <el-tab-pane
        label="记忆"
        name="memory"
      >
        <div
          v-loading="memoryLoading"
          class="memory"
        >
          <h4 class="section-title">
            会话摘要
          </h4>
          <template v-if="memory?.summary">
            <div class="text-block">
              {{ memory.summary.text }}
            </div>
            <div class="memory__meta">
              覆盖到第 {{ memory.summary.coveredUntilSeq }} 条 · 更新于 {{ formatDateTime(memory.summary.updatedAt, 'YYYY-MM-DD HH:mm:ss') }}
            </div>
          </template>
          <span
            v-else
            class="cell-muted"
          >无</span>

          <el-divider />

          <h4 class="section-title">
            状态卡
          </h4>
          <el-table
            v-if="memory?.stateCard"
            :data="stateCardRows"
            size="small"
            class="compact-table"
          >
            <el-table-column
              prop="name"
              label="项"
              width="160"
            />
            <el-table-column label="值">
              <template #default="{ row }: { row: { name: string; value: string } }">
                <span class="pre-wrap">{{ row.value }}</span>
              </template>
            </el-table-column>
          </el-table>
          <span
            v-else
            class="cell-muted"
          >无</span>

          <el-divider />

          <h4 class="section-title">
            召回记忆
            <span class="section-title__count">共 {{ memory?.indexedCount ?? 0 }} 条</span>
          </h4>
          <el-table
            v-loading="items.loading"
            :data="items.items"
            row-key="messageId"
            size="small"
            class="compact-table"
            empty-text="没有召回记忆"
          >
            <el-table-column
              label="#"
              width="64"
            >
              <template #default="{ row }: { row: MemoryItem }">
                <span class="mono">{{ row.seq }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="角色"
              width="72"
            >
              <template #default="{ row }: { row: MemoryItem }">
                {{ MessageRoleLabel[row.role] }}
              </template>
            </el-table-column>
            <el-table-column
              prop="text"
              label="内容"
              min-width="260"
              show-overflow-tooltip
            />
            <el-table-column
              prop="source"
              label="来源"
              width="88"
            />
            <el-table-column
              label="时间"
              width="140"
            >
              <template #default="{ row }: { row: MemoryItem }">
                <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="64"
              align="center"
            >
              <template #default="{ row }: { row: MemoryItem }">
                <el-button
                  link
                  type="danger"
                  size="small"
                  @click="forget(row)"
                >
                  遗忘
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="items.page"
              v-model:page-size="items.pageSize"
              :total="items.total"
              :page-sizes="[20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              size="small"
              background
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <div class="drawer-footer">
        <el-button
          v-if="current?.deletedAt == null"
          type="danger"
          :icon="Delete"
          @click="clearSession"
        >
          清空会话
        </el-button>
        <el-tag
          v-else
          type="info"
          effect="plain"
        >
          会话已删除
        </el-tag>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.drawer-title__text {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-title__id {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
}

.session-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
  font-size: 13px;
  line-height: 1.6;
}

.msg {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.msg--deleted {
  opacity: 0.55;
}

.msg__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.msg__seq {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.msg__time,
.msg__story {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.msg__story::before {
  content: '故事 ';
  color: var(--el-text-color-placeholder);
}

.msg__action {
  margin-left: auto;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.memory {
  font-size: 13px;
  line-height: 1.6;
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section-title__count {
  margin-left: 6px;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.text-block {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.memory__meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pre-wrap {
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
