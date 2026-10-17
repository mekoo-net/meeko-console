<script setup lang="ts">
import { ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

/**
 * 渠道配置 LinkList 字段的行编辑器。渠道配置只存字符串，所以 v-model 是 JSON 数组
 * `[{ name, url, description }]`；格式校验以后端保存时为准，这里只负责编辑。
 */
const props = defineProps<{
  modelValue?: string;
  /** 条目叫什么（字段 label，如「发卡网」），用于按钮与空态文案。 */
  itemLabel: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
}>();

interface LinkRow {
  name: string;
  url: string;
  description: string;
}

const rows = ref<LinkRow[]>([]);
// 记住最后一次发出去的值：父级把它原样回传时不必重新解析，否则正在编辑的空行会被冲掉。
let lastEmitted: string | null = null;

function parse(raw: string | undefined): LinkRow[] {
  if (!raw?.trim()) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((x) => ({
      name: String(x?.name ?? ''),
      url: String(x?.url ?? ''),
      description: String(x?.description ?? ''),
    }));
  } catch {
    return [];
  }
}

function serialize(list: LinkRow[]): string {
  // 整行都没填的视为没加，免得点了「添加」又不用就保存不了。
  const kept = list
    .map((r) => ({ name: r.name.trim(), url: r.url.trim(), description: r.description.trim() }))
    .filter((r) => r.name || r.url || r.description)
    .map((r) => (r.description ? r : { name: r.name, url: r.url }));
  return kept.length ? JSON.stringify(kept) : '';
}

watch(
  () => props.modelValue,
  (v) => {
    if (v === lastEmitted) return;
    rows.value = parse(v);
  },
  { immediate: true },
);

watch(
  rows,
  (list) => {
    lastEmitted = serialize(list);
    if (lastEmitted !== (props.modelValue ?? '')) emit('update:modelValue', lastEmitted);
  },
  { deep: true },
);

function addRow(): void {
  rows.value.push({ name: '', url: '', description: '' });
}

function removeRow(idx: number): void {
  rows.value.splice(idx, 1);
}
</script>

<template>
  <div class="links">
    <template v-if="rows.length">
      <div class="links__head">
        <span>名称</span>
        <span>链接</span>
        <span>说明（选填）</span>
        <span />
      </div>
      <div
        v-for="(row, idx) in rows"
        :key="idx"
        class="links__row"
      >
        <el-input
          v-model="row.name"
          placeholder="如 Meeko 官方小店"
          maxlength="32"
        />
        <el-input
          v-model="row.url"
          placeholder="https://"
        />
        <el-input
          v-model="row.description"
          placeholder="如 支持支付宝、微信"
          maxlength="60"
        />
        <el-button
          :icon="Delete"
          link
          type="danger"
          @click="removeRow(idx)"
        />
      </div>
    </template>
    <div
      v-else
      class="links__empty"
    >
      尚未添加{{ itemLabel }}
    </div>
    <el-button
      :icon="Plus"
      link
      type="primary"
      class="links__add"
      @click="addRow"
    >
      添加{{ itemLabel }}
    </el-button>
  </div>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}
.links__head,
.links__row {
  display: grid;
  grid-template-columns: 130px 1.4fr 1fr 28px;
  gap: 8px;
  align-items: center;
}
.links__head {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
.links__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.links__add {
  align-self: flex-start;
}
</style>
