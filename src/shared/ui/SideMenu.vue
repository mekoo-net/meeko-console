<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Bell,
  ChatLineRound,
  CreditCard,
  DataAnalysis,
  DataLine,
  Document,
  Link,
  MagicStick,
  Message,
  Money,
  Operation,
  PriceTag,
  Setting,
  Tickets,
  User,
} from '@element-plus/icons-vue';

import type { AppRole } from '@/stores/auth';
import { useAuthStore } from '@/stores/auth';

defineProps<{ collapsed: boolean }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

interface LeafItem {
  type: 'leaf';
  index: string;
  title: string;
  icon?: unknown;
  disabled?: boolean;
  badge?: string;
  roles?: ReadonlyArray<AppRole>;
}

interface GroupItem {
  type: 'group';
  index: string;
  title: string;
  icon?: unknown;
  roles?: ReadonlyArray<AppRole>;
  children: Array<LeafItem | GroupItem>;
}

type MenuNode = LeafItem | GroupItem;

const tree: readonly MenuNode[] = [
  { type: 'leaf', index: '/accounts', title: '账户管理', icon: User },
  {
    type: 'group',
    index: '/billing',
    title: '账单管理',
    icon: CreditCard,
    children: [
      { type: 'leaf', index: '/billing/recharges', title: '充值记录', icon: Document },
      { type: 'leaf', index: '/billing/bills', title: '账单流水', icon: Money },
      { type: 'leaf', index: '/billing/channels', title: '充值渠道', icon: Link, roles: ['Admin'] },
    ],
  },
  {
    type: 'group',
    index: '/demuxai',
    title: 'DemuxAI 管理',
    icon: MagicStick,
    roles: ['Admin'],
    children: [
      { type: 'leaf', index: '/demuxai/overview', title: '概览', icon: DataAnalysis },
      { type: 'leaf', index: '/demuxai/redemption', title: '激活码', icon: Tickets },
      { type: 'leaf', index: '/demuxai/providers', title: '供应商组', icon: Link },
      { type: 'leaf', index: '/demuxai/pricing', title: '模型定价', icon: PriceTag },
      { type: 'leaf', index: '/demuxai/logs', title: '调用日志', icon: DataLine },
    ],
  },
  {
    type: 'leaf',
    index: '/settings',
    title: '系统设置',
    icon: Setting,
    roles: ['Admin'],
  },
  {
    type: 'group',
    index: '/notices',
    title: '通知中心',
    icon: Bell,
    roles: ['Admin'],
    children: [
      {
        type: 'group',
        index: '/notices/email',
        title: '邮件通知',
        icon: Message,
        children: [
          { type: 'leaf', index: '/notices/email/channels', title: '渠道', icon: Link },
          { type: 'leaf', index: '/notices/email/templates', title: '模板', icon: Tickets },
        ],
      },
      {
        type: 'group',
        index: '/notices/sms',
        title: '短信通知',
        icon: ChatLineRound,
        children: [
          {
            type: 'leaf',
            index: '/notices/sms/channels',
            title: '渠道',
            icon: Link,
            disabled: true,
            badge: '即将支持',
          },
          {
            type: 'leaf',
            index: '/notices/sms/templates',
            title: '模板',
            icon: Tickets,
            disabled: true,
            badge: '即将支持',
          },
        ],
      },
      { type: 'leaf', index: '/notices/debug', title: '通知调试', icon: Operation },
    ],
  },
];

function isVisible(node: MenuNode): boolean {
  if (!node.roles || node.roles.length === 0) return true;
  return auth.role !== null && node.roles.includes(auth.role);
}

function filterTree(nodes: readonly MenuNode[]): MenuNode[] {
  return nodes
    .filter(isVisible)
    .map((n) =>
      n.type === 'group'
        ? ({ ...n, children: filterTree(n.children) } satisfies GroupItem)
        : n,
    );
}

const visible = computed<MenuNode[]>(() => filterTree(tree));

/** 收集所有可点击的叶子节点 index（用于路由 → active 匹配） */
function collectLeaves(nodes: readonly MenuNode[]): LeafItem[] {
  const out: LeafItem[] = [];
  for (const n of nodes) {
    if (n.type === 'leaf') out.push(n);
    else out.push(...collectLeaves(n.children));
  }
  return out;
}

const allLeaves = computed(() => collectLeaves(visible.value));

const active = computed(() => {
  const path = route.path;
  // 优先匹配最长的 leaf index，确保 `/notices/email/templates/welcome/zh` 命中模板叶子
  const sorted = [...allLeaves.value].sort((a, b) => b.index.length - a.index.length);
  const matched = sorted.find((l) => path === l.index || path.startsWith(l.index + '/'));
  return matched?.index ?? '/accounts';
});

