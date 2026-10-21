<script setup lang="ts">
/**
 * 平台设置：给外部业务网关签发 RPC 凭据。Yomi / Tavern 共用这一页。
 */
import { computed, ref } from 'vue';

import { getYomiBackendPort } from '@/features/yomi/services';
import GatewayCredentialIssuePanel from '@/features/platform/gateway/components/GatewayCredentialIssuePanel.vue';
import type { IssueBackendInput } from '@/features/platform/gateway/model/backend.types';
import { rememberIssuedGateway } from '@/features/platform/gateway/model/issuedGatewayCredentials';
import { GATEWAY_PRODUCTS, gatewayProductById, type GatewayProductId } from '@/features/platform/gateway/model/products';
import { getTavernBackendPort } from '@/features/tavern/services';

const productId = ref<GatewayProductId>('yomi');
const product = computed(() => gatewayProductById(productId.value));

async function issue(input: IssueBackendInput) {
  const p = product.value;
  const r =
    p.id === 'yomi'
      ? await getYomiBackendPort().issue(input)
      : await getTavernBackendPort().issue({ name: input.name });
  if (r.success) {
    rememberIssuedGateway({
      productId: p.id,
      productLabel: p.label,
      backendId: r.data.backendId ?? '',
      clientId: r.data.clientId,
      name: input.name.trim(),
      issuedAt: new Date().toISOString(),
    });
  }
  return r;
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel__head">
      <div>
        <h3 class="settings-panel__title">签发凭据</h3>
        <p class="settings-panel__desc">
          外部业务网关接入平台 RPC 用的 ClientId / ClientSecret。选产品后签发，Secret 只显示一次。
        </p>
      </div>
    </header>

    <div class="settings-panel__body">
      <div class="gw-products">
        <span class="gw-products__label">接入产品</span>
        <div class="gw-products__row">
          <button
            v-for="p in GATEWAY_PRODUCTS"
            :key="p.id"
            type="button"
            class="gw-product"
            :class="{ 'gw-product--on': productId === p.id }"
            @click="productId = p.id"
          >
            <span class="gw-product__name">{{ p.label }}</span>
            <span class="gw-product__hint">{{ p.hint }}</span>
          </button>
        </div>
      </div>

      <GatewayCredentialIssuePanel
        :key="product.id"
        :product-label="product.label"
        :config-hint="product.configHint"
        :require-name="product.requireName"
        :issue="issue"
      />
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
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gw-products__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.gw-products__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  max-width: 640px;
}
.gw-product {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  text-align: left;
  cursor: pointer;
}
.gw-product--on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.gw-product__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.gw-product--on .gw-product__name {
  color: var(--el-color-primary);
}
.gw-product__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.35;
}
</style>
