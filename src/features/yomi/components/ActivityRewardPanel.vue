<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen, List, Plus, Position } from '@element-plus/icons-vue';

import ActivityRewardDrawer from './ActivityRewardDrawer.vue';
import { getYomiActivityRewardPort } from '../services';
import { messageKeys, type LocaleMessages } from '../model/activityMessages';
import {
  claimWidgetSnippet,
  describeRules,
  rewardTypeLabels,
  voucherTemplateStatusLabels,
  type ActivityReward,
  type FieldRenames,
  type RewardFacts,
  type RewardType,
} from '../model/activityReward.types';

/**
 * 编辑器侧栏的奖励块。奖励是独立资源，改完即存，不跟着活动的「保存」走；
 * 所以新建活动要先存一次拿到 id 才能加奖励。奖励只有结构，名称等文字在活动语言包里；
 * 改 key、删条件、删奖励时后端会搬 / 清它名下的 key，通过 keys 事件告诉编辑器跟着改。
 */
const rewards = defineModel<ActivityReward[]>('rewards', { required: true });

const props = defineProps<{
  activityId: string | null;
  /** 模板里已经摆放了按钮的 key */
  placedKeys: ReadonlySet<string>;
  /** 编辑器里的默认语言语言包 */
  pack: LocaleMessages;
}>();

const emit = defineEmits<{
  insert: [snippet: string];
  /** 奖励存好或删了：from → to 换 key；saved 是存好的奖励，为 null 表示删了 */
  keys: [from: string | null, saved: ActivityReward | null, renames?: FieldRenames | null];
}>();

const port = getYomiActivityRewardPort();

const facts = ref<RewardFacts | null>(null);
const loading = ref(false);
const drawerOpen = ref(false);
const editing = ref<ActivityReward | null>(null);

// 名称取编辑器里的语言包，JSON 里刚改的这里也跟着变；没写就显示 key。
const names = computed(() => new Map(rewards.value.map((r) => [r.key, props.pack[messageKeys.rewardName(r.key)]?.trim() || r.key])));

async function load(): Promise<void> {
  if (!props.activityId) {
    rewards.value = [];
    return;
  }
  loading.value = true;
  const [list, catalog] = await Promise.all([
    port.list(props.activityId),
    facts.value ? Promise.resolve(null) : port.facts(),
  ]);
  loading.value = false;
  if (catalog?.success) facts.value = catalog.data;
  else if (catalog) ElMessage.error(catalog.error.message);
  if (list.success) rewards.value = list.data;
  else ElMessage.error(list.error.message);
}

watch(() => props.activityId, () => void load(), { immediate: true });

function openCreate(): void {
  editing.value = null;
  drawerOpen.value = true;
}

function openEdit(r: ActivityReward): void {
  editing.value = r;
  drawerOpen.value = true;
}

function onSaved(saved: ActivityReward, change?: { from: string | null; renames?: FieldRenames | null }): void {
  if (change) emit('keys', change.from, saved, change.renames);
  const i = rewards.value.findIndex((r) => r.id === saved.id);
  if (i >= 0) rewards.value.splice(i, 1, saved);
  else rewards.value.push(saved);
  rewards.value.sort((a, b) => b.sortOrder - a.sortOrder || Number(a.id) - Number(b.id));
}

