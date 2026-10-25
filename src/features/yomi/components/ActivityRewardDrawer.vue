<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import ActivityFieldBuilder from './ActivityFieldBuilder.vue';
import ActivityRuleBuilder from './ActivityRuleBuilder.vue';
import { getYomiActivityRewardPort } from '../services';
import { messageKeys, type LocaleMessages } from '../model/activityMessages';
import {
  REWARD_KEY_PATTERN,
  REWARD_TYPES,
  acceptsForm,
  claimWidgetSnippet,
  describeVoucherTemplate,
  draftToInput,
  fieldsProblem,
  emptyRewardDraft,
  rewardToDraft,
  rewardTypeLabels,
  type ActivityReward,
  type CodeImportResult,
  type FieldRenames,
  type RewardDraft,
  type RewardFacts,
  type VoucherTemplate,
} from '../model/activityReward.types';

const visible = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  activityId: string;
  /** null 表示新建 */
  reward: ActivityReward | null;
  facts: RewardFacts | null;
  /** 本活动全部奖励，用于 key 查重和「先领 A 才能领 B」 */
  all: readonly ActivityReward[];
  /** key → 默认语言的名称，显示用 */
  names: ReadonlyMap<string, string>;
  /** 编辑器里的默认语言语言包，看哪些条件写了自定义提示 */
  pack: LocaleMessages;
}>();

const emit = defineEmits<{
  /** 奖励存好了；from 是保存前的 key（新建为 null），语言包里它名下的 key 跟着改名、删掉用不上的 */
  saved: [reward: ActivityReward, change?: { from: string | null; renames?: FieldRenames | null }];
}>();

const port = getYomiActivityRewardPort();

const form = ref<RewardDraft>(emptyRewardDraft());
const unlimited = ref(true);
const saving = ref(false);
const current = ref<ActivityReward | null>(null);

watch(visible, (open) => {
  if (!open) return;
  current.value = props.reward;
  form.value = props.reward ? rewardToDraft(props.reward) : emptyRewardDraft();
  unlimited.value = form.value.totalQuota === null;
  codesText.value = '';
  lastImport.value = null;
  if (form.value.type === 'voucher') void loadTemplates();
});

// ---------------- 代金券模板 ----------------

const templates = ref<VoucherTemplate[] | null>(null);
const templatesLoading = ref(false);

async function loadTemplates(): Promise<void> {
  if (templatesLoading.value) return;
  templatesLoading.value = true;
  const r = await port.voucherTemplates();
  templatesLoading.value = false;
  if (r.success) templates.value = r.data;
  else ElMessage.error(r.error.message);
}

watch(() => form.value.type, (t) => {
  if (t === 'voucher' && templates.value === null) void loadTemplates();
});

// 已选的模板可能已经在 Billing 暂停（不在可选列表里），也要能显示出来。
const templateOptions = computed(() => {
  const list = templates.value ?? [];
  const chosen = current.value?.voucherTemplate ?? null;
  return chosen && !list.some((t) => t.id === chosen.id) ? [chosen, ...list] : list;
});

const selectedTemplate = computed(() => templateOptions.value.find((t) => t.id === form.value.specs.voucher.templateId) ?? null);
const templateHint = computed(() => {
  const t = selectedTemplate.value;
  if (!t) return '';
  return describeVoucherTemplate(t) + (t.status === 'active' ? '' : '（已暂停）');
});

const isNew = computed(() => !current.value);
const typeLocked = computed(() => (current.value?.claimedCount ?? 0) > 0);
const siblings = computed(() => props.all
  .filter((r) => r.id !== current.value?.id)
  .map((r) => ({ key: r.key, name: props.names.get(r.key) ?? r.key })));

const draftKey = computed(() => form.value.key.trim().toLowerCase());
/** 语言包里已经写了自定义提示的条件；语言包的 key 跟着库里的奖励 key，改 key 要保存后才搬。 */
const hinted = computed(() => {
  const key = current.value?.key;
  return new Set(key ? form.value.rules.rules.filter((r) => props.pack[messageKeys.ruleMessage(key, r.id)]?.trim()).map((r) => r.id) : []);
});
/** 登记项、选项在默认语言包里已写的文字；按存库时的奖励 key 找，改 key 要保存后才搬。 */
function fieldLabel(fieldId: string, option?: string): string | null {
  const key = current.value?.key;
  if (!key) return null;
  const k = option === undefined ? messageKeys.registrationField(key, fieldId) : messageKeys.registrationOption(key, fieldId, option);
  return props.pack[k]?.trim() || null;
}

