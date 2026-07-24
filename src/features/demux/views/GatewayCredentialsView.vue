<script setup lang="ts">
import PageHeader from '@/shared/ui/PageHeader.vue';
import GatewayCredentialIssuePanel from '@/features/platform/gateway/components/GatewayCredentialIssuePanel.vue';
import { getDemuxBackendPort } from '../services';

const port = getDemuxBackendPort();
</script>

<template>
  <div class="gateway-page">
    <PageHeader title="网关凭据" description="签发 Demux.Gateway 接入 Meeko.Demux 7072 RPC 的 ClientId / ClientSecret" />
    <GatewayCredentialIssuePanel
      product-label="DemuxAi"
      require-name
      config-hint="写入 Demux.Gateway 配置 DemuxAi:ClientId / DemuxAi:ClientSecret；主密钥 Meeko:Demux:LlmBackend:HmacKeyBase64 需在平台侧单独配置。"
      :issue="(input) => port.issue(input)"
    />
  </div>
</template>

<style scoped>
.gateway-page {
  padding: 0 4px 24px;
}
</style>
