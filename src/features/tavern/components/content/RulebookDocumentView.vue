<script setup lang="ts">
/**
 * 一份规则书文档：变量 schema 和规则，规则一行一条、展开看整条 JSON（RULES.md §2–3）。
 * 世界的规则书带着当前值看（`values`，没写过的是「—」）；世界书商品里的规则书只是模板，没有当前值这一列。
 */
import {
  RuleScopeLabel,
  RuleVariableTypeLabel,
  type Rule,
  type RuleVariable,
  type RulebookDocument,
  type WorldRuntime,
} from '../../model/content.types';
import { jsonText, ruleRange, triggerText } from '../../model/contentFormat';
import JsonBlock from './JsonBlock.vue';

defineProps<{
  document: RulebookDocument;
  values?: ReadonlyMap<string, WorldRuntime['variables'][number]['values']>;
}>();
</script>

<template>
  <div class="doc">
    <h4 class="section-title">
      变量
      <span class="section-title__count">{{ document.variables.length }} 个</span>
    </h4>
    <el-table
      :data="document.variables"
      row-key="key"
      size="small"
      class="compact-table"
      empty-text="没有变量"
    >
      <el-table-column
        label="键"
        min-width="120"
      >
        <template #default="{ row }: { row: RuleVariable }">
          <span class="mono">{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="名称"
        min-width="100"
      >
        <template #default="{ row }: { row: RuleVariable }">
          <span v-if="row.label">{{ row.label }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="作用域"
        width="72"
      >
        <template #default="{ row }: { row: RuleVariable }">
          {{ RuleScopeLabel[row.scope] }}
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="72"
      >
        <template #default="{ row }: { row: RuleVariable }">
          {{ RuleVariableTypeLabel[row.type] }}
        </template>
      </el-table-column>
      <el-table-column
        label="默认"
        width="90"
      >
        <template #default="{ row }: { row: RuleVariable }">
          <span
            v-if="row.default !== undefined"
            class="mono"
          >{{ jsonText(row.default) }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="取值"
        min-width="140"
      >
        <template #default="{ row }: { row: RuleVariable }">
          <span
            v-if="ruleRange(row)"
            class="mono"
          >{{ ruleRange(row) }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="values"
        label="当前值"
        min-width="180"
      >
        <template #default="{ row }: { row: RuleVariable }">
          <div
            v-for="v in values.get(row.key) ?? []"
            :key="v.persona?.id ?? 'world'"
            class="cur"
          >
            <span
              v-if="v.persona"
              class="cur__who"
            >{{ v.persona.name }}:</span>
            <span class="mono">{{ v.value }}</span>
          </div>
          <span
            v-if="!values.has(row.key)"
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />

    <h4 class="section-title">
      规则
      <span class="section-title__count">{{ document.rules.length }} 条</span>
    </h4>
    <el-table
      :data="document.rules"
      row-key="id"
      size="small"
      class="compact-table"
      empty-text="没有规则"
    >
      <el-table-column type="expand">
        <template #default="{ row }: { row: Rule }">
          <div class="expand">
            <JsonBlock :value="row" />
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="ID"
        min-width="130"
      >
        <template #default="{ row }: { row: Rule }">
          <span class="mono">{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="标题"
        min-width="160"
      >
        <template #default="{ row }: { row: Rule }">
          <span v-if="row.title">{{ row.title }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
      <el-table-column
        label="启用"
        width="72"
      >
        <template #default="{ row }: { row: Rule }">
          <el-tag
            size="small"
            :type="row.enabled ? 'success' : 'info'"
            effect="plain"
          >
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="优先级"
        width="72"
        align="right"
      >
        <template #default="{ row }: { row: Rule }">
          <span class="mono">{{ row.priority }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="触发"
        min-width="180"
      >
        <template #default="{ row }: { row: Rule }">
          {{ triggerText(row.on) }}
          <span
            v-if="row.once"
            class="sub"
          >仅一次</span>
          <span
            v-if="row.cooldown"
            class="sub"
          >冷却 {{ row.cooldown }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="条件"
        min-width="200"
      >
        <template #default="{ row }: { row: Rule }">
          <span
            v-if="row.if"
            class="mono"
          >{{ row.if }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.doc {
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

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.cur {
  display: flex;
  gap: 4px;
  line-height: 1.5;
}

.cur__who {
  color: var(--el-text-color-secondary);
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.expand {
  padding: 4px 48px 4px 48px;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}
</style>