const quotaHint = computed(() => (current.value ? `已领 ${current.value.claimedCount}` : ''));
const codePool = computed(() => current.value?.codePool ?? { available: 0, assigned: 0 });

function typeDisabled(t: string): boolean {
  return typeLocked.value && t !== form.value.type;
}

function problem(): string | null {
  const f = form.value;
  const key = f.key.trim().toLowerCase();
  if (!REWARD_KEY_PATTERN.test(key)) return 'key 只能用小写字母、数字和 -，以字母或数字开头';
  if (props.all.some((r) => r.key === key && r.id !== current.value?.id)) return `本活动已有 key 为「${key}」的奖励`;
  if (f.type === 'voucher' && !f.specs.voucher.templateId) return '要选一张券模板';
  if (acceptsForm(f.type)) {
    const fields = fieldsProblem(f.fields);
    if (fields) return fields;
  }
  if (!unlimited.value && !(f.totalQuota && f.totalQuota >= 1)) return '总量至少 1，或者选不限量';
  if (!unlimited.value && current.value && (f.totalQuota ?? 0) < current.value.claimedCount) return `总量不能小于已领取的 ${current.value.claimedCount} 份`;
  return null;
}


async function save(): Promise<void> {
  const p = problem();
  if (p) {
    ElMessage.warning(p);
    return;
  }
  saving.value = true;
  try {
    const from = current.value?.key ?? null;
    const input = draftToInput({ ...form.value, totalQuota: unlimited.value ? null : form.value.totalQuota });
    const r = current.value
      ? await port.update(props.activityId, current.value.id, input)
      : await port.create(props.activityId, input);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    emit('saved', r.data, { from, renames: input.renames });
    if (isNew.value && r.data.spec.type === 'code') {
      // 卡密类新建后留在抽屉里，接着导入卡密。
      current.value = r.data;
      ElMessage.success('已创建，接着在下方导入卡密');
      return;
    }
    ElMessage.success('奖励已保存');
    visible.value = false;
  } finally {
    saving.value = false;
  }
}

// ---------------- 卡密 ----------------

const codesText = ref('');
const importing = ref(false);
const lastImport = ref<CodeImportResult | null>(null);
const pendingLines = computed(() => codesText.value.split('\n').filter((l) => l.trim()).length);
const importSummary = computed(() => {
  const r = lastImport.value;
  if (!r) return '';
  return `新增 ${r.imported}，重复 ${r.duplicates}${r.invalid ? `，过长 ${r.invalid}` : ''}`;
});

async function importCodes(): Promise<void> {
  if (!current.value || !pendingLines.value) return;
  importing.value = true;
  try {
    const r = await port.importCodes(props.activityId, current.value.id, codesText.value);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    lastImport.value = r.data;
    codesText.value = '';
    const reward: ActivityReward = { ...current.value, codePool: { available: r.data.available, assigned: current.value.codePool?.assigned ?? 0 } };
    current.value = reward;
    emit('saved', reward);
    ElMessage.success(`导入 ${r.data.imported} 张${r.data.duplicates ? `，跳过重复 ${r.data.duplicates} 张` : ''}`);
  } finally {
    importing.value = false;
  }
}

