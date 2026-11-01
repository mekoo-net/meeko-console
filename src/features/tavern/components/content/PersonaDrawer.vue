<script setup lang="ts">
/**
 * 联系人详情，版式同调用详情抽屉：上面一张摘要表，下面分段。
 * 卡是玩家手里独立的一张，只看卡本身：卡面，再按来源看内容（市场卡看卡号版本，导入的看人设和世界书）。
 * 只读：卡归玩家，员工不删不改；市场卡有问题在市场下架。
 */
import { computed, ref, watch, type Component } from 'vue';
import { ElMessage } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';

import { CardSourceLabel, type CardContent, type PersonaDetail } from '../../model/content.types';
import { initialOf } from '../../model/contentFormat';
import { getTavernContentPort } from '../../services';
import CopyableId from '../metering/CopyableId.vue';
import ImportedCardContent from './ImportedCardContent.vue';
import MarketCardContent from './MarketCardContent.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ personaId: number | null }>();

const port = getTavernContentPort();

const ContentView: Readonly<Record<CardContent['kind'], Component>> = {
  market: MarketCardContent,
  imported: ImportedCardContent,
};

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
        <span class="drawer-title__text">{{ persona?.name ?? '联系人' }}</span>
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
          <el-descriptions-item
            label="联系人 ID"
            :span="2"
          >
            <CopyableId
              :value="persona.id"
              label="联系人 ID"
            />
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
            label="来源"
            :span="2"
          >
            {{ CardSourceLabel[persona.source] }}
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

        <component
          :is="ContentView[detail.content.kind]"
          :content="detail.content"
        />
      </template>
    </div>
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
</style>
