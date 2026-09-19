<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import { formatDateTime } from '@/shared/lib/date';
import { issuedGatewayRecords } from '@/features/platform/gateway/model/issuedGatewayCredentials';

async function copyClientId(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    ElMessage.success('ClientId 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">凭据列表</h3>
        <p class="settings-panel__desc">
          HMAC 凭据不落库，Secret 只在签发时显示一次。这里记下本控制台这次会话签发过的 ClientId。
        </p>
      </div>
    </header>

    <div class="settings-panel__body">
      <div v-if="issuedGatewayRecords.length > 0" class="cred-list">
        <div class="cred-list__head">
          <span>产品</span>
          <span>名称</span>
          <span>Client ID</span>
          <span>Backend ID</span>
          <span>签发时间</span>
          <span class="cred-list__ops-h">操作</span>
        </div>
        <article v-for="row in issuedGatewayRecords" :key="row.clientId" class="cred-list__row">
          <span>{{ row.productLabel }}</span>
          <span class="cred-list__name">{{ row.name || '—' }}</span>
          <code class="cred-list__id">{{ row.clientId }}</code>
          <code class="cred-list__id">{{ row.backendId || '—' }}</code>
          <span class="cred-list__time">{{ formatDateTime(row.issuedAt) }}</span>
          <div class="cred-list__ops">
            <el-button link type="primary" :icon="CopyDocument" @click="copyClientId(row.clientId)">
              复制 ClientId
            </el-button>
          </div>
        </article>
      </div>
      <EmptyState
        v-else
        title="这次会话还没有签发记录"
        description="到「签发凭据」选产品后签一张，ClientId 会出现在这里。Secret 不会写入列表。"
      >
        <el-button type="primary" @click="$router.push({ name: 'settings-gateway-issue' })">
          签发凭据
        </el-button>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.settings-panel__head {
  flex-shrink: 0;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.settings-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.settings-panel__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.settings-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 24px 24px;
}
.cred-list {
  display: grid;
  grid-template-columns: 72px minmax(100px, 0.7fr) minmax(160px, 1.4fr) minmax(100px, 0.7fr) 148px 120px;
  column-gap: 16px;
  align-content: start;
}
.cred-list__head,
.cred-list__row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}
.cred-list__head {
  padding: 0 8px 7px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.cred-list__row {
  padding: 12px 8px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.cred-list__name,
.cred-list__id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cred-list__id {
  font-size: 12.5px;
  background: transparent;
}
.cred-list__time {
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.cred-list__ops {
  display: flex;
  justify-content: flex-end;
}
.cred-list__ops-h {
  text-align: right;
}
</style>
