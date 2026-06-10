<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, reactive, ref, unref } from 'vue';
import { useRouter } from 'vue-router';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import { formatDateTime } from '@/shared/lib/date';

import type { CreateEmailTemplatePayload } from '../model/emailTemplate.types';
import { useEmailTemplateList } from '../composables/useEmailTemplateList';
import { useSmtpList } from '../composables/useSmtpList';
import { getNoticeAdminPort } from '../services';

const router = useRouter();
const list = useEmailTemplateList();
const smtpList = useSmtpList();

const rows = computed(() => list.items.value);
const loading = computed(() => unref(list.loading));
const error = computed(() => unref(list.error));
const smtpRows = computed(() => smtpList.data.value ?? []);

/** 根据 smtpProviderId 找到渠道名称 */
function providerName(smtpProviderId: string | null | undefined): string {
  if (!smtpProviderId) return '默认渠道';
  const p = smtpRows.value.find((r) => r.id === smtpProviderId);
  return p ? p.name : '未知渠道';
}

function providerTag(smtpProviderId: string | null | undefined): 'success' | 'warning' | 'info' {
  if (!smtpProviderId) return 'info';
  const p = smtpRows.value.find((r) => r.id === smtpProviderId);
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
  smtpProviderId: undefined,
});

function openCreate(): void {
  form.code = '';
  form.locale = 'zh-CN';
  form.subject = '';
  form.body = '';
  form.isHtml = true;
  form.description = '';
  form.isActive = true;
  form.smtpProviderId = undefined;
  dialog.value = true;
}

async function submitCreate(): Promise<void> {
  creating.value = true;
  try {
    const r = await getNoticeAdminPort().createEmailTemplate({
      ...form,
      description: form.description || undefined,
      smtpProviderId: form.smtpProviderId || undefined,
    });
    if (r.success) {
      ElMessage.success('模板已创建');
      dialog.value = false;
      void list.refresh();
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
  return `/notices/email/templates/${encodeURIComponent(code)}/${encodeURIComponent(locale)}`;
}
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="邮件模板" description="管理邮件正文与修订记录，每个模板可绑定独立发信渠道">
        <template #actions>
          <el-button type="primary" @click="openCreate">新建模板</el-button>
          <el-button @click="list.refresh()">刷新</el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <el-alert
        v-if="error"
        :title="`加载失败：${error.code}`"
        :description="error.message"
        type="error"
        show-icon
        :closable="false"
      />
    </template>

    <el-table
      v-loading="loading"
      :data="rows"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column prop="code" label="模板代码" min-width="140" />
      <el-table-column prop="locale" label="语言" width="90" />
      <el-table-column prop="subject" label="主题" min-width="200" show-overflow-tooltip />
      <el-table-column label="发信渠道" min-width="160">
        <template #default="{ row }">
          <el-tooltip
            :content="row.smtpProviderId ? '已绑定专属渠道' : '使用系统默认渠道'"
            placement="top"
          >
            <el-tag :type="providerTag(row.smtpProviderId)" size="small" round>
              {{ providerName(row.smtpProviderId) }}
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

      <template #empty>
        <EmptyState title="暂无模板" description="点击「新建模板」创建第一封邮件模板。" />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="list.pagination.state.page"
        v-model:page-size="list.pagination.state.pageSize"
        :total="list.pagination.state.total"
        :page-sizes="list.pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

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
            v-model="form.smtpProviderId"
            placeholder="使用默认渠道"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="smtp in smtpRows"
              :key="smtp.id"
              :value="smtp.id"
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
</template>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
