<script setup lang="ts">
/**
 * 速率限制 - 添加账户弹窗。
 *
 * 通过 UID / 邮箱查找账户，选中后创建账户级速率覆盖。
 * 覆盖针对整个账户：若为组织（IAM）账户，则作用于整个组织。
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import { getAccountAdminPort } from '@/features/accounts/services';
import { accountTypeLabel, type Account } from '@/features/accounts/model/account.types';

const props = defineProps<{
  modelValue: boolean;
  /** 已添加的账户 UID，用于禁用重复添加。 */
  existingUids: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [account: Account];
}>();

const port = getAccountAdminPort();

const searchUid = ref('');
const searchEmail = ref('');
const loading = ref(false);
const searched = ref(false);
const results = ref<Account[]>([]);

const visible = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v;
    if (v) reset();
  },
);
watch(visible, (v) => emit('update:modelValue', v));

function reset(): void {
  searchUid.value = '';
  searchEmail.value = '';
  results.value = [];
  searched.value = false;
}

async function runSearch(): Promise<void> {
  const uid = searchUid.value.trim();
  const email = searchEmail.value.trim();
  if (!uid && !email) {
    ElMessage.warning('请输入账户 UID 或邮箱后查找。');
    return;
  }
  loading.value = true;
  try {
    const r = await port.listAccounts({
      page: 1,
      pageSize: 20,
      filter: { accountUid: uid, contactKeyword: email, type: 'all', status: 'all' },
    });
    if (r.success) {
      results.value = r.data.items;
      searched.value = true;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function choose(account: Account): void {
  emit('select', account);
  visible.value = false;
}

function typeLabel(account: Account): string {
  return accountTypeLabel[account.type];
}
</script>

<template>
  <el-dialog v-model="visible" title="添加账户" width="640px" destroy-on-close append-to-body>
    <div class="picker__search">
      <el-input
        v-model="searchUid"
        placeholder="账户 UID（精确）"
        clearable
        class="picker__input"
        @keyup.enter="runSearch"
      />
      <el-input
        v-model="searchEmail"
        placeholder="邮箱关键字（模糊）"
        clearable
        class="picker__input"
        @keyup.enter="runSearch"
      />
      <el-button type="primary" :icon="Search" :loading="loading" @click="runSearch">查找</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="results"
      class="picker__table"
      max-height="380"
      :empty-text="searched ? '未找到匹配账户' : '输入 UID 或邮箱后查找账户'"
    >
      <el-table-column label="账户" min-width="200">
        <template #default="{ row }">
          <div class="picker__acc">
            <span class="picker__name">{{ row.displayName || '未命名账户' }}</span>
            <el-tag
              size="small"
              effect="plain"
              :type="row.type === 'organization' ? 'warning' : 'info'"
            >
              {{ typeLabel(row) }}
            </el-tag>
          </div>
          <div class="picker__uid">UID: {{ row.uid }}</div>
        </template>
      </el-table-column>

      <el-table-column label="邮箱" min-width="190">
        <template #default="{ row }: { row: Account }">{{ row.owner.email || '—' }}</template>
      </el-table-column>

      <el-table-column label="操作" width="96" align="center">
        <template #default="{ row }">
          <el-button v-if="existingUids.includes(row.uid)" size="small" disabled>已添加</el-button>
          <el-button v-else size="small" type="primary" @click="choose(row)">创建</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.picker__search {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.picker__input {
  flex: 1;
}
.picker__table {
  width: 100%;
}
.picker__acc {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker__name {
  font-weight: 500;
}
.picker__uid {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