async function remove(r: ActivityReward): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除奖励「${names.value.get(r.key)}」？模板里引用它的按钮会显示为失效，语言包里 reward.${r.key}.* 一并删除。`, '删除奖励', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  const res = await port.remove(props.activityId!, r.id);
  if (!res.success) {
    ElMessage.error(res.error.message);
    return;
  }
  rewards.value = rewards.value.filter((x) => x.id !== r.id);
  emit('keys', r.key, null);
  ElMessage.success('已删除');
}

function stockText(r: ActivityReward): string {
  const quota = r.totalQuota === null ? '不限量' : `总量 ${r.totalQuota}`;
  const pool = r.codePool ? ` · 卡密余 ${r.codePool.available}` : '';
  return `已领 ${r.claimedCount} / ${quota}${pool}${voucherText(r)}`;
}

function voucherText(r: ActivityReward): string {
  if (r.spec.type !== 'voucher') return '';
  const t = r.voucherTemplate;
  if (!t) return ` · 券模板 ${r.spec.templateId}`;
  return ` · ${t.name}${t.status === 'active' ? '' : `（${voucherTemplateStatusLabels[t.status]}，领取会失败）`}`;
}

const typeTag: Record<RewardType, 'primary' | 'success' | 'warning' | 'danger'> = {
  voucher: 'danger',
  physical: 'warning',
  code: 'success',
};
</script>

<template>
  <div
    v-loading="loading"
    class="rp"
  >
    <div class="rp__head">
      <span class="rp__title">奖励 <em>{{ rewards.length }}</em></span>
      <div class="rp__ops">
        <router-link
          v-if="activityId"
          v-slot="{ navigate }"
          :to="{ name: 'yomi-activity-claims', params: { id: activityId } }"
          custom
        >
          <el-button
            size="small"
            text
            :icon="List"
            @click="navigate"
          >
            领取记录
          </el-button>
        </router-link>
        <el-button
          size="small"
          :icon="Plus"
          :disabled="!activityId"
          @click="openCreate"
        >
          添加
        </el-button>
      </div>
    </div>

    <p
      v-if="!activityId"
      class="rp__empty"
    >
      保存活动后可添加奖励
    </p>
    <template v-else>
      <div
        v-if="rewards.length"
        class="rp__list"
      >
        <div
          v-for="r in rewards"
          :key="r.id"
          class="reward"
          :class="{ 'reward--off': !r.isEnabled }"
        >
          <div class="reward__top">
            <el-tag
              size="small"
              :type="typeTag[r.spec.type]"
              effect="light"
            >
              {{ rewardTypeLabels[r.spec.type] }}
            </el-tag>
            <span class="reward__name">{{ names.get(r.key) }}</span>
            <el-tag
              v-if="!r.isEnabled"
              size="small"
              type="info"
            >
              停用
            </el-tag>
          </div>
          <div class="reward__key">
            {{ r.key }}
            <span :class="placedKeys.has(r.key) ? 'reward__placed' : 'reward__unplaced'">
              {{ placedKeys.has(r.key) ? '已摆放' : '未摆放' }}
            </span>
          </div>
          <div class="reward__meta">
            {{ stockText(r) }}
          </div>
          <div class="reward__rules">
            {{ facts ? describeRules(r.rules, facts.facts, names) : '' }}
          </div>
          <div class="reward__ops">
            <el-tooltip content="插入">
              <el-button
                size="small"
                text
                :icon="Position"
                @click="emit('insert', claimWidgetSnippet(r.key))"
              />
            </el-tooltip>
            <el-tooltip content="编辑">
              <el-button
                size="small"
                text
                :icon="EditPen"
                @click="openEdit(r)"
              />
            </el-tooltip>
            <el-tooltip content="删除">
              <el-button
                size="small"
                text
                type="danger"
                :icon="Delete"
                @click="remove(r)"
              />
            </el-tooltip>
          </div>
        </div>
      </div>
      <p
        v-else
        class="rp__empty"
      >
        暂无奖励
      </p>
    </template>

    <ActivityRewardDrawer
      v-if="activityId"
      v-model:visible="drawerOpen"
      :activity-id="activityId"
      :reward="editing"
      :facts="facts"
      :all="rewards"
      :names="names"
      :pack="pack"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.rp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rp__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.rp__title em {
  margin-left: 4px;
  font-style: normal;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.rp__ops {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rp__list {
  display: flex;
  margin-top: 10px;
  flex-direction: column;
  gap: 8px;
}
.reward {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}
.reward--off {
  opacity: 0.6;
}
.reward__top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.reward__name {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.reward__key {
  margin-top: 4px;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.reward__placed,
.reward__unplaced {
  margin-left: 6px;
  font-family: var(--el-font-family);
}
.reward__placed {
  color: var(--el-color-success);
}
.reward__unplaced {
  color: var(--el-color-warning);
}
.reward__meta,
.reward__rules {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.reward__rules {
  color: var(--el-text-color-secondary);
}
.reward__ops {
  display: flex;
  justify-content: flex-end;
}
.reward__ops .el-button + .el-button {
  margin-left: 0;
}
.rp__empty {
  margin: 8px 0 0;
  padding: 14px 12px;
  border-radius: 8px;
  border: 1px dashed var(--el-border-color);
  font-size: 12px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
