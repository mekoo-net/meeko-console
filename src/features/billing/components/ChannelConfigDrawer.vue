<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { View, Hide, QuestionFilled, Link } from '@element-plus/icons-vue';

import {
  defaultAlipayConfig,
  defaultWechatPayConfig,
  type AlipayConfig,
  type PaymentChannel,
  type WechatPayConfig,
} from '../model/paymentChannel.types';
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

/* ──── Alipay ──── */
const alipay = ref<AlipayConfig>(defaultAlipayConfig());
const showAlipayPrivateKey = ref(false);
const showAlipayPublicKey = ref(false);
const showAlipayEncryptKey = ref(false);

/* ──── WeChat Pay ──── */
const wechat = ref<WechatPayConfig>(defaultWechatPayConfig());
const showWechatApiV3Key = ref(false);
const showWechatPrivateKey = ref(false);

const drawerVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const drawerTitle = computed(() => {
  if (!props.channel) return '渠道配置';
  return props.channel.code === 'alipay' ? '支付宝配置' : '微信支付配置';
});

watch(
  () => props.visible,
  async (open) => {
    if (!open || !props.channel) return;
    loading.value = true;
    try {
      if (props.channel.code === 'alipay') {
        const r = await port.getAlipayConfig();
        alipay.value = r.success && r.data ? r.data : defaultAlipayConfig();
      } else {
        const r = await port.getWechatPayConfig();
        wechat.value = r.success && r.data ? r.data : defaultWechatPayConfig();
      }
    } finally {
      loading.value = false;
    }
  },
);

