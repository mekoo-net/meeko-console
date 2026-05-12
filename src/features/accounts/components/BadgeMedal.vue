<script setup lang="ts">
/**
 * 勋章视觉组件，固定 128×128（可通过 size 调整）。
 *
 * 渲染策略：
 *  - 优先使用 `image`（或 catalog 里挂的插画 URL）。SVG / PNG / JPG 都支持。
 *    设计师可以为每枚勋章产出真正的 128×128 艺术插画。
 *  - 没有插画时，走程序化 SVG 奖牌底座：缎带 + 星芒 + 金属环 + tier/hue 染色，
 *    保证任何 code 都有"看得过去"的视觉，不至于光秃秃。
 */
import { computed } from 'vue';

import { findAchievementDef, type AchievementTier } from '../model/achievementCatalog';

const props = withDefaults(
  defineProps<{
    code: string;
    /** Achievement.image 字段（granted 时快照写入）。优先级最高。 */
    image?: string | null;
    /** Achievement.icon（emoji），无插画时作为奖牌焦点符号。 */
    icon?: string;
    size?: number;
  }>(),
  { size: 96, icon: '', image: null },
);

const def = computed(() => findAchievementDef(props.code));

/** 有效插画 URL：prop 优先，其次 catalog。 */
const effectiveImage = computed<string>(() => {
  if (props.image) return props.image;
  return def.value?.image ?? '';
});

const tier = computed<AchievementTier>(() => def.value?.tier ?? 'bronze');
const hue = computed<number>(() => def.value?.hue ?? 220);
const emoji = computed<string>(() => props.icon || def.value?.icon || '★');

interface TierPalette {
  ringOuter: string;
  ringMid: string;
  ringInner: string;
  ringStroke: string;
  starColor: string;
  ribbonLight: string;
  ribbonDark: string;
}

const TIER_PALETTE: Readonly<Record<AchievementTier, TierPalette>> = {
  gold: {
    ringOuter: '#fef9c3',
    ringMid: '#facc15',
    ringInner: '#a16207',
    ringStroke: '#854d0e',
    starColor: '#fde68a',
    ribbonLight: '#dc2626',
    ribbonDark: '#7f1d1d',
  },
  silver: {
    ringOuter: '#f8fafc',
    ringMid: '#cbd5e1',
    ringInner: '#64748b',
    ringStroke: '#334155',
    starColor: '#e2e8f0',
    ribbonLight: '#1d4ed8',
    ribbonDark: '#1e3a8a',
  },
  bronze: {
    ringOuter: '#fed7aa',
    ringMid: '#c2825c',
    ringInner: '#7c3a14',
    ringStroke: '#5a2a0c',
    starColor: '#fdba74',
    ribbonLight: '#059669',
    ribbonDark: '#064e3b',
  },
};

const palette = computed<TierPalette>(() => TIER_PALETTE[tier.value]);

const faceLight = computed(() => `hsl(${hue.value}, 78%, 72%)`);
const faceMid = computed(() => `hsl(${hue.value}, 72%, 50%)`);
const faceDark = computed(() => `hsl(${hue.value}, 65%, 30%)`);

const uid = computed(() => `badge-${props.code.replace(/[^a-z0-9_-]/gi, '')}`);

/** 8 角星芒（在外环外侧形成放射状），每 22.5° 一个尖。 */
const starPoints = computed<string>(() => {
  const cx = 64;
  const cy = 60;
  const rOuter = 60;
  const rInner = 52;
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = (Math.PI * 2 * i) / 16 - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
});

const wrapStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
</script>

<template>
  <div class="badge-medal" :style="wrapStyle">
    <img
      v-if="effectiveImage"
      :src="effectiveImage"
      :alt="def?.name ?? code"
      class="badge-medal__image"
      :width="size"
      :height="size"
      loading="lazy"
      decoding="async"
    />

    <svg
      v-else
      class="badge-medal__svg"
      :width="size"
      :height="size"
      viewBox="0 0 128 128"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="`${uid}-ring`" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="palette.ringOuter" />
          <stop offset="50%" :stop-color="palette.ringMid" />
          <stop offset="100%" :stop-color="palette.ringInner" />
        </linearGradient>

        <radialGradient :id="`${uid}-face`" cx="35%" cy="30%" r="80%">
          <stop offset="0%" :stop-color="faceLight" />
          <stop offset="55%" :stop-color="faceMid" />
          <stop offset="100%" :stop-color="faceDark" />
        </radialGradient>

        <linearGradient :id="`${uid}-ribbon-l`" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" :stop-color="palette.ribbonLight" />
          <stop offset="100%" :stop-color="palette.ribbonDark" />
        </linearGradient>
        <linearGradient :id="`${uid}-ribbon-r`" x1="100%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="palette.ribbonLight" />
          <stop offset="100%" :stop-color="palette.ribbonDark" />
        </linearGradient>

        <radialGradient :id="`${uid}-highlight`" cx="38%" cy="28%" r="55%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />
          <stop offset="60%" stop-color="#ffffff" stop-opacity="0.0" />
        </radialGradient>
      </defs>

      <path
        d="M 30 70 L 18 122 L 36 112 L 50 102 Z"
        :fill="`url(#${uid}-ribbon-l)`"
        stroke="rgba(0,0,0,0.15)"
        stroke-width="0.5"
      />
      <path
        d="M 98 70 L 110 122 L 92 112 L 78 102 Z"
        :fill="`url(#${uid}-ribbon-r)`"
        stroke="rgba(0,0,0,0.15)"
        stroke-width="0.5"
      />

      <polygon
        :points="starPoints"
        :fill="palette.starColor"
        :stroke="palette.ringStroke"
        stroke-width="0.8"
        opacity="0.85"
      />

      <circle
        cx="64"
        cy="60"
        r="46"
        :fill="`url(#${uid}-ring)`"
        :stroke="palette.ringStroke"
        stroke-width="1.5"
      />

      <circle
        cx="64"
        cy="60"
        r="40"
        fill="none"
        :stroke="palette.ringStroke"
        stroke-width="0.6"
        stroke-dasharray="2 2"
        opacity="0.55"
      />

      <circle
        cx="64"
        cy="60"
        r="36"
        :fill="`url(#${uid}-face)`"
        :stroke="palette.ringStroke"
        stroke-width="1"
      />

      <ellipse
        cx="54"
        cy="46"
        rx="22"
        ry="14"
        :fill="`url(#${uid}-highlight)`"
      />

      <text
        x="64"
        y="74"
        text-anchor="middle"
        font-size="36"
        class="badge-medal__icon"
      >{{ emoji }}</text>
    </svg>
  </div>
</template>

<style scoped>
.badge-medal {
  display: block;
  filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.18));
}
.badge-medal__image,
.badge-medal__svg {
  display: block;
  width: 100%;
  height: 100%;
}
.badge-medal__image {
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
.badge-medal__icon {
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.18);
  stroke-width: 0.6px;
  user-select: none;
}
</style>
