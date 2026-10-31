<script setup lang="ts">
/**
 * 设定节点特有的部分：什么时候进上下文（常驻 / 关键词 / 语义召回）、命中概率、正文。分组节点没有这些。
 */
import { ActivationModeLabel, KeywordMatchLabel, type WorldBookLore } from '../../model/content.types';

defineProps<{ lore: WorldBookLore }>();
</script>

<template>
  <el-descriptions
    :column="2"
    border
    size="small"
    class="detail-desc"
  >
    <el-descriptions-item label="触发">
      {{ ActivationModeLabel[lore.activation.mode] }}
    </el-descriptions-item>
    <el-descriptions-item label="概率">
      <span class="mono">{{ lore.probability }}%</span>
    </el-descriptions-item>
    <template v-if="lore.activation.mode === 'keyword'">
      <el-descriptions-item
        label="关键词"
        :span="2"
      >
        <div class="kw">
          <el-tag
            v-for="k in lore.activation.keywords"
            :key="k"
            size="small"
            effect="plain"
          >
            {{ k }}
          </el-tag>
          <span class="kw__opt">{{ KeywordMatchLabel[lore.activation.match] }}</span>
        </div>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="lore.activation.also.length"
        label="同时命中"
        :span="2"
      >
        <div class="kw">
          <el-tag
            v-for="k in lore.activation.also"
            :key="k"
            size="small"
            type="info"
            effect="plain"
          >
            {{ k }}
          </el-tag>
        </div>
      </el-descriptions-item>
      <el-descriptions-item
        label="扫描"
        :span="2"
      >
        最近 {{ lore.activation.scanDepth }} 条
        <span
          v-if="lore.activation.regex"
          class="kw__opt"
        >正则</span>
        <span
          v-if="lore.activation.caseSensitive"
          class="kw__opt"
        >区分大小写</span>
      </el-descriptions-item>
    </template>
  </el-descriptions>

  <h4 class="section-title">
    正文
  </h4>
  <div
    v-if="lore.content"
    class="text-block"
  >
    {{ lore.content }}
  </div>
  <span
    v-else
    class="cell-muted"
  >无</span>
</template>

<style scoped>
.detail-desc {
  margin-top: 8px;
}

.detail-desc :deep(.el-descriptions__label) {
  width: 72px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.kw {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.kw__opt {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
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

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