async function handleSave(): Promise<void> {
  if (!props.channel) return;
  saving.value = true;
  try {
    const r =
      props.channel.code === 'alipay'
        ? await port.saveAlipayConfig(alipay.value)
        : await port.saveWechatPayConfig(wechat.value);
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

function resetToDefault(): void {
  if (!props.channel) return;
  if (props.channel.code === 'alipay') {
    alipay.value = defaultAlipayConfig();
  } else {
    wechat.value = defaultWechatPayConfig();
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
        <div
          class="drawer-header__badge"
          :style="{ background: channel?.code === 'alipay' ? '#1677ff' : '#07c160' }"
        >
          {{ channel?.code === 'alipay' ? '支' : '微' }}
        </div>
        <div>
          <h3 :id="titleId" class="drawer-header__title">{{ drawerTitle }}</h3>
          <p class="drawer-header__sub">
            {{ channel?.code === 'alipay' ? '支付宝开放平台接入配置' : '微信支付商户平台接入配置' }}
          </p>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="config-body">

      <!-- ══════════════ 支付宝配置 ══════════════ -->
      <template v-if="channel?.code === 'alipay'">

        <!-- 基础信息 -->
        <div class="section">
          <div class="section__title">应用信息</div>
          <el-form label-position="top" size="default">
            <el-form-item required>
              <template #label>
                应用 ID（AppId）
                <el-tooltip content='在支付宝开放平台"我的应用"中获取，格式：20161129...' placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input v-model="alipay.appId" placeholder="例如：2016112600001234" clearable />
            </el-form-item>

            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="签名类型" required>
                  <el-select v-model="alipay.signType" style="width: 100%">
                    <el-option label="RSA2（推荐）" value="RSA2" />
                    <el-option label="RSA（旧版）" value="RSA" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="沙箱模式">
                  <el-switch
                    v-model="alipay.isSandbox"
                    active-text="沙箱"
                    inactive-text="正式"
                  />
                  <el-alert
                    v-if="alipay.isSandbox"
                    type="warning"
                    title="沙箱模式仅供测试，不会真实扣款"
                    :closable="false"
                    show-icon
                    style="margin-top: 6px; padding: 4px 8px"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </div>

        <!-- 密钥配置 -->
        <div class="section">
          <div class="section__title">
            密钥配置
            <el-link
              href="https://opendocs.alipay.com/common/02kh0b"
              target="_blank"
              type="primary"
              :icon="Link"
              style="font-size: 12px; margin-left: 8px"
            >
              如何获取密钥？
            </el-link>
          </div>
          <el-form label-position="top" size="default">
            <el-form-item required>
              <template #label>
                应用私钥（RSA2 PKCS8 格式）
                <el-tooltip content="使用支付宝密钥生成工具生成，选择 PKCS8 格式，粘贴不含 BEGIN/END 行的内容" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <div class="key-input-wrap">
                <el-input
                  v-model="alipay.privateKey"
                  :type="showAlipayPrivateKey ? 'textarea' : 'password'"
                  :rows="4"
                  placeholder="MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEA..."
                  class="key-textarea"
                />
                <el-button
                  :icon="showAlipayPrivateKey ? Hide : View"
                  text
                  class="key-toggle"
                  @click="showAlipayPrivateKey = !showAlipayPrivateKey"
                />
              </div>
            </el-form-item>

            <el-form-item required>
              <template #label>
                支付宝公钥
                <el-tooltip content='在支付宝开放平台"开发信息 → 接口加签方式"中，上传应用公钥后获得支付宝返回的公钥' placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <div class="key-input-wrap">
                <el-input
                  v-model="alipay.alipayPublicKey"
                  :type="showAlipayPublicKey ? 'textarea' : 'password'"
                  :rows="4"
                  placeholder="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
                  class="key-textarea"
                />
                <el-button
                  :icon="showAlipayPublicKey ? Hide : View"
                  text
                  class="key-toggle"
                  @click="showAlipayPublicKey = !showAlipayPublicKey"
                />
              </div>
            </el-form-item>

            <el-form-item>
              <template #label>
                内容加密密钥（可选）
                <el-tooltip content="AES-128-CBC 对称密钥，用于加密请求内容。若未开启接口内容加密，留空即可" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <div class="key-input-wrap">
                <el-input
                  v-model="alipay.encryptKey"
                  :type="showAlipayEncryptKey ? 'text' : 'password'"
                  placeholder="留空表示不启用接口内容加密"
                  clearable
                />
                <el-button
                  :icon="showAlipayEncryptKey ? Hide : View"
                  text
                  class="key-toggle"
                  @click="showAlipayEncryptKey = !showAlipayEncryptKey"
                />
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 回调地址 -->
        <div class="section">
          <div class="section__title">回调地址</div>
          <el-form label-position="top" size="default">
            <el-form-item>
              <template #label>
                异步通知地址（NotifyUrl）
                <el-tooltip content="支付结果服务端异步通知，需公网可访问，格式：https://your.domain/pay/alipay/notify" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input v-model="alipay.notifyUrl" placeholder="https://your.domain/pay/alipay/notify" clearable />
            </el-form-item>
            <el-form-item>
              <template #label>
                同步跳转地址（ReturnUrl）
                <el-tooltip content="支付完成后页面跳转地址（PC/H5 支付使用）" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input v-model="alipay.returnUrl" placeholder="https://your.domain/pay/result" clearable />
            </el-form-item>
          </el-form>
        </div>

        <!-- 高级设置 -->
        <div class="section section--collapse">
          <el-collapse>
            <el-collapse-item title="高级设置" name="advanced">
              <el-form label-position="top" size="default">
                <el-form-item label="网关地址（GatewayUrl）">
                  <el-input v-model="alipay.gatewayUrl" placeholder="https://openapi.alipay.com/gateway.do" />
                  <div class="field-hint">正式环境：https://openapi.alipay.com/gateway.do<br/>沙箱环境：https://openapi-sandbox.dl.alipaydev.com/gateway.do</div>
                </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
      </template>

      <!-- ══════════════ 微信支付配置 ══════════════ -->
      <template v-else-if="channel?.code === 'wechat_pay'">

        <!-- 基础信息 -->
        <div class="section">
          <div class="section__title">商户信息</div>
          <el-form label-position="top" size="default">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item required>
                  <template #label>
                    AppId
                    <el-tooltip content="公众号/小程序/App 的 AppId，格式 wx..." placement="top">
                      <el-icon class="help-icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </template>
                  <el-input v-model="wechat.appId" placeholder="wx8888888888888888" clearable />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item required>
                  <template #label>
                    商户号（MchId）
                    <el-tooltip content="微信支付商户平台商户号，10位数字" placement="top">
                      <el-icon class="help-icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </template>
                  <el-input v-model="wechat.mchId" placeholder="1234567890" clearable />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="沙箱模式">
              <el-switch v-model="wechat.isSandbox" active-text="沙箱" inactive-text="正式" />
              <el-alert
                v-if="wechat.isSandbox"
                type="warning"
                title="沙箱模式仅供测试，不会真实扣款"
                :closable="false"
                show-icon
                style="margin-top: 6px; padding: 4px 8px"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 密钥 & 证书 -->
        <div class="section">
          <div class="section__title">
            密钥 &amp; 证书
            <el-link
              href="https://pay.weixin.qq.com/docs/merchant/development/interface-rules/privatekey-and-certificate.html"
              target="_blank"
              type="primary"
              :icon="Link"
              style="font-size: 12px; margin-left: 8px"
            >
              官方文档
            </el-link>
          </div>
          <el-form label-position="top" size="default">
            <el-form-item required>
              <template #label>
                APIv3 密钥（32 字符）
                <el-tooltip content="商户平台 → 账户中心 → API 安全 → APIv3 密钥，32字节随机字符串" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <div class="key-input-wrap">
                <el-input
                  v-model="wechat.apiV3Key"
                  :type="showWechatApiV3Key ? 'text' : 'password'"
                  placeholder="32 字符随机字符串"
                  maxlength="32"
                  show-word-limit
                  clearable
                />
                <el-button
                  :icon="showWechatApiV3Key ? Hide : View"
                  text
                  class="key-toggle"
                  @click="showWechatApiV3Key = !showWechatApiV3Key"
                />
              </div>
              <div
                v-if="wechat.apiV3Key && wechat.apiV3Key.length !== 32"
                class="field-error"
              >
                当前长度 {{ wechat.apiV3Key.length }}，需 32 字符
              </div>
            </el-form-item>

            <el-form-item required>
              <template #label>
                商户 API 证书序列号（CertSerialNo）
                <el-tooltip content="从 apiclient_cert.pem 中读取，或在商户平台 API 证书详情页获取" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input
                v-model="wechat.certSerialNo"
                placeholder="例如：477ED0046A54F0360A72A63A8F2816312AAEAB53"
                clearable
                style="font-family: monospace"
              />
            </el-form-item>

            <el-form-item required>
              <template #label>
                商户私钥（apiclient_key.pem 完整内容）
                <el-tooltip content="商户 API 证书对应的私钥，包含 -----BEGIN RSA PRIVATE KEY----- 头尾行" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <div class="key-input-wrap">
                <el-input
                  v-model="wechat.privateKey"
                  :type="showWechatPrivateKey ? 'textarea' : 'password'"
                  :rows="5"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEpAIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
                  class="key-textarea"
                />
                <el-button
                  :icon="showWechatPrivateKey ? Hide : View"
                  text
                  class="key-toggle"
                  @click="showWechatPrivateKey = !showWechatPrivateKey"
                />
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 回调地址 -->
        <div class="section">
          <div class="section__title">回调地址</div>
          <el-form label-position="top" size="default">
            <el-form-item>
              <template #label>
                支付结果通知地址（NotifyUrl）
                <el-tooltip content="微信支付异步通知回调，需公网可访问 HTTPS 地址" placement="top">
                  <el-icon class="help-icon"><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <el-input
                v-model="wechat.notifyUrl"
                placeholder="https://your.domain/pay/wechat/notify"
                clearable
              />
            </el-form-item>
          </el-form>
        </div>

      </template>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button plain @click="resetToDefault()">重置</el-button>
        <div style="flex: 1" />
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave()">保存配置</el-button>
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
.section {
  margin-bottom: 24px;
}
.section--collapse {
  margin-top: -8px;
}
.section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
}

.key-input-wrap {
  position: relative;
  width: 100%;
}
.key-textarea :deep(.el-textarea__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
}
.key-toggle {
  position: absolute;
  right: 4px;
  top: 4px;
  padding: 4px;
  z-index: 1;
}

.help-icon {
  color: var(--el-text-color-placeholder);
  cursor: help;
  margin-left: 4px;
  font-size: 13px;
  vertical-align: middle;
}

.field-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
  line-height: 1.6;
}
.field-error {
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 4px;
}

.drawer-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
