<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Document, Download } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  CodeStatusLabel,
  CodeStatusTone,
  ExportScopeLabel,
  type ExportedCode,
  type KeysPayload,
  type PlainMode,
} from '../model/redemption.types';

const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ (e: 'closed'): void }>();
const props = defineProps<{ payload: KeysPayload; mode: PlainMode }>();

const PREVIEW = 50;

/** 生成 / 追加的卡全是未兑换，补齐成和导出一样的明细，下面只处理一种形状。 */
const rows = computed<ExportedCode[]>(() =>
  'items' in props.payload
    ? props.payload.items
    : props.payload.codes.map((code) => ({ code, status: 'unused', redeemedAtUtc: null, redeemedBy: null })),
);
const codes = computed(() => rows.value.map((r) => r.code));
const scope = computed(() => ('scope' in props.payload ? props.payload.scope : 'unused'));
/** 已兑换 / 全部导出是对账用：只给带状态的 CSV，不给能直接导进发卡网的 TXT 与复制。 */
const forReconcile = computed(() => scope.value !== 'unused');

const TITLE: Record<PlainMode, string> = { created: '已生成', appended: '已追加', exported: '已导出' };
const title = computed(() => {
  const what = props.mode === 'exported' ? ExportScopeLabel[scope.value] : '';
  return `${TITLE[props.mode]} ${rows.value.length} 张${what}卡密`;
});
const preview = computed(() => rows.value.slice(0, PREVIEW));
const expiresText = computed(() =>
  props.payload.batch.expiresAtUtc ? formatDateTime(props.payload.batch.expiresAtUtc) : '长期有效',
);
const fileBase = computed(() => {
  const what = props.mode === 'exported' ? `-${ExportScopeLabel[scope.value]}` : '';
  return `${props.payload.batch.id}${what}-${rows.value.length}张`;
});

function accountText(r: ExportedCode): string {
  return r.redeemedBy ? (r.redeemedBy.email ?? r.redeemedBy.displayName ?? `UID ${r.redeemedBy.uid}`) : '';
}

function save(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 发卡网批量导入卡密基本都是「一行一张」的纯文本。 */
function downloadTxt(): void {
  save(codes.value.join('\r\n'), `${fileBase.value}.txt`, 'text/plain;charset=utf-8');
}

/** 带 BOM，Excel 直接打开中文不乱码；给财务留底对账用。对账导出多带状态与兑换方。 */
function downloadCsv(): void {
  const b = props.payload.batch;
  const head = ['卡密', '面值(元)', '批次号', '批次名称', '销售渠道', '有效期至'];
  const table = [forReconcile.value ? [...head, '状态', '兑换账户', '兑换账户 UID', '兑换时间'] : head];
  for (const r of rows.value) {
    const base = [r.code, String(b.faceValue), b.id, b.name, b.salesChannel ?? '', expiresText.value];
    table.push(
      forReconcile.value
        ? [...base, CodeStatusLabel[r.status], accountText(r), r.redeemedBy?.uid ?? '', r.redeemedAtUtc ? formatDateTime(r.redeemedAtUtc) : '']
        : base,
    );
  }
  const csv = table.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
  save(`﻿${csv}`, `${fileBase.value}.csv`, 'text/csv;charset=utf-8');
}

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(codes.value.join('\n'));
    ElMessage.success(`已复制 ${codes.value.length} 张卡密`);
  } catch {
    ElMessage.error('复制失败，请改用下载');
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="forReconcile ? '780px' : '600px'"
    align-center
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="emit('closed')"
  >
    <div class="batch">
      <div class="batch__name">
        {{ payload.batch.name }}
      </div>
      <div class="batch__meta">
        <code>{{ payload.batch.id }}</code>
        <span v-if="payload.batch.salesChannel">{{ payload.batch.salesChannel }}</span>
        <span>面值 {{ formatMoney(payload.batch.faceValue, { currency: 'CNY' }) }}</span>
        <span>有效期 {{ expiresText }}</span>
      </div>
    </div>

    <div class="keys">
      <div
        v-for="(r, idx) in preview"
        :key="r.code"
        class="keys__row"
      >
        <span class="keys__idx">{{ idx + 1 }}</span>
        <code>{{ r.code }}</code>
        <template v-if="forReconcile">
          <StatusTag
            :label="CodeStatusLabel[r.status]"
            :tone="CodeStatusTone[r.status]"
          />
          <span
            v-if="r.redeemedBy"
            class="keys__who"
          >{{ accountText(r) }} · {{ formatDateTime(r.redeemedAtUtc, 'YY-MM-DD HH:mm') }}</span>
        </template>
      </div>
      <div
        v-if="rows.length > PREVIEW"
        class="keys__more"
      >
        … 另有 {{ rows.length - PREVIEW }} 张
      </div>
    </div>

    <template #footer>
      <div class="foot">
        <el-button
          v-if="!forReconcile"
          type="primary"
          :icon="Download"
          @click="downloadTxt"
        >
          下载 TXT
        </el-button>
        <el-button
          :type="forReconcile ? 'primary' : undefined"
          :icon="Document"
          @click="downloadCsv"
        >
          下载 CSV
        </el-button>
        <el-button
          v-if="!forReconcile"
          :icon="CopyDocument"
          @click="copyAll"
        >
          复制全部
        </el-button>
        <el-button
          class="foot__done"
          @click="visible = false"
        >
          我已保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.batch {
  margin-bottom: 12px;
}
.batch__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.batch__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.keys {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  padding: 6px 0;
}
.keys__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 14px;
}
.keys__row code {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  user-select: all;
}
.keys__who {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.keys__idx {
  width: 28px;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.keys__more {
  padding: 8px 14px 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: 4px;
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.foot :deep(.el-button + .el-button) {
  margin-left: 0;
}
.foot__done {
  margin-left: auto !important;
}
</style>
