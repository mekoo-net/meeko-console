<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Coin,
  Medal,
  Money,
  Operation,
  Postcard,
  Setting,
  UserFilled,
} from '@element-plus/icons-vue';

const props = defineProps<{ uid: string }>();

const route = useRoute();
const router = useRouter();

interface SectionChild {
  key: string;
  title: string;
}

interface SectionItem {
  key: string;
  title: string;
  desc: string;
  icon: unknown;
  children?: readonly SectionChild[];
}

const sections: readonly SectionItem[] = [
  { key: 'overview', title: '概览', desc: '基础信息与钱包', icon: Postcard },
  { key: 'business', title: '业务', desc: '已开通的业务实例', icon: Operation },
  {
    key: 'billing',
    title: '账单',
    desc: '充值与扣款流水',
    icon: Money,
    children: [
      { key: 'recharges', title: '充值' },
      { key: 'bills', title: '流水' },
      { key: 'vouchers', title: '代金券' },
    ],
  },
  {
    key: 'referral',
    title: '返利',
    desc: '邀请 · 返利 · 提现',
    icon: Coin,
    children: [
      { key: 'invitees', title: '邀请' },
      { key: 'rebates', title: '返利' },
      { key: 'withdrawals', title: '提现' },
    ],
  },
  { key: 'achievements', title: '徽章', desc: '已授予的勋章', icon: Medal },
  { key: 'iam', title: 'IAM', desc: '子账号与权限', icon: UserFilled },
  { key: 'settings', title: '设置', desc: '返利率等账户配置', icon: Setting },
];

const active = computed(() => {
  const seg = route.path.split('/')[3] ?? 'overview';
  return sections.some((s) => s.key === seg) ? seg : 'overview';
});

const activeChild = computed(() => route.path.split('/')[4] ?? '');

function navigate(key: string): void {
  if (key === active.value) return;
  void router.push(`/accounts/${props.uid}/${key}`);
}

function navigateChild(parentKey: string, childKey: string): void {
  if (active.value === parentKey && activeChild.value === childKey) return;
  void router.push(`/accounts/${props.uid}/${parentKey}/${childKey}`);
}
</script>

<template>
  <nav class="acc-nav">
    <template v-for="s in sections" :key="s.key">
      <button
        type="button"
        class="acc-nav__item"
        :class="{ 'acc-nav__item--active': s.key === active && !s.children }"
        @click="navigate(s.key)"
      >
        <span class="acc-nav__icon">
          <el-icon :size="18"><component :is="s.icon" /></el-icon>
        </span>
        <span class="acc-nav__text">
          <span class="acc-nav__title">{{ s.title }}</span>
          <span class="acc-nav__desc">{{ s.desc }}</span>
        </span>
      </button>

      <div v-if="s.children && s.key === active" class="acc-nav__children">
        <button
          v-for="c in s.children"
          :key="c.key"
          type="button"
          class="acc-nav__child"
          :class="{ 'acc-nav__child--active': c.key === activeChild }"
          @click="navigateChild(s.key, c.key)"
        >
          <span class="acc-nav__child-dot" />
          {{ c.title }}
        </button>
      </div>
    </template>
  </nav>
</template>

<style scoped>
.acc-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.acc-nav__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 12px;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;
}
.acc-nav__item:hover {
  background: var(--el-fill-color-light);
}
.acc-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.acc-nav__text {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}
.acc-nav__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.acc-nav__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.acc-nav__item--active {
  background: var(--el-color-primary-light-9);
}
.acc-nav__item--active .acc-nav__icon {
  background: var(--el-color-primary);
  color: #fff;
}
.acc-nav__item--active .acc-nav__title {
  color: var(--el-color-primary);
}

.acc-nav__children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 30px;
  padding-left: 14px;
  border-left: 1px solid var(--el-border-color-lighter);
}
.acc-nav__child {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 7px 12px;
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  transition: background 0.15s ease, color 0.15s ease;
}
.acc-nav__child:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
.acc-nav__child-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.acc-nav__child--active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.acc-nav__child--active .acc-nav__child-dot {
  background: var(--el-color-primary);
}
</style>
