<script setup lang="ts">
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';

import { formatDateTime, fromNow } from '@/shared/lib/date';

import { AccountDetailKey } from '../../composables/accountDetailContext';
import { accountTypeLabel, OAuthProviderLabel, oauthProviderValues } from '../../model/account.types';

const ctx = inject(AccountDetailKey);
const router = useRouter();

const account = computed(() => ctx?.account.value);

const rebateLabel = computed(() => {
  const r = account.value?.rebateRatePercent;
  return r == null ? '默认' : `${r}%`;
});

/** 四个登录方式都列出来：没绑定的也要看得到，客服核对身份时常问「绑没绑微信」。 */
const oauth = computed(() => {
  const bound = new Map((account.value?.oauthBindings ?? []).map((b) => [b.provider, b]));
  return oauthProviderValues.map((p) => ({ provider: p, label: OAuthProviderLabel[p], binding: bound.get(p) }));
});

function dateTime(v: number | null | undefined): string {
  return v ? formatDateTime(v, 'YYYY-MM-DD HH:mm:ss') : '—';
}

function openInviter(): void {
  const uid = account.value?.inviter?.uid;
  if (uid) window.open(router.resolve(`/accounts/${uid}/overview`).href, '_blank', 'noopener');
}

function openInvitees(): void {
  const uid = account.value?.uid;
  if (uid) void router.push(`/accounts/${uid}/referral/invitees`);
}
</script>

<template>
  <div
    v-if="account"
    class="overview acc-page-fill"
  >
    <el-descriptions
      title="基本信息"
      :column="3"
      border
    >
      <el-descriptions-item label="账户 UID">
        <span class="mono">{{ account.uid }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="账户类型">
        {{ accountTypeLabel[account.type] }}
      </el-descriptions-item>
      <el-descriptions-item label="账户名称">
        {{ account.displayName || '—' }}
      </el-descriptions-item>
      <el-descriptions-item label="负责人">
        {{ account.owner.displayName || '—' }}
      </el-descriptions-item>
      <el-descriptions-item label="邮箱">
        {{ account.owner.email || '—' }}
      </el-descriptions-item>
      <el-descriptions-item label="手机">
        {{ account.owner.phone || '—' }}
      </el-descriptions-item>
      <el-descriptions-item label="子账号">
        {{ account.iamUserCount ?? 0 }} 个
      </el-descriptions-item>
      <el-descriptions-item label="创建时间">
        {{ dateTime(account.createdAtUtc) }}
      </el-descriptions-item>
      <el-descriptions-item label="更新时间">
        {{ dateTime(account.updatedAtUtc) }}
      </el-descriptions-item>
    </el-descriptions>

    <el-descriptions
      title="邀请关系"
      :column="3"
      border
    >
      <el-descriptions-item label="邀请人">
        <template v-if="account.inviter">
          <el-link
            type="primary"
            underline="never"
            @click="openInviter"
          >
            {{ account.inviter.displayName || account.inviter.email || account.inviter.uid }}
          </el-link>
          <span class="muted">UID {{ account.inviter.uid }}</span>
        </template>
        <span
          v-else
          class="muted"
        >自然注册</span>
      </el-descriptions-item>
      <el-descriptions-item label="邀请人数">
        <el-link
          v-if="account.inviteCount"
          type="primary"
          underline="never"
          @click="openInvitees"
        >
          {{ account.inviteCount }} 人
        </el-link>
        <span v-else>0 人</span>
      </el-descriptions-item>
      <el-descriptions-item label="返利率">
        {{ rebateLabel }}
      </el-descriptions-item>
    </el-descriptions>

    <el-descriptions
      title="登录与安全"
      :column="3"
      border
    >
      <el-descriptions-item label="最近活跃">
        {{ dateTime(account.lastActiveAtUtc) }}
        <span
          v-if="account.lastActiveAtUtc"
          class="muted"
        >{{ fromNow(account.lastActiveAtUtc) }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="最近登录 IP">
        <span class="mono">{{ account.lastActiveIp || '—' }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="第三方登录">
        <div class="oauth">
          <el-tag
            v-for="o in oauth"
            :key="o.provider"
            :type="o.binding ? 'success' : 'info'"
            :effect="o.binding ? 'light' : 'plain'"
            size="small"
          >
            {{ o.label }}{{ o.binding ? ` · ${o.binding.nickname || '已绑定'}` : ' · 未绑定' }}
          </el-tag>
        </div>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.overview :deep(.el-descriptions__header) {
  margin-bottom: 12px;
}
.overview :deep(.el-descriptions__title) {
  font-size: 15px;
}
.overview :deep(.el-descriptions__label) {
  width: 120px;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.muted {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.oauth {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
