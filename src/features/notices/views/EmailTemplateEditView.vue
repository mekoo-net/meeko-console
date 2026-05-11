<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { QuestionFilled } from '@element-plus/icons-vue';
import { computed, reactive, ref, toRef, unref, watch } from 'vue';
import { useRouter } from 'vue-router';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';

import TemplateRevisionTimeline from '../components/TemplateRevisionTimeline.vue';
import { useEmailTemplateEditor } from '../composables/useEmailTemplateEditor';
import { useSmtpList } from '../composables/useSmtpList';
import type { UpdateEmailTemplatePayload } from '../model/emailTemplate.types';
import { getNoticeAdminPort } from '../services';

const props = defineProps<{ code: string; locale: string }>();

const router = useRouter();
const codeRef = toRef(props, 'code');
const localeRef = toRef(props, 'locale');

const editor = useEmailTemplateEditor(codeRef, localeRef);
const smtpList = useSmtpList();

const bundle = computed(() => editor.data.value);
const template = computed(() => bundle.value?.template ?? null);
const revisions = computed(() => bundle.value?.revisions ?? []);

const loading = computed(() => unref(editor.loading));
const error = computed(() => unref(editor.error));
const smtpRows = computed(() => smtpList.data.value ?? []);

const form = reactive<UpdateEmailTemplatePayload>({
  subject: '',
  body: '',
  isHtml: false,
  description: '',
  isActive: true,
  changeNote: '',
  smtpProviderUid: undefined,
});

watch(
  template,
  (t) => {
    if (!t) return;
    form.subject = t.subject;
    form.body = t.body;
    form.isHtml = t.isHtml;
    form.description = t.description ?? '';
    form.isActive = t.isActive;
    form.changeNote = '';
    form.smtpProviderUid = t.smtpProviderUid ?? undefined;
  },
  { immediate: true },
);

const saving = ref(false);

async function save(): Promise<void> {
  const t = template.value;
  if (!t) return;
  saving.value = true;
  try {
    const r = await getNoticeAdminPort().updateEmailTemplate(t.uid, {
      ...form,
      description: form.description || undefined,
      changeNote: form.changeNote || undefined,
      smtpProviderUid: form.smtpProviderUid || undefined,
    });
    if (r.success) {
      ElMessage.success('已保存');
      void editor.run();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}

function goBack(): void {
  void router.push({ name: 'notice-templates' });
}

/** 当前绑定的渠道名称 */
const currentChannelName = computed(() => {
  if (!form.smtpProviderUid) return '默认渠道';
  const p = smtpRows.value.find((r) => r.uid === form.smtpProviderUid);
  return p?.name ?? '未知渠道';
});
</script>

<template>
  <div>
    <PageHeader :title="`编辑模板：${props.code} / ${props.locale}`" description="保存后自动写入新版本修订记录">
      <template #actions>
        <el-button @click="goBack">← 返回列表</el-button>
        <el-button type="primary" :loading="saving" :disabled="!template" @click="save">保存</el-button>
      </template>
    </PageHeader>

    <DataTableShell
      :loading="loading"
      :error="error"
      :items="template ? [template] : []"
      empty-title="未找到模板"
    >
      <div class="edit-layout">
        <!-- 左侧：表单 -->
        <div class="edit-layout__form">
          <el-form label-position="top" class="tpl-form">
            <el-form-item label="邮件主题">
              <el-input v-model="form.subject" placeholder="支持 {{变量}} 占位符" />
            </el-form-item>

            <el-form-item label="正文内容">
              <el-input
                v-model="form.body"
                type="textarea"
                :rows="14"
                placeholder="支持 HTML 与 {{变量}} 占位符，如 {{displayName}}、{{code}} 等"
              />
              <div class="form-tip">
                支持 Mustache 模板语法，变量用 <code>{'{{variableName}}'}</code> 包裹
              </div>
            </el-form-item>

            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="HTML 格式">
                  <el-switch v-model="form.isHtml" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="启用状态">
                  <el-switch v-model="form.isActive" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item>
              <template #label>
                发信渠道
                <el-tooltip content="此模板使用哪个 SMTP 渠道发信，不选则使用标记为「默认」的渠道" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-select
                v-model="form.smtpProviderUid"
                placeholder="使用默认渠道"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="smtp in smtpRows"
                  :key="smtp.uid"
                  :value="smtp.uid"
                  :label="smtp.name"
                  :disabled="!smtp.isActive"
                >
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <span>{{ smtp.name }}</span>
                    <div style="display:flex;gap:4px">
                      <el-tag v-if="smtp.isDefault" size="small" type="warning" effect="plain">默认</el-tag>
                      <el-tag size="small" :type="smtp.isActive ? 'success' : 'info'" effect="plain">
                        {{ smtp.isActive ? '启用' : '停用' }}
                      </el-tag>
                    </div>
                  </div>
                </el-option>
              </el-select>
              <div class="form-tip">当前：{{ currentChannelName }}</div>
            </el-form-item>

            <el-form-item label="描述备注">
              <el-input v-model="form.description" placeholder="可选，内部说明" />
            </el-form-item>

            <el-form-item label="变更说明">
              <el-input v-model="form.changeNote" placeholder="本次修改的备注，写入版本历史" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" :disabled="!template" @click="save">
                保存
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 右侧：版本历史 -->
        <div class="edit-layout__sidebar">
          <div class="sidebar-section">
            <div class="sidebar-section__title">版本历史</div>
            <TemplateRevisionTimeline :revisions="revisions" />
          </div>
        </div>
      </div>
    </DataTableShell>
  </div>
</template>

<style scoped>
.edit-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 32px;
  align-items: start;
}

@media (max-width: 900px) {
  .edit-layout {
    grid-template-columns: 1fr;
  }
}

.edit-layout__form {
  min-width: 0;
}

.tpl-form {
  max-width: 100%;
}

.edit-layout__sidebar {
  position: sticky;
  top: 16px;
}

.sidebar-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.help-icon {
  margin-left: 4px;
  cursor: help;
  color: var(--el-text-color-secondary);
  vertical-align: middle;
}

code {
  background: var(--el-fill-color-light);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
}
</style>
