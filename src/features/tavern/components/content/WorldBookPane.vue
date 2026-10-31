<script setup lang="ts">
/**
 * 世界书：左边节点树，右边选中节点的全部字段。
 * 文档里节点是平铺数组、用 `parent` 连成树，同层按 `order` 再按标题排（WORLDBOOK.md §2）；
 * 分组是文件夹，关掉的节点置灰。文档省略的字段，读进来时已补上默认值（启用、所有人、常驻、100%）。
 */
import { computed, ref, watch, type Component } from 'vue';
import { Document, Folder } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';

import {
  WorldBookAudienceLabel,
  WorldBookNodeTypeLabel,
  WorldBookNodeTypeTone,
  type WorldBook,
  type WorldBookNode,
  type WorldBookNodeType,
} from '../../model/content.types';
import WorldBookLoreDetail from './WorldBookLoreDetail.vue';

const props = defineProps<{ worldBook: WorldBook | null }>();

const NodeIcon = { group: Folder, lore: Document } satisfies Record<WorldBookNodeType, Component>;

interface BookTreeNode {
  id: string;
  label: string;
  node: WorldBookNode;
  children: BookTreeNode[];
}

const treeProps = { label: 'label', children: 'children' };

const tree = computed<BookTreeNode[]>(() => {
  const nodes = props.worldBook?.document.nodes ?? [];
  const byId = new Map<string, BookTreeNode>(
    nodes.map((n) => [n.id, { id: n.id, label: n.title || n.id, node: n, children: [] }]),
  );
  const roots: BookTreeNode[] = [];
  for (const t of byId.values()) {
    // 父节点不在文档里（理论上写入校验挡住了）就挂到根上，不让节点悄悄消失。
    const parent = t.node.parent ? byId.get(t.node.parent) : undefined;
    (parent ? parent.children : roots).push(t);
  }
  const sort = (list: BookTreeNode[]): BookTreeNode[] => {
    list.sort((a, b) => a.node.order - b.node.order || a.label.localeCompare(b.label, 'zh-CN'));
    for (const t of list) sort(t.children);
    return list;
  };
  return sort(roots);
});

const selectedId = ref<string | null>(null);

const selected = computed<WorldBookNode | null>(
  () => props.worldBook?.document.nodes.find((n) => n.id === selectedId.value) ?? null,
);

/** 换了世界书（重读之后）选中的节点还在就留着，不在了退到第一个节点。 */
watch(
  tree,
  (t) => {
    if (!selected.value) selectedId.value = t[0]?.id ?? null;
  },
  { immediate: true },
);
</script>

<template>
  <EmptyState
    v-if="!worldBook"
    title="还没有世界书"
  />
  <div
    v-else
    class="book"
  >
    <div class="book__meta">
      版本 {{ worldBook.version }} · 共 {{ worldBook.document.nodes.length }} 个节点 · 更新于 {{ formatDateTime(worldBook.updatedAt, 'YYYY-MM-DD HH:mm:ss') }}
    </div>

    <div class="book__body">
      <div class="book__tree">
        <el-tree
          :data="tree"
          :props="treeProps"
          node-key="id"
          :current-node-key="selectedId ?? undefined"
          highlight-current
          default-expand-all
          :expand-on-click-node="false"
          empty-text="没有节点"
          @node-click="(data: BookTreeNode) => (selectedId = data.id)"
        >
          <template #default="{ data }: { data: BookTreeNode }">
            <span
              class="tree-node"
              :class="{ 'tree-node--off': !data.node.enabled }"
            >
              <el-icon class="tree-node__icon">
                <component :is="NodeIcon[data.node.type]" />
              </el-icon>
              <span class="tree-node__label">{{ data.label }}</span>
              <el-tag
                v-if="data.node.audience === 'director'"
                size="small"
                type="warning"
                effect="plain"
                class="tree-node__tag"
              >
                导演
              </el-tag>
              <el-tag
                v-if="data.node.when"
                size="small"
                type="info"
                effect="plain"
                class="tree-node__tag"
                :title="data.node.when"
              >
                条件
              </el-tag>
            </span>
          </template>
        </el-tree>
      </div>

      <div class="book__detail">
        <template v-if="selected">
          <div class="detail-title">
            <span class="detail-title__text">{{ selected.title || selected.id }}</span>
            <el-tag
              size="small"
              :type="WorldBookNodeTypeTone[selected.type]"
              effect="plain"
            >
              {{ WorldBookNodeTypeLabel[selected.type] }}
            </el-tag>
            <el-tag
              v-if="!selected.enabled"
              size="small"
              type="info"
              effect="plain"
            >
              已停用
            </el-tag>
          </div>
          <el-descriptions
            :column="2"
            border
            size="small"
            class="detail-desc"
          >
            <el-descriptions-item label="ID">
              <span class="mono">{{ selected.id }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="排序">
              <span class="mono">{{ selected.order }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="启用">
              {{ selected.enabled ? '是' : '否' }}
            </el-descriptions-item>
            <el-descriptions-item label="可见">
              {{ WorldBookAudienceLabel[selected.audience] }}
            </el-descriptions-item>
            <el-descriptions-item
              label="条件"
              :span="2"
            >
              <span
                v-if="selected.when"
                class="mono"
              >{{ selected.when }}</span>
              <span
                v-else
                class="cell-muted"
              >—</span>
            </el-descriptions-item>
          </el-descriptions>
          <WorldBookLoreDetail
            v-if="selected.type === 'lore'"
            :lore="selected"
          />
        </template>
        <span
          v-else
          class="cell-muted"
        >选一个节点</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.book__meta {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.book__body {
  flex: 1;
  min-height: 0;
  display: flex;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.book__tree {
  flex-shrink: 0;
  width: 300px;
  padding: 8px 4px;
  overflow: auto;
  border-right: 1px solid var(--el-border-color-lighter);
}

.book__detail {
  flex: 1;
  min-width: 0;
  padding: 14px 18px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}

.tree-node--off {
  color: var(--el-text-color-placeholder);
}

.tree-node__icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.tree-node__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node__tag {
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.detail-title__text {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.detail-desc :deep(.el-descriptions__label) {
  width: 72px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
