<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { getVoucherPort } from '../services';
import {
  VoucherTemplateStatus,
  type CreateVoucherActivityInput,
  type UpdateVoucherActivityInput,
  type VoucherActivity,
  type VoucherTemplate,
} from '../model/voucher.types';

const props = defineProps<{
  modelValue: boolean;
  activity?: VoucherActivity | null;
  presetTemplateId?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [payload: CreateVoucherActivityInput];
  update: [id: string, payload: UpdateVoucherActivityInput];
}>();

const port = getVoucherPort();
const templates = ref<VoucherTemplate[]>([]);

interface FormState {
  name: string;
  templateIds: string[];
  pickCount: number;
  hasWindow: boolean;
  window: [Date, Date] | null;
  totalQuota: number | null;
  perUserLimit: number | null;
}

function emptyForm(): FormState {
  return {
    name: '',
    templateIds: [],
    pickCount: 1,
    hasWindow: false,
    window: null,
    totalQuota: null,
    perUserLimit: 1,
  };
}

const form = reactive<FormState>(emptyForm());

const isEdit = computed(() => !!props.activity);
const dialogTitle = computed(() => (isEdit.value ? '编辑领券活动' : '新建领券活动'));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const isMulti = computed(() => form.templateIds.length > 1);

const pickRuleText = computed(() => {
  const n = form.templateIds.length;
  if (n === 0) return '请先选择投放的抵扣券';
  if (n === 1) return '单券：用户领取后直接获得这 1 张券';
  const m = Math.min(Math.max(1, form.pickCount), n);
  if (m >= n) return `${n} 选 ${n}：用户领取后获得全部 ${n} 张券`;
  return `${n} 选 ${m}：用户从 ${n} 张券中自选 ${m} 张领取（领取时需带券 Key）`;
});

const editingItems = computed(() => props.activity?.items ?? []);

async function loadTemplates(): Promise<void> {
  const r = await port.listTemplates({ page: 1, pageSize: 100, includeArchived: false });
  if (r.success) templates.value = r.data.items.filter((t) => t.status === VoucherTemplateStatus.Active);
}

watch(
  () => [props.modelValue, props.activity] as const,
  ([open, activity]) => {
    if (!open) return;
    void loadTemplates();
    Object.assign(form, emptyForm());
    if (activity) {
      form.name = activity.name;
      form.templateIds = activity.items.map((i) => i.templateId);
      form.pickCount = activity.pickCount;
      form.totalQuota = activity.totalQuota ?? null;
      form.perUserLimit = activity.perUserLimit ?? null;
      if (activity.startAtUtc && activity.endAtUtc) {
        form.hasWindow = true;
        form.window = [new Date(activity.startAtUtc), new Date(activity.endAtUtc)];
      }
    } else if (props.presetTemplateId) {
      form.templateIds = [props.presetTemplateId];
    }
  },
  { immediate: true },
);

// 选券数量变化时把 pickCount 收敛到 [1, N]；单券强制为 1。
watch(
  () => form.templateIds.length,
  (n) => {
    if (n <= 1) form.pickCount = 1;
    else if (form.pickCount > n) form.pickCount = n;
    else if (form.pickCount < 1) form.pickCount = 1;
  },
);

function windowFields(): { startAtUtc: number | null; endAtUtc: number | null } {
  if (form.hasWindow && form.window) {
    // 后端 DateTime 走 Unix 毫秒，发 epoch 毫秒而非 ISO 字符串。
    return {
      startAtUtc: form.window[0]?.getTime() ?? null,
      endAtUtc: form.window[1]?.getTime() ?? null,
    };
  }
  return { startAtUtc: null, endAtUtc: null };
}

function onSubmit(): void {
  if (!form.name.trim()) {
    ElMessage.warning('请输入活动名称');
    return;
  }
  const win = windowFields();
  if (isEdit.value && props.activity) {
    emit('update', props.activity.id, {
      name: form.name.trim(),
      ...win,
      totalQuota: form.totalQuota,
      perUserLimit: form.perUserLimit,
    });
    return;
  }
  if (form.templateIds.length === 0) {
    ElMessage.warning('请至少选择一张抵扣券');
    return;
  }
  emit('create', {
    name: form.name.trim(),
    templateIds: [...form.templateIds],
    pickCount: isMulti.value ? Math.min(Math.max(1, form.pickCount), form.templateIds.length) : 1,
    ...win,
    totalQuota: form.totalQuota,
    perUserLimit: form.perUserLimit,
  });
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="560px"
    destroy-on-close
  >
    <el-form label-width="100px">
      <el-form-item label="活动名称">
        <el-input
          v-model="form.name"
          maxlength="64"
          placeholder="如：新人注册领券"
        />
      </el-form-item>

      <el-form-item label="投放券">
        <el-select
          v-if="!isEdit"
          v-model="form.templateIds"
          placeholder="选择投放的抵扣券（可多选）"
          multiple
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="t in templates"
            :key="t.id"
            :label="`${t.name}（${t.code}）`"
            :value="t.id"
          />
        </el-select>
        <div
          v-else
          class="ro-items"
        >
          <el-tag
            v-for="it in editingItems"
            :key="it.templateId"
            size="small"
            effect="plain"
          >
            {{ it.templateName ?? it.templateId }}（{{ it.templateCode }}）
          </el-tag>
        </div>
      </el-form-item>

      <el-form-item
        v-if="isMulti && !isEdit"
        label="领取张数"
      >
        <el-input-number
          v-model="form.pickCount"
          :min="1"
          :max="form.templateIds.length"
          :step="1"
          :precision="0"
        />
        <span class="hint">从已选 {{ form.templateIds.length }} 张中可领的张数</span>
      </el-form-item>

      <el-form-item label="领取规则">
        <span class="rule-text">{{ pickRuleText }}</span>
      </el-form-item>

      <el-form-item label="限定领取期">
        <el-switch v-model="form.hasWindow" />
        <el-date-picker
          v-if="form.hasWindow"
          v-model="form.window"
          type="datetimerange"
          range-separator="至"
          start-placeholder="领取开始"
          end-placeholder="领取结束"
          style="margin-left: 12px"
        />
        <span
          v-else
          class="hint"
        >不限定则长期开放领取</span>
      </el-form-item>

      <el-form-item label="活动总量">
        <el-input-number
          v-model="form.totalQuota"
          :min="1"
          :step="100"
          :precision="0"
        />
        <span class="hint">本活动最多可领数量，留空不限</span>
      </el-form-item>

      <el-form-item label="每人限领">
        <el-input-number
          v-model="form.perUserLimit"
          :min="1"
          :step="1"
          :precision="0"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        @click="onSubmit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rule-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.ro-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
