<script setup lang="ts">
import PageHeader from '@/shared/ui/PageHeader.vue';
import GatewayCredentialIssuePanel from '@/features/gateway/components/GatewayCredentialIssuePanel.vue';
import { getDemuxaiBackendPort } from '../services';

const port = getDemuxaiBackendPort();
</script>

<template>
  <div class="gateway-page">
    <PageHeader title="网关凭据" description="签发 DemuxAi.Gateway 接入 Meeko.DemuxAi 7072 RPC 的 ClientId / ClientSecret" />
    <GatewayCredentialIssuePanel
      product-label="DemuxAi"
      client-id-prefix="cl-"
      require-name
      config-hint="写入 DemuxAi.Gateway 配置 DemuxAi:ClientId / DemuxAi:ClientSecret；主密钥 Meeko:DemuxAi:LlmBackend:HmacKeyBase64 需在平台侧单独配置。"
      :issue="(input) => port.issue(input)"
    />
  </div>
</template>

<style scoped>
.gateway-page {
  padding: 0 4px 24px;
}
</style>
