<script setup lang="ts">
/**
 * 角色卡详情，版式同调用详情抽屉：上面一张摘要表，下面分段，删除放底栏。
 * 人设和角色世界书是玩家写的 JSON，原样给；`systemPrompt` 是一大段正文，单独按原文排一份方便读。
 */
import { computed, ref, watch } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';

import { deletePersona } from '../../composables/contentActions';
import type { PersonaDetail, PersonaWorld } from '../../model/content.types';
import { accountName, initialOf } from '../../model/contentFormat';
import { getTavernContentPort } from '../../services';
import CopyableId from '../metering/CopyableId.vue';
import JsonBlock from './JsonBlock.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ personaId: number | null }>();
const emit = defineEmits<{ deleted: [personaId: number] }>();

const port = getTavernContentPort();

const detail = ref<PersonaDetail | null>(null);
const loading = ref(false);

const persona = computed(() => detail.value?.persona ?? null);

async function load(id: number): Promise<void> {
  loading.value = true;
  try {
    const r = await port.persona(id);
    if (id !== props.personaId) return;
    if (r.success) detail.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [visible.value, props.personaId] as const,
  ([open, id]) => {
    if (!open || id == null) return;
    if (detail.value?.persona.id !== id) detail.value = null;
    void load(id);
  },
  { immediate: true },
);

async function remove(): Promise<void> {
  const p = persona.value;
  if (!p || !(await deletePersona(p))) return;
  emit('deleted', p.id);
  await load(p.id);
}
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="560px"
  >
    <template #header>
      <div class="drawer-title">
        <el-avatar
          :size="28"
          shape="square"
          :src="persona?.avatar ?? undefined"
          class="drawer-title__avatar"
        >
          {{ initialOf(persona?.name ?? '') }}
        </el-avatar>
        <span class="drawer-title__text">{{ persona?.name ?? '角色卡' }}</span>
        <el-tag
          v-if="persona?.deletedAt != null"
          size="small"
          type="info"
          effect="plain"
        >
          已删除
        </el-tag>
      </div>
    </template>

    <div
      v-loading="loading && !detail"
      class="log-detail"
    >
      <template v-if="detail && persona">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="log-detail__summary"
        >
          <el-descriptions-item label="角色卡 ID">
            <CopyableId
              :value="persona.id"
              label="角色卡 ID"
            />
          </el-descriptions-item>
          <el-descriptions-item label="账户">
            <router-link
              :to="`/accounts/${persona.account.uid}`"
              class="link"
            >
              {{ accountName(persona.account) }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(persona.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(persona.updatedAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="persona.deletedAt != null"
            label="删除时间"
            :span="2"
          >
            {{ formatDateTime(persona.deletedAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item
            label="市场卡"
            :span="2"
          >
            <template v-if="persona.card">
              <CopyableId
                :value="persona.card.id"
                label="市场卡 ID"
              />
              <span
                v-if="persona.card.version != null"
                class="sub num"
              >v{{ persona.card.version }}</span>
            </template>
            <span
              v-else
              class="cell-muted"
            >—</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          简介
        </h4>
        <div
          v-if="persona.profile.tagline"
          class="text-block"
        >
          {{ persona.profile.tagline }}
        </div>
        <span
          v-else
          class="cell-muted"
        >无</span>

        <h4 class="section-title section-title--gap">
          标签
        </h4>
        <div
          v-if="persona.profile.tags.length"
          class="tags"
        >
          <el-tag
            v-for="t in persona.profile.tags"
            :key="t"
            size="small"
            type="info"
            effect="plain"
          >
            {{ t }}
          </el-tag>
        </div>
        <span
          v-else
          class="cell-muted"
        >无</span>

        <h4 class="section-title section-title--gap">
          开场白
        </h4>
        <template v-if="persona.profile.greetings.length">
          <div
            v-for="(g, i) in persona.profile.greetings"
            :key="i"
            class="text-block text-block--stack"
          >
            {{ g }}
          </div>
        </template>
        <span
          v-else
          class="cell-muted"
        >无</span>

        <el-divider />

        <h4 class="section-title">
          人设
        </h4>
        <div
          v-if="detail.preset.systemPrompt?.trim()"
          class="text-block text-block--stack"
        >
          {{ detail.preset.systemPrompt }}
        </div>
        <JsonBlock :value="detail.preset" />

        <el-divider />

        <h4 class="section-title">
          角色世界书
        </h4>
        <JsonBlock
          v-if="detail.worldBook.length"
          :value="detail.worldBook"
        />
        <span
          v-else
          class="cell-muted"
        >无</span>

        <el-divider />

        <h4 class="section-title">
          所在世界
        </h4>
        <el-table
          :data="detail.worlds"
          :row-key="(w: PersonaWorld) => w.world.id"
          size="small"
          class="compact-table"
          empty-text="没有加入过世界"
        >
          <el-table-column
            label="世界"
            min-width="160"
          >
            <template #default="{ row }: { row: PersonaWorld }">
              <router-link
                :to="{ name: 'tavern-world-detail', params: { accountUid: row.world.accountUid, worldId: row.world.id } }"
                class="link"
              >
                {{ row.world.title }}
              </router-link>
              <el-tag
                v-if="row.world.deletedAt != null"
                size="small"
                type="info"
                effect="plain"
                class="tag-gap"
              >
                已删除
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            label="加入时间"
            width="140"
          >
            <template #default="{ row }: { row: PersonaWorld }">
              <span class="cell-date">{{ formatDateTime(row.joinedAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="离开时间"
            width="140"
          >
            <template #default="{ row }: { row: PersonaWorld }">
              <span
                v-if="row.leftAt != null"
                class="cell-date"
              >{{ formatDateTime(row.leftAt) }}</span>
              <span
                v-else
                class="cell-muted"
              >—</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <template #footer>
      <div
        v-if="persona"
        class="drawer-footer"
      >
        <el-button
          v-if="persona.deletedAt == null"
          type="danger"
          :icon="Delete"
          @click="remove"
        >
          删除角色卡
        </el-button>
        <el-tag
          v-else
          type="info"
          effect="plain"
        >
          该角色卡已删除
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

.drawer-title__avatar {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
}

.drawer-title__text {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-detail {
  min-height: 120px;
  font-size: 13px;
  line-height: 1.6;
}

.log-detail__summary {
  margin-bottom: 4px;
}

.log-detail__summary :deep(.el-descriptions__label) {
  width: 88px;
}

.num {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.tag-gap {
  margin-left: 6px;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section-title--gap {
  margin-top: 16px;
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

.text-block--stack {
  margin-bottom: 8px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