/** 根据当前激活叶子，反推出需要展开的所有父级 sub-menu index */
function collectAncestors(nodes: readonly MenuNode[], targetIndex: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.type === 'leaf') {
      if (n.index === targetIndex) return trail;
    } else {
      const found = collectAncestors(n.children, targetIndex, [...trail, n.index]);
      if (found) return found;
    }
  }
  return null;
}

const opens = computed<string[]>(() => collectAncestors(visible.value, active.value) ?? []);

/**
 * `el-menu` 的 `open(index)` 方法在官方运行时是暴露的，但 d.ts 中未列出，
 * 这里手写一个最小接口避免 `any`。
 */
interface MenuInstance {
  open: (index: string) => void;
  close: (index: string) => void;
}

const menuRef = ref<MenuInstance | null>(null);

watch(
  opens,
  async (next) => {
    await nextTick();
    for (const idx of next) menuRef.value?.open(idx);
  },
  { immediate: true },
);

function navigate(index: string): void {
  if (route.path === index || route.path.startsWith(index + '/')) return;
  void router.push(index);
}
</script>

<template>
  <el-menu
    ref="menuRef"
    :collapse="collapsed"
    :default-active="active"
    :default-openeds="opens"
    :unique-opened="false"
    background-color="#0f172a"
    text-color="#e2e8f0"
    active-text-color="#60a5fa"
    class="side-menu"
    @select="navigate"
  >
    <template v-for="node in visible" :key="node.index">
      <!-- 叶子节点 -->
      <el-menu-item
        v-if="node.type === 'leaf'"
        :index="node.index"
        :disabled="node.disabled"
      >
        <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
        <template #title>
          <span>{{ node.title }}</span>
          <el-tag
            v-if="node.badge"
            size="small"
            type="info"
            effect="plain"
            class="side-menu__badge"
          >
            {{ node.badge }}
          </el-tag>
        </template>
      </el-menu-item>

      <!-- 二级 sub-menu -->
      <el-sub-menu v-else :index="node.index">
        <template #title>
          <el-icon v-if="node.icon"><component :is="node.icon" /></el-icon>
          <span>{{ node.title }}</span>
        </template>

        <template v-for="child in node.children" :key="child.index">
          <el-menu-item
            v-if="child.type === 'leaf'"
            :index="child.index"
            :disabled="child.disabled"
          >
            <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
            <template #title>
              <span>{{ child.title }}</span>
              <el-tag
                v-if="child.badge"
                size="small"
                type="info"
                effect="plain"
                class="side-menu__badge"
              >
                {{ child.badge }}
              </el-tag>
            </template>
          </el-menu-item>

          <!-- 三级 sub-menu -->
          <el-sub-menu v-else :index="child.index">
            <template #title>
              <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
              <span>{{ child.title }}</span>
            </template>
            <el-menu-item
              v-for="leaf in child.children"
              :key="leaf.index"
              :index="leaf.index"
              :disabled="leaf.type === 'leaf' ? leaf.disabled : false"
            >
              <el-icon v-if="leaf.type === 'leaf' && leaf.icon">
                <component :is="leaf.icon" />
              </el-icon>
              <template #title>
                <span>{{ leaf.title }}</span>
                <el-tag
                  v-if="leaf.type === 'leaf' && leaf.badge"
                  size="small"
                  type="info"
                  effect="plain"
                  class="side-menu__badge"
                >
                  {{ leaf.badge }}
                </el-tag>
              </template>
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-sub-menu>
    </template>
  </el-menu>
</template>

<style scoped>
.side-menu {
  border-right: none;
  background: transparent !important;
}
.side-menu :deep(.el-menu-item),
.side-menu :deep(.el-sub-menu__title) {
  margin: 2px 8px;
  border-radius: 8px;
  height: 42px;
  line-height: 42px;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: rgba(96, 165, 250, 0.12) !important;
}
.side-menu :deep(.el-menu-item:hover),
.side-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.side-menu :deep(.el-sub-menu .el-menu) {
  background: transparent !important;
}
.side-menu :deep(.el-sub-menu .el-menu-item),
.side-menu :deep(.el-sub-menu .el-sub-menu__title) {
  min-width: auto;
}
.side-menu :deep(.el-menu-item.is-disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
.side-menu__badge {
  margin-left: 8px;
  font-size: 10px;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  vertical-align: middle;
}
</style>