async function copySnippet(): Promise<void> {
  try {
    await navigator.clipboard.writeText(claimWidgetSnippet(form.value.key.trim().toLowerCase()));
    ElMessage.success('已复制领取按钮代码');
  } catch {
    ElMessage.warning('复制失败，请手动输入');
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="isNew ? '添加奖励' : `编辑奖励 · ${names.get(current!.key) ?? current!.key}`"
    size="620px"
    append-to-body
    destroy-on-close
  >
    <el-form
      label-position="top"
      class="rf"
    >
      <el-form-item label="类型">
        <el-radio-group v-model="form.type">
          <el-radio-button
            v-for="t in REWARD_TYPES"
            :key="t"
            :value="t"
            :disabled="typeDisabled(t)"
          >
            {{ rewardTypeLabels[t] }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Key">
        <el-input
          v-model="form.key"
          maxlength="48"
          placeholder="jd-50"
        >
          <template #append>
            <el-button
              :disabled="!REWARD_KEY_PATTERN.test(form.key.trim().toLowerCase())"
              @click="copySnippet"
            >
              复制按钮代码
            </el-button>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item
        v-if="form.type === 'voucher'"
        label="券模板"
      >
        <el-select
          v-model="form.specs.voucher.templateId"
          filterable
          placeholder="选择券模板"
          :loading="templatesLoading"
          no-data-text="暂无可发的券模板"
          style="width: 100%"
        >
          <el-option
            v-for="t in templateOptions"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          >
            <div class="tpl">
              <span class="tpl__name">{{ t.name }}</span>
              <span class="tpl__desc">{{ describeVoucherTemplate(t) }}</span>
            </div>
          </el-option>
        </el-select>
        <p
          v-if="templateHint"
          class="rf__hint"
        >
          {{ templateHint }}
        </p>
      </el-form-item>
      <el-form-item
        v-if="acceptsForm(form.type)"
        label="登记表格"
      >
        <ActivityFieldBuilder
          v-model="form.fields"
          :reward-key="draftKey"
          :label="fieldLabel"
          :locked="typeLocked"
        />
      </el-form-item>

      <div class="rf__grid rf__grid--3">
        <el-form-item label="总量">
          <div class="rf__quota">
            <el-checkbox v-model="unlimited">
              不限量
            </el-checkbox>
            <el-input-number
              v-if="!unlimited"
              :model-value="form.totalQuota ?? undefined"
              :min="1"
              :precision="0"
              controls-position="right"
              size="small"
              @update:model-value="(v: number | undefined) => (form.totalQuota = v ?? null)"
            />
          </div>
          <p
            v-if="current"
            class="rf__hint"
          >
            {{ quotaHint }}
          </p>
        </el-form-item>
        <el-form-item label="每人限领">
          <el-input-number
            v-model="form.perUserLimit"
            :min="1"
            :max="100"
            :precision="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number
            v-model="form.sortOrder"
            :step="10"
            :precision="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <el-form-item label="领取条件">
        <ActivityRuleBuilder
          v-model="form.rules"
          :facts="facts?.facts ?? []"
          :siblings="siblings"
          :reward-key="draftKey"
          :hinted="hinted"
          class="rf__rules"
        />
      </el-form-item>

      <el-form-item label="状态">
        <el-switch
          v-model="form.isEnabled"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>

      <section
        v-if="form.type === 'code' && current"
        class="rf__codes"
      >
        <div class="rf__codes-head">
          <span class="rf__codes-title">卡密池</span>
          <span class="rf__codes-stat">可领 <b>{{ codePool.available }}</b> · 已发 {{ codePool.assigned }}</span>
        </div>
        <el-alert
          v-if="facts && !facts.codeKeyConfigured"
          type="warning"
          :closable="false"
          show-icon
          title="未配置卡密密钥，暂不能导入"
        />
        <template v-else>
          <el-input
            v-model="codesText"
            type="textarea"
            :rows="6"
            class="rf__codes-input"
            placeholder="每行一张"
          />
          <div class="rf__codes-foot">
            <span />
            <el-button
              type="primary"
              plain
              :loading="importing"
              :disabled="!pendingLines"
              @click="importCodes"
            >
              导入 {{ pendingLines || '' }} 张
            </el-button>
          </div>
          <p
            v-if="importSummary"
            class="rf__hint"
          >
            {{ importSummary }}
          </p>
        </template>
      </section>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        {{ current && !isNew ? '关闭' : '取消' }}
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="save"
      >
        保存奖励
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.rf :deep(.el-form-item) {
  margin-bottom: 16px;
}
.rf__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.rf__grid--3 {
  grid-template-columns: 1.3fr 1fr 1fr;
}
.rf__hint {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.tpl {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.tpl__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rf__quota {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rf__rules {
  width: 100%;
}
.rf__codes {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
.rf__codes-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rf__codes-title {
  font-size: 13px;
  font-weight: 600;
}
.rf__codes-stat {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rf__codes-input :deep(textarea) {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
}
.rf__codes-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}
</style>
