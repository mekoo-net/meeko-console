<script setup lang="ts">
import { ref, type Component } from 'vue';
import { ElMessage } from 'element-plus';
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Close,
  CopyDocument,
  Delete,
  Document,
  EditPen,
  Finished,
  Iphone,
  Plus,
} from '@element-plus/icons-vue';

import { messageKeys } from '../model/activityMessages';
import {
  FIELD_KINDS,
  MAX_FIELDS,
  MAX_OPTIONS,
  fieldKindLabels,
  hasOptions,
  newField,
  newOption,
  nextOptionValue,
  type FieldDraft,
  type FieldKind,
  type OptionDraft,
} from '../model/activityReward.types';

/**
 * 实物奖励的登记表格：用户领取时要填的每一项都由运营在这里搭。这里只定结构（id、类型、必填、选项），
 * 名称和选项文字写在语言包 `reward.{key}.field.{id}[.{选项}]`，卡片上显示默认语言里已写的文字。
 */
const fields = defineModel<FieldDraft[]>({ required: true });

const props = defineProps<{
  /** 奖励 key（草稿里的），拼要复制的语言包 key */
  rewardKey: string;
  /** 默认语言包里已写的文字，按存库时的 id 找 */
  label: (fieldId: string, option?: string) => string | null;
  /** 已有人领取：存过的项不能再改 id 和类型，旧记录才对得上名称 */
  locked: boolean;
}>();

const kindIcons: Record<FieldKind, Component> = {
  text: EditPen,
  textarea: Document,
  phone: Iphone,
  choice: CircleCheck,
  multi_choice: Finished,
};

const openUid = ref<number | null>(null);

const norm = (s: string): string => s.trim().toLowerCase();
const nameOf = (f: FieldDraft): string | null => props.label(f.savedId ?? norm(f.id));
const optionNameOf = (f: FieldDraft, o: OptionDraft): string | null => props.label(f.savedId ?? norm(f.id), o.savedValue ?? norm(o.value));
const fieldKey = (f: FieldDraft): string => messageKeys.registrationField(props.rewardKey || '{key}', norm(f.id) || '{id}');
const optionKey = (f: FieldDraft, o: OptionDraft): string =>
  messageKeys.registrationOption(props.rewardKey || '{key}', norm(f.id) || '{id}', norm(o.value) || '{value}');
const frozen = (f: FieldDraft): boolean => props.locked && f.savedId !== null;
const optionFrozen = (o: OptionDraft): boolean => props.locked && o.savedValue !== null;

function add(kind: FieldKind): void {
  const f = newField(kind, fields.value);
  fields.value.push(f);
  openUid.value = f.uid;
}

function toggle(f: FieldDraft): void {
  openUid.value = openUid.value === f.uid ? null : f.uid;
}

function move(i: number, by: -1 | 1): void {
  const list = fields.value;
  const j = i + by;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
}

function changeKind(f: FieldDraft, kind: FieldKind): void {
  f.kind = kind;
  if (hasOptions(kind) && !f.options.length) f.options.push(newOption('o1'), newOption('o2'));
}

function addOption(f: FieldDraft): void {
  f.options.push(newOption(nextOptionValue(f.options)));
}

async function copy(key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(key);
    ElMessage.success(`已复制 ${key}`);
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}
</script>

