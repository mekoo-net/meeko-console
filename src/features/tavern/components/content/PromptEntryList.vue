<script setup lang="ts">
/**
 * 一组条目（预设、额外描述、世界书）：一条一行，点开看正文。默认全收起，条目再多也只占一行一条。
 */
import type { EntryItem } from '../../model/promptEntries';

defineProps<{ entries: EntryItem[]; empty: string }>();
</script>

<template>
  <el-collapse
    v-if="entries.length"
    class="entries"
  >
    <el-collapse-item
      v-for="e in entries"
      :key="e.key"
      :name="e.key"
    >
      <template #title>
        <span class="entry-title">
          <span class="entry-title__text">{{ e.title || '未命名' }}</span>
          <el-tag
            v-for="t in e.tags"
            :key="t.label"
            size="small"
            :type="t.type"
            effect="plain"
          >
            {{ t.label }}
          </el-tag>
        </span>
      </template>
      <div
        v-if="e.keywords.length"
        class="entry-keywords"
      >
        <span class="entry-keywords__label">关键词</span>
        <el-tag
          v-for="k in e.keywords"
          :key="k"
          size="small"
          type="info"
        >
          {{ k }}
        </el-tag>
      </div>
      <div class="entry-content">
        {{ e.content || '（空）' }}
      </div>
    </el-collapse-item>
  </el-collapse>
  <span
    v-else
    class="cell-muted"
  >{{ empty }}</span>
</template>

<style scoped>
.entries {
  border-top: none;
}

.entry-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.entry-title__text {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.entry-keywords__label {
  margin-right: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.entry-content {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
