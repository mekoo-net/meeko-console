<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import {
  ACTIVITY_FRAME_SANDBOX,
  IMAGE_SPECS,
  buildActivityDocument,
  imageSrc,
  resolveAssetRefs,
  type ActivityAsset,
} from '../model/activity.types';
import { themeCssVars, type ActivityTheme } from '../model/activityTheme';
import {
  placedRewardKeys,
  renderClaimPlaceholders,
  rewardTypeLabels,
  type ActivityReward,
} from '../model/activityReward.types';

/**
 * 按官网详情页的版式预览：Hero 图 → 活动名与按钮 → 未摆放的奖励 → 正文。正文与官网一样放在禁用脚本的沙箱 iframe 里，
 * `asset:名字` 在这里按素材库替换（官网由后端替换），`<yomi-claim>` 换成静态的按钮样子。
 */
const props = defineProps<{
  html: string;
  assets: readonly ActivityAsset[];
  heroUrl: string | null;
  title: string;
  theme: ActivityTheme;
  device: 'desktop' | 'mobile';
  rewards: readonly ActivityReward[];
  /** key → 当前预览语言的奖励名（缺译文已回退到默认语言） */
  rewardNames: ReadonlyMap<string, string>;
  locale: string;
}>();

const frame = ref<HTMLIFrameElement>();
const height = ref(240);

const enabledRewards = computed(() => props.rewards.filter((r) => r.isEnabled));
const nameOf = (r: ActivityReward) => props.rewardNames.get(r.key) ?? r.key;
// 按钮文字只是样子，官网按访客语言出；这里区分中文和其他就够了。
const claimLabel = computed(() => (props.locale === 'zh' ? '领取' : 'Claim'));
const srcdoc = computed(() => buildActivityDocument(renderClaimPlaceholders(
  resolveAssetRefs(props.html, props.assets),
  new Map(enabledRewards.value.map((r) => [r.key, nameOf(r)])),
  claimLabel.value,
), props.theme));
const hero = computed(() => imageSrc(props.heroUrl));
// 与官网一致：正文里没摆放按钮的奖励，统一列在信息栏下方。
const unplaced = computed(() => {
  const placed = placedRewardKeys(props.html);
  return enabledRewards.value.filter((r) => !placed.has(r.key));
});

// iframe 里不跑脚本，没法自己上报高度；同源沙箱下由外层去量，图片晚到时靠几次补量。
// 上限防住正文用了 vh 单位导致「框越高内容越高」。
const MAX_HEIGHT = 30_000;
let timers: number[] = [];
let observer: ResizeObserver | null = null;

function measure(): void {
  const doc = frame.value?.contentDocument;
  if (!doc?.documentElement) return;
  const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
  if (h > 0 && Math.abs(h - height.value) > 1) height.value = Math.min(h, MAX_HEIGHT);
}

function clearWatchers(): void {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  observer?.disconnect();
  observer = null;
}

function onLoad(): void {
  clearWatchers();
  measure();
  timers = [150, 600, 1500, 4000].map((ms) => window.setTimeout(measure, ms));
  const body = frame.value?.contentDocument?.body;
  if (body && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure);
    observer.observe(body);
  }
}

onBeforeUnmount(clearWatchers);
</script>

<template>
  <div
    class="pv"
    :class="`pv--${device}`"
    :style="themeCssVars(theme)"
  >
    <div class="pv__page">
      <div
        class="pv__hero"
        :style="{ aspectRatio: String(IMAGE_SPECS.hero.ratio), background: hero ? undefined : theme.banner }"
      >
        <img
          v-if="hero"
          :src="hero"
          alt=""
        >
        <span
          v-else
          class="pv__hero-empty"
        >Hero 图</span>
      </div>

      <div class="pv__info">
        <div>
          <span class="pv__badge">● 进行中</span>
          <h1 class="pv__title">
            {{ title || '活动名' }}
          </h1>
          <span class="pv__meta">活动时间 · 倒计时</span>
        </div>
        <span class="pv__cta">立即参与</span>
      </div>

      <div
        v-if="unplaced.length"
        class="pv__rewards"
      >
        <div
          v-for="r in unplaced"
          :key="r.id"
          class="pv__reward"
        >
          <span class="pv__reward-type">{{ locale === 'zh' ? rewardTypeLabels[r.spec.type] : r.spec.type }}</span>
          <span class="pv__reward-name">{{ nameOf(r) }}</span>
          <span class="pv__reward-btn">{{ claimLabel }}</span>
        </div>
      </div>

      <div class="pv__body">
        <iframe
          v-if="html.trim()"
          ref="frame"
          :srcdoc="srcdoc"
          :sandbox="ACTIVITY_FRAME_SANDBOX"
          :style="{ height: `${height}px` }"
          title="活动正文预览"
          @load="onLoad"
        />
        <p
          v-else
          class="pv__empty"
        >
          暂无正文
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv {
  min-height: 100%;
  padding: 20px;
  background:
    radial-gradient(ellipse 600px 400px at 10% 0%, rgba(248, 184, 205, 0.45), transparent 60%),
    radial-gradient(ellipse 600px 400px at 100% 30%, rgba(155, 184, 232, 0.35), transparent 60%),
    linear-gradient(180deg, #fffbf7, #f8f0ff);
  color: #2d2148;
}
.pv__page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0 auto;
  max-width: 1100px;
}
.pv--mobile .pv__page {
  max-width: 390px;
}
.pv__hero {
  display: grid;
  place-items: center;
  width: 100%;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 16px 36px -20px rgba(45, 33, 72, 0.45);
}
.pv__hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv__hero-empty {
  font-size: 13px;
  color: rgba(45, 33, 72, 0.45);
}
.pv__info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 30px -22px rgba(155, 123, 216, 0.6);
}
.pv__badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #0b8a65;
}
.pv__title {
  margin: 6px 0 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--activity-ink, #2d2148);
}
.pv--mobile .pv__title {
  font-size: 18px;
}
.pv__meta {
  font-size: 12px;
  color: #7a6a98;
}
.pv__cta {
  padding: 9px 20px;
  border-radius: 999px;
  background: var(--activity-button, linear-gradient(135deg, #9b7bd8, #f4a8c0));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.pv__rewards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.pv__reward {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 30px -22px rgba(155, 123, 216, 0.6);
}
.pv__reward-type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--activity-accent, #5d3fa8) 10%, #fff);
  font-size: 11px;
  font-weight: 600;
  color: var(--activity-accent, #5d3fa8);
}
.pv__reward-name {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pv__reward-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--activity-button, linear-gradient(135deg, #9b7bd8, #f4a8c0));
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.pv__body {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 30px -22px rgba(155, 123, 216, 0.6);
}
.pv--mobile .pv__body {
  padding: 12px;
}
.pv__body iframe {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
.pv__empty {
  margin: 0;
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  color: #8a7aa8;
}
</style>