<template>
  <div class="fb">
    <p
      v-if="!fields.length"
      class="fb__empty"
    >
      还没有登记项，用户领取时不用填写任何内容
    </p>

    <div
      v-for="(f, i) in fields"
      :key="f.uid"
      class="fb-item"
      :class="{ 'is-open': openUid === f.uid }"
    >
      <div
        class="fb-item__head"
        @click="toggle(f)"
      >
        <span class="fb-item__icon">
          <el-icon><component :is="kindIcons[f.kind]" /></el-icon>
        </span>
        <div class="fb-item__title">
          <span
            class="fb-item__name"
            :class="{ 'is-missing': !nameOf(f) }"
          >{{ nameOf(f) ?? '未写名称' }}</span>
          <span class="fb-item__meta">
            {{ fieldKindLabels[f.kind] }} · <code>{{ f.id || '—' }}</code>
            <template v-if="hasOptions(f.kind)"> · {{ f.options.length }} 个选项</template>
          </span>
        </div>
        <div
          class="fb-item__actions"
          @click.stop
        >
          <el-checkbox
            v-model="f.required"
            size="small"
          >
            必填
          </el-checkbox>
          <el-button
            text
            size="small"
            :icon="ArrowUp"
            :disabled="i === 0"
            @click="move(i, -1)"
          />
          <el-button
            text
            size="small"
            :icon="ArrowDown"
            :disabled="i === fields.length - 1"
            @click="move(i, 1)"
          />
          <el-button
            text
            size="small"
            type="danger"
            :icon="Delete"
            @click="fields.splice(i, 1)"
          />
        </div>
      </div>

      <div
        v-if="openUid === f.uid"
        class="fb-item__body"
      >
        <div class="fb-grid">
          <span class="fb-grid__label">字段 ID</span>
          <el-input
            v-model="f.id"
            size="small"
            maxlength="32"
            class="fb-mono"
            :disabled="frozen(f)"
          />
          <span class="fb-grid__label">类型</span>
          <el-select
            :model-value="f.kind"
            size="small"
            :disabled="frozen(f)"
            @update:model-value="changeKind(f, $event)"
          >
            <el-option
              v-for="k in FIELD_KINDS"
              :key="k"
              :label="fieldKindLabels[k]"
              :value="k"
            />
          </el-select>
        </div>

        <div class="fb-line">
          <span class="fb-grid__label">名称</span>
          <span
            class="fb-line__text"
            :class="{ 'is-missing': !nameOf(f) }"
          >{{ nameOf(f) ?? '未写' }}</span>
          <button
            type="button"
            class="fb-key"
            @click="copy(fieldKey(f))"
          >
            <code>{{ fieldKey(f) }}</code>
            <el-icon><CopyDocument /></el-icon>
          </button>
        </div>

        <div
          v-if="hasOptions(f.kind)"
          class="fb-options"
        >
          <span class="fb-grid__label">选项</span>
          <div class="fb-options__list">
            <div
              v-for="(o, j) in f.options"
              :key="o.uid"
              class="fb-option"
            >
              <span
                class="fb-option__mark"
                :class="{ 'is-multi': f.kind === 'multi_choice' }"
              />
              <el-input
                v-model="o.value"
                size="small"
                maxlength="32"
                class="fb-option__value fb-mono"
                :disabled="optionFrozen(o)"
              />
              <span
                class="fb-option__text"
                :class="{ 'is-missing': !optionNameOf(f, o) }"
              >{{ optionNameOf(f, o) ?? `显示为 ${o.value || '—'}` }}</span>
              <el-tooltip
                :content="optionKey(f, o)"
                placement="top"
              >
                <el-button
                  text
                  size="small"
                  :icon="CopyDocument"
                  @click="copy(optionKey(f, o))"
                />
              </el-tooltip>
              <el-button
                text
                size="small"
                :icon="Close"
                :disabled="f.options.length <= 1"
                @click="f.options.splice(j, 1)"
              />
            </div>
            <el-button
              link
              type="primary"
              size="small"
              :icon="Plus"
              :disabled="f.options.length >= MAX_OPTIONS"
              class="fb-options__add"
              @click="addOption(f)"
            >
              添加选项
            </el-button>
          </div>
        </div>

        <p
          v-if="frozen(f)"
          class="fb-hint"
        >
          已有人领取，这一项的 id 和类型不能再改
        </p>
      </div>
    </div>

    <div class="fb-add">
      <el-button
        v-for="k in FIELD_KINDS"
        :key="k"
        size="small"
        :icon="kindIcons[k]"
        :disabled="fields.length >= MAX_FIELDS"
        @click="add(k)"
      >
        {{ fieldKindLabels[k] }}
      </el-button>
      <span class="fb-add__count">{{ fields.length }} / {{ MAX_FIELDS }}</span>
    </div>
  </div>
</template>

<style scoped>
.fb {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.fb__empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.is-missing {
  color: var(--el-color-warning);
}

.fb-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fb-item:hover {
  border-color: var(--el-border-color);
}
.fb-item.is-open {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
}
.fb-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 10px;
  cursor: pointer;
  user-select: none;
}
.fb-item__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}
.fb-item.is-open .fb-item__icon {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.fb-item__title {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.35;
}
.fb-item__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fb-item__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.fb-item__meta code,
.fb-mono :deep(input),
.fb-key code {
  font-family: var(--el-font-family-mono, monospace);
}
.fb-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.fb-item__actions .el-checkbox {
  margin-right: 6px;
}
.fb-item__actions .el-button + .el-button {
  margin-left: 0;
}

.fb-item__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px 48px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.fb-grid {
  display: grid;
  grid-template-columns: auto 1fr auto 120px;
  align-items: center;
  gap: 8px;
}
.fb-grid__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.fb-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.fb-line__text {
  flex-shrink: 0;
}
.fb-key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  cursor: pointer;
}
.fb-key code {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fb-key:hover {
  color: var(--el-color-primary);
}

.fb-options {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.fb-options > .fb-grid__label {
  padding-top: 4px;
}
.fb-options__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.fb-options__add {
  align-self: flex-start;
}
.fb-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fb-option .el-button + .el-button {
  margin-left: 0;
}
.fb-option__mark {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--el-border-color-darker);
  border-radius: 50%;
}
.fb-option__mark.is-multi {
  border-radius: 3px;
}
.fb-option__value {
  width: 120px;
  flex-shrink: 0;
}
.fb-option__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fb-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.fb-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
}
.fb-add .el-button + .el-button {
  margin-left: 0;
}
.fb-add__count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
