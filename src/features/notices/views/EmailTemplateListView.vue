<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, reactive, ref, unref } from 'vue';
import { useRouter } from 'vue-router';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';

import type { CreateEmailTemplatePayload } from '../model/emailTemplate.types';
import { useEmailTemplateList } from '../composables/useEmailTemplateList';
import { useSmtpList } from '../composables/useSmtpList';
import { getNoticeAdminPort } from '../services';

const router = useRouter();
const list = useEmailTemplateList();
const smtpList = useSmtpList();

const rows = computed(() => list.data.value ?? []);
const loading = computed(() => unref(list.loading));
const error = computed(() => unref(list.error));
const smtpRows = computed(() => smtpList.data.value ?? []);

/** 根据 uid 找到渠道名称 */
function providerName(uid: string | null | undefined): string {
  if (!uid) return '默认渠道';
  const p = smtpRows.value.find((r) => r.uid === uid);
  return p ? p.name : '未知渠道';
}

function providerTag(uid: string | null | undefined): 'success' | 'warning' | 'info' {
  if (!uid) return 'info';
  const p = smtpRows.value.find((r) => r.uid === uid);
  if (!p) return 'info';
  return p.isDefault ? 'info' : 'success';
}

const dialog = ref(false);
const creating = ref(false);
const form = reactive<CreateEmailTemplatePayload>({
  code: '',
  locale: 'zh-CN',
  subject: '',
  body: '',
  isHtml: true,
  description: '',
  isActive: true,
  smtpProviderUid: undefined,
});

function openCreate(): void {
  form.code = '';
  form.locale = 'zh-CN';
  form.subject = '';
  form.body = '';
  form.isHtml = true;
  form.description = '';
  form.isActive = true;
  form.smtpProviderUid = undefined;
  dialog.value = true;
}

async function submitCreate(): Promise<void> {
  creating.value = true;
  try {
    const r = await getNoticeAdminPort().createEmailTemplate({
      ...form,
      description: form.description || undefined,
      smtpProviderUid: form.smtpProviderUid || undefined,
    });
    if (r.success) {
      ElMessage.success('模板已创建');
      dialog.value = false;
      void list.run();
      await router.push({
        name: 'notice-template-edit',
        params: { code: form.code, locale: form.locale },
      });
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    creating.value = false;
  }
}

function editLink(code: string, locale: string): string {
  return `/notices/templates/${encodeURIComponent(code)}/${encodeURIComponent(locale)}`;
}
</script>

<template>
  <div>
    <PageHeader title="邮件模板" description="管理邮件正文与修订记录，每个模板可绑定独立发信渠道">
      <template #actions>
        <el-button type="primary" @click="openCreate">新建模板</el-button>
        <el-button @click="list.run()">刷新</el-button>
      </template>
    </PageHeader>

    <DataTableShell
      :loading="loading"
      :error="error"
      :items="rows"
      empty-title="暂无模板"
    >
      <el-table :data="rows" stripe style="width: 100%">
        <el-table-column prop="code" label="模板代码" min-width="140" />
        <el-table-column prop="locale" label="语言" width="90" />
        <el-table-column prop="subject" label="主题" min-width="200" show-overflow-tooltip />
        <el-table-column label="发信渠道" min-width="160">
          <template #default="{ row }">
            <el-tooltip
              :content="row.smtpProviderUid ? '已绑定专属渠道' : '使用系统默认渠道'"
              placement="top"
            >
              <el-tag :type="providerTag(row.smtpProviderUid)" size="small" round>
                {{ providerName(row.smtpProviderUid) }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="currentVersion" label="版本" width="70" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small" round>
              {{ row.isActive ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="150">
          <template #default="{ row }">{{ formatDateTime(row.updatedAtUtc) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <router-link :to="editLink(row.code, row.locale)">
              <el-button link type="primary">编辑</el-button>
            </router-link>
          </template>
        </el-table-column>
      </el-table>
    </DataTableShell>

    <!-- 新建模板对话框 -->
    <el-dialog v-model="dialog" title="新建邮件模板" width="580px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item label="模板代码" required>
          <el-input v-model="form.code" placeholder="例如 welcome、otp_login" />
          <div class="form-tip">唯一标识，用于发送时引用此模板</div>
        </el-form-item>
        <el-form-item label="语言区域">
          <el-input v-model="form.locale" placeholder="zh-CN" style="width: 160px" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="form.subject" placeholder="支持 {{变量}} 占位符" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="form.body" type="textarea" :rows="6" placeholder="支持 HTML 与 {{变量}} 占位符" />
        </el-form-item>
        <el-form-item label="HTML 格式">
          <el-switch v-model="form.isHtml" />
        </el-form-item>
        <el-form-item label="发信渠道">
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
                  <el-tag v-if="!smtp.isActive" size="small" type="info" effect="plain">停用</el-tag>
                </div>
              </div>
            </el-option>
          </el-select>
          <div class="form-tip">不选则投递时使用标记为「默认」的渠道</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建并编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
