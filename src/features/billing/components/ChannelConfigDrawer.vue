<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { View, Hide } from '@element-plus/icons-vue';

import type {
  ChannelConfigField,
  ChannelConfigSchema,
  PaymentChannel,
} from '../model/paymentChannel.types';
import { channelColor } from '../model/paymentChannel.types';
import { getPaymentChannelPort } from '../services';

const props = defineProps<{
  visible: boolean;
  channel: PaymentChannel | null;
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'saved'): void;
}>();

const port = getPaymentChannelPort();
const saving = ref(false);
const loading = ref(false);
const schema = ref<ChannelConfigSchema | null>(null);
const values = ref<Record<string, string>>({});
const showSecret = ref<Record<string, boolean>>({});

const drawerVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const drawerTitle = computed(() => {
  if (!props.channel) return '渠道配置';
  return `${props.channel.name} 配置`;
});

const accentColor = computed(() => (props.channel ? channelColor(props.channel.code) : '#595959'));

watch(
  () => props.visible,
  async (open) => {
    if (!open || !props.channel) return;
    loading.value = true;
    schema.value = null;
    values.value = {};
    showSecret.value = {};
    try {
      const [schemaRes, configRes] = await Promise.all([
        port.getChannelSchema(props.channel.code),
        port.getChannelConfig(props.channel.code),
      ]);
      if (schemaRes.success) schema.value = schemaRes.data;
      if (configRes.success && configRes.data) {
        values.value = { ...configRes.data.values };
      }
      for (const f of schema.value?.fields ?? []) {
        if (!(f.key in values.value)) values.value[f.key] = '';
      }
    } finally {
      loading.value = false;
    }
  },
);

function fieldInputType(field: ChannelConfigField): 'text' | 'password' | 'textarea' {
  if (field.type === 'TextArea') return 'textarea';
  if (field.isSecret && !showSecret.value[field.key]) return 'password';
  return 'text';
}

function toggleSecret(key: string): void {
  showSecret.value[key] = !showSecret.value[key];
}

async function handleSave(): Promise<void> {
  if (!props.channel) return;
  saving.value = true;
  try {
    const r = await port.saveChannelConfig(props.channel.code, values.value);
    if (r.success) {
      ElMessage.success('配置已保存');
      emit('saved');
      drawerVisible.value = false;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="drawerVisible"
    :title="drawerTitle"
    direction="rtl"
    size="620px"
    :destroy-on-close="true"
  >
    <template #header="{ titleId }">
      <div class="drawer-header">
        <div class="drawer-header__badge" :style="{ background: accentColor }">
          {{ channel?.name?.charAt(0) ?? '?' }}
        </div>
        <div>
          <h3 :id="titleId" class="drawer-header__title">{{ drawerTitle }}</h3>
          <p class="drawer-header__sub">code: {{ channel?.code }}</p>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="config-body">
      <el-empty v-if="!loading && (!schema || schema.fields.length === 0)" description="该渠道无需配置" />

      <el-form v-else label-position="top" size="default">
        <el-form-item
          v-for="field in schema?.fields ?? []"
          :key="field.key"
          :required="field.required"
        >
          <template #label>
            {{ field.label }}
            <span v-if="field.help" class="field-help">{{ field.help }}</span>
          </template>
          <div class="key-input-wrap">
            <el-input
              v-model="values[field.key]"
              :type="fieldInputType(field)"
              :rows="field.type === 'TextArea' ? 4 : undefined"
              :placeholder="field.placeholder ?? undefined"
              clearable
            />
            <el-button
              v-if="field.isSecret"
              :icon="showSecret[field.key] ? Hide : View"
              text
              class="key-toggle"
              @click="toggleSecret(field.key)"
            />
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <div style="flex: 1" />
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!schema || schema.fields.length === 0"
          @click="handleSave()"
        >
          保存配置
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.drawer-header__badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}
.drawer-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.drawer-header__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.config-body {
  padding: 0 4px;
}
.field-help {
  display: block;
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}
.key-input-wrap {
  position: relative;
  width: 100%;
}
.key-toggle {
  position: absolute;
  right: 4px;
  top: 4px;
  padding: 4px;
  z-index: 1;
}
.drawer-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
