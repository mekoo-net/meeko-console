<script setup lang="ts">
import PageHeader from '@/shared/ui/PageHeader.vue';
import GatewayCredentialIssuePanel from '@/features/gateway/components/GatewayCredentialIssuePanel.vue';
import { getTavernBackendPort } from '../services';

const port = getTavernBackendPort();
</script>

<template>
  <div class="gateway-page">
    <PageHeader
      title="网关凭据"
      description="签发 Tavern.Gateway 接入 Meeko.Tavern 7081 RPC 的 ClientId / ClientSecret"
    />
    <GatewayCredentialIssuePanel
      product-label="Tavern"
      client-id-prefix="ta-"
      config-hint="写入 Tavern.Gateway 配置 Meeko:Tavern:Platform:ClientId / ClientSecret；主密钥 Meeko:Tavern:LlmBackend:HmacKeyBase64 需在平台侧单独配置。"
      :issue="(input) => port.issue(input)"
    />
  </div>
</template>

<style scoped>
.gateway-page {
  padding: 0 4px 24px;
}
</style>
