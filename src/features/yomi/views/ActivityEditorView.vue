<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowLeft, ArrowRight, CircleCloseFilled, DocumentCopy, MagicStick, Warning } from '@element-plus/icons-vue';

import ActivityAssetLibrary from '../components/ActivityAssetLibrary.vue';
import ActivityCodeEditor from '../components/ActivityCodeEditor.vue';
import ActivityHtmlPreview from '../components/ActivityHtmlPreview.vue';
import ActivityImageSlot from '../components/ActivityImageSlot.vue';
import ActivityRewardPanel from '../components/ActivityRewardPanel.vue';
import ActivityThemeEditor from '../components/ActivityThemeEditor.vue';
import { getYomiActivityPort } from '../services';
import {
  ACTIVITY_LIMITS,
  IMAGE_SPECS,
  activityStatusLabels,
  buildAiPrompt,
  missingAssetRefs,
  parseAiDraft,
  suggestAssetName,
  type ActivityImage,
  type ActivityInput,
  type ActivityStatus,
  type EditableAsset,
  type YomiActivity,
} from '../model/activity.types';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  presetKeyOf,
  presetTheme,
  themeProblem,
  validTheme,
  type ActivityTheme,
} from '../model/activityTheme';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALES,
  MESSAGE_LIMITS,
  buildTranslatePrompt,
  diffMessages,
  dropRewardKeys,
  emptyMessages,
  formatBundle,
  hasChanges,
  invalidMessageKey,
  localeLabel,
  messageKeys,
  missingKeys,
  normalizeMessages,
  orderLocales,
  parseBundle,
  placeholders,
  renameRewardKeys,
  renderTemplate,
  requiredKeys,
  textOf,
  type ActivityMessages,
  type LocaleMessages,
} from '../model/activityMessages';
import {
  placedRewardKeys,
  renameFieldMessages,
  rewardOwnsMessage,
  rewardRequiredKeys,
  type ActivityReward,
  type FieldRenames,
} from '../model/activityReward.types';
import { validateImageFile } from '../api/adapters/yomiActivityAdapter';

const route = useRoute();
const router = useRouter();
const port = getYomiActivityPort();

const activityId = computed(() => (route.params.id ? String(route.params.id) : null));

interface FormState {
  slug: string;
  cover: ActivityImage | null;
  hero: ActivityImage | null;
  assets: EditableAsset[];
  linkUrl: string;
  startAt: Date | null;
  endAt: Date | null;
  isPublished: boolean;
  sortOrder: number;
}

function emptyForm(): FormState {
  return {
    slug: '',
    cover: null,
    hero: null,
    assets: [],
    linkUrl: '',
    startAt: null,
    endAt: null,
    isPublished: false,
    sortOrder: 0,
  };
}

const form = reactive<FormState>(emptyForm());

// ---------------- 活动时间 ----------------
//
// 开始不填是发布即开始，结束不填是长期活动（永不结束）；两个都可以单独留空，所以不用范围选择器。

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const startShortcuts = [
  { text: '今天', value: () => startOfDay(new Date()) },
  { text: '明天', value: () => new Date(startOfDay(new Date()).getTime() + DAY) },
];
/** 从开始那天（没填就是今天）算起的 n 个整天，结束在第 n 天的最后一秒。 */
const endShortcuts = [7, 14, 30].map((n) => ({
  text: `${n} 天`,
  value: () => new Date(startOfDay(form.startAt ?? new Date()).getTime() + n * DAY - 1000),
}));
// 只选日期不选时间时，开始取当天零点、结束取当天最后一秒。
const startDefaultTime = new Date(2000, 0, 1, 0, 0, 0);
const endDefaultTime = new Date(2000, 0, 1, 23, 59, 59);
const beforeStart = (d: Date) => !!form.startAt && d.getTime() < startOfDay(form.startAt).getTime();
const status = ref<ActivityStatus | null>(null);
const loading = ref(false);
const saving = ref(false);
const rewards = ref<ActivityReward[]>([]);

// ---------------- 主题：一组 CSS 变量 ----------------
//
// 预设只是一键填进去的几组现成取值，改过一个值就算自定义。

const theme = ref<ActivityTheme>({ ...DEFAULT_THEME });
const themeError = computed(() => themeProblem(theme.value));
// 主题是高级设置，平时折叠，只显示当前用的是哪套。
const themeOpen = ref(false);
const themeName = computed(() => {
  const key = presetKeyOf(theme.value);
  return THEME_PRESETS.find((p) => p.key === key)?.label ?? '自定义';
});
// 写到一半不合法的值不进预览。
const previewTheme = computed(() => validTheme(theme.value));

// ---------------- 模板与语言包 ----------------
//
// 正文只有一份模板，文字写成 {{key}}；每种语言一份语言包 JSON。代码区一次编辑其中一个文件，
// 预览按所选语言把模板渲染出来。

const TEMPLATE_FILE = 'template';

/** 后端支持的语言，以 `GET {id}/messages` 返回的为准 */
const locales = ref<string[]>([...FALLBACK_LOCALES]);
const template = ref('');
/** 各语言语言包的 JSON 原文，运营直接编辑的就是它 */
const packTexts = ref<Record<string, string>>({});
/** 库里的语言包，保存时与它比出改动 */
const savedMessages = ref<ActivityMessages>(emptyMessages(FALLBACK_LOCALES));

// 奖励是异步加载的，这里只查 JSON 和 key 的形状；引用的奖励在不在，保存时再查。
const parsedPacks = computed(() => Object.fromEntries(locales.value.map((l) => [l, parseBundle(packTexts.value[l] ?? '', null)])));

// JSON 写到一半不合法时，预览和比对沿用上一次合法的内容，免得整页闪空。
const lastGood = reactive<Record<string, LocaleMessages>>({});
watch(parsedPacks, (packs) => {
  for (const [l, r] of Object.entries(packs)) if (r.ok) lastGood[l] = r.messages;
}, { immediate: true, flush: 'sync' });

const messages = computed<ActivityMessages>(() => Object.fromEntries(locales.value.map((l) => [l, lastGood[l] ?? {}])));
const packError = (l: string) => {
  const r = parsedPacks.value[l];
  return r && !r.ok ? r.message : null;
};

function resetPacks(m: ActivityMessages): void {
  locales.value = orderLocales(Object.keys(m).length ? Object.keys(m) : FALLBACK_LOCALES);
  const saved = normalizeMessages({ ...emptyMessages(locales.value), ...m });
  savedMessages.value = saved;
  for (const l of Object.keys(lastGood)) delete lastGood[l];
  packTexts.value = Object.fromEntries(locales.value.map((l) => [l, formatBundle(saved[l] ?? {})]));
}

/** 改一种语言的语言包；JSON 现在不合法就以 base 为准重写。 */
function rewritePack(l: string, change: (m: LocaleMessages) => LocaleMessages): void {
  const r = parsedPacks.value[l];
  const before = r?.ok ? r.messages : lastGood[l] ?? {};
  const after = change(before);
  if (JSON.stringify(after) !== JSON.stringify(before) || !r?.ok) packTexts.value = { ...packTexts.value, [l]: formatBundle(after) };
}

const required = computed(() => requiredKeys(template.value, rewardRequiredKeys(rewards.value)));
const missing = computed(() => Object.fromEntries(locales.value.map((l) => [l, missingKeys(messages.value, l, required.value)])));

/** 后端在奖励改 key、删条件 / 登记项、删奖励时搬 / 清了它名下的 key，这边两份一起跟上。 */
function onRewardKeys(from: string | null, saved: ActivityReward | null, renames?: FieldRenames | null): void {
  const move = (m: LocaleMessages): LocaleMessages => {
    if (!saved) return from ? dropRewardKeys(m, from) : m;
    const renamed = renameFieldMessages(from ? renameRewardKeys(m, from, saved.key) : m, saved.key, renames);
    return dropRewardKeys(renamed, saved.key, (field) => rewardOwnsMessage(saved, field));
  };
  savedMessages.value = Object.fromEntries(Object.entries(savedMessages.value).map(([l, m]) => [l, move(m)]));
  for (const l of locales.value) rewritePack(l, move);
}

// ---------------- 代码区：当前编辑的文件 ----------------

const file = ref(TEMPLATE_FILE);
const editingPack = computed(() => (file.value === TEMPLATE_FILE ? null : file.value));

const fileOptions = computed(() => [
  { label: '模板', value: TEMPLATE_FILE },
  ...locales.value.map((l) => {
    const n = missing.value[l]?.length ?? 0;
    const tail = packError(l) ? ' · 有错' : n ? ` · 缺 ${n}` : '';
    return { label: `${l}.json${tail}`, value: l };
  }),
]);

const code = computed({
  get: () => (editingPack.value ? packTexts.value[editingPack.value] ?? '' : template.value),
  set: (v: string) => {
    if (editingPack.value) packTexts.value = { ...packTexts.value, [editingPack.value]: v };
    else template.value = v;
  },
});

const codePlaceholder = computed(() => (editingPack.value
  ? '{\n  "title": "",\n  "lead": ""\n}'
  : '<style>\n  .lead { … }\n</style>\n<section class="lead">\n  <img src="asset:gift" alt="{{lead.alt}}">\n  <p>{{lead}}</p>\n</section>'));

/** 往当前语言包里插入还缺的 key（值留空等人填），默认语言之外的按默认语言的 key 补。 */
function fillMissing(): void {
  const l = editingPack.value;
  if (!l) return;
  const keys = missing.value[l] ?? [];
  rewritePack(l, (m) => ({ ...m, ...Object.fromEntries(keys.filter((k) => !(k in m)).map((k) => [k, ''])) }));
}

async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(done);
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

function copyTranslatePrompt(): void {
  const l = editingPack.value;
  if (!l) return;
  const source = normalizeMessages(messages.value)[DEFAULT_LOCALE] ?? {};
  void copyText(buildTranslatePrompt(source, DEFAULT_LOCALE, l), `翻译提示词已复制（${Object.keys(source).length} 条），把 AI 的回复整个粘进 ${l}.json`);
}

// ---------------- 预览 ----------------

type EditorLayout = 'preview' | 'split' | 'code';

// 进来先看活动长什么样；运营切过的布局记在本机，下次打开沿用。
const LAYOUT_KEY = 'meeko.yomi.activityEditor.layout';

function storedLayout(): EditorLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === 'split' || v === 'code' || v === 'preview' ? v : 'preview';
  } catch {
    return 'preview';
  }
}

const layout = ref<EditorLayout>(storedLayout());
watch(layout, (v) => {
  try {
    localStorage.setItem(LAYOUT_KEY, v);
  } catch {
    // 隐私模式等存不了就算了，只是下次回到默认。
  }
});
const device = ref<'desktop' | 'mobile'>('desktop');
const previewLocale = ref(DEFAULT_LOCALE);
// 正在编辑哪种语言的 JSON，就预览哪种语言。
watch(editingPack, (l) => {
  if (l) previewLocale.value = l;
});

const previewText = (key: string) => textOf(messages.value, previewLocale.value, key);
const previewHtml = computed(() => renderTemplate(template.value, previewText));
const previewTitle = computed(() => previewText(messageKeys.title) ?? '');
const previewRewardNames = computed(() => new Map(rewards.value.map((r) => [r.key, previewText(messageKeys.rewardName(r.key)) ?? r.key])));

const uploading = reactive({ cover: false, hero: false });
const editor = ref<InstanceType<typeof ActivityCodeEditor>>();

let uidSeq = 0;
const nextUid = () => `a${++uidSeq}`;

function fill(a: YomiActivity): void {
  Object.assign(form, {
    slug: a.slug,
    cover: a.cover,
    hero: a.hero,
    assets: a.assets.map((x) => ({ uid: nextUid(), name: x.name, key: x.key, url: x.url, uploading: false })),
    linkUrl: a.linkUrl ?? '',
    startAt: a.startAtUtc ? new Date(a.startAtUtc) : null,
    endAt: a.endAtUtc ? new Date(a.endAtUtc) : null,
    isPublished: a.isPublished,
    sortOrder: a.sortOrder,
  });
  template.value = a.html;
  theme.value = { ...a.theme };
  status.value = a.status;
}

// ---------------- 未保存提示 ----------------

function structure(): Omit<ActivityInput, 'messages'> {
  return {
    slug: form.slug.trim(),
    theme: theme.value,
    coverKey: form.cover?.key ?? null,
    heroKey: form.hero?.key ?? null,
    assets: form.assets.filter((a) => a.key).map((a) => ({ name: a.name.trim(), key: a.key! })),
    linkUrl: form.linkUrl.trim() || null,
    // 后端 DateTime 走 Unix 毫秒。
    startAtUtc: form.startAt?.getTime() ?? null,
    endAtUtc: form.endAt?.getTime() ?? null,
    isPublished: form.isPublished,
    sortOrder: form.sortOrder,
    html: template.value.trim(),
  };
}

const pendingMessages = computed(() => diffMessages(savedMessages.value, messages.value));
const savedSnapshot = ref('');
const dirty = computed(() => JSON.stringify(structure()) !== savedSnapshot.value
  || hasChanges(pendingMessages.value)
  || !!themeError.value
  || locales.value.some((l) => packError(l)));
const markSaved = () => {
  savedSnapshot.value = JSON.stringify(structure());
};

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (dirty.value) e.preventDefault();
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('还有没保存的修改，确定离开？', '离开编辑器', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '继续编辑',
    });
    return true;
  } catch {
    return false;
  }
});

// ---------------- 加载 ----------------

async function load(): Promise<void> {
  Object.assign(form, emptyForm());
  template.value = '';
  theme.value = { ...DEFAULT_THEME };
  status.value = null;
  resetPacks({});
  if (!activityId.value) {
    markSaved();
    return;
  }
  loading.value = true;
  const [r, m] = await Promise.all([port.get(activityId.value), port.messages(activityId.value)]);
  loading.value = false;
  if (!r.success) {
    ElMessage.error(r.error.message);
    return;
  }
  if (!m.success) {
    ElMessage.error(m.error.message);
    return;
  }
  fill(r.data);
  resetPacks(m.data);
  markSaved();
}

/** 新建保存后会跳到它的编辑地址，表单已经是最新的，不用再拉一遍。 */
let createdId: string | null = null;

watch(activityId, (id) => {
  if (id && id === createdId) return;
  void load();
});

onMounted(() => {
  void load();
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

// ---------------- 图片 ----------------

async function uploadSlot(slot: 'cover' | 'hero', f: File): Promise<void> {
  uploading[slot] = true;
  try {
    const r = await port.uploadImage(f);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    form[slot] = r.data;
  } finally {
    uploading[slot] = false;
  }
}

function clearSlot(slot: 'cover' | 'hero'): void {
  form[slot] = null;
}

async function uploadAssets(files: File[]): Promise<void> {
  const room = ACTIVITY_LIMITS.assets - form.assets.length;
  if (files.length > room) ElMessage.warning(`素材最多 ${ACTIVITY_LIMITS.assets} 张，只上传前 ${room} 张`);

  const taken = new Set(form.assets.map((a) => a.name));
  for (const f of files.slice(0, room)) {
    const invalid = validateImageFile(f);
    if (invalid) {
      ElMessage.error(invalid);
      continue;
    }
    const name = suggestAssetName(f.name, taken);
    taken.add(name);
    const row: EditableAsset = { uid: nextUid(), name, key: null, url: null, uploading: true };
    form.assets.push(row);
    const r = await port.uploadImage(f);
    // 拿到响应式代理再改，才会触发界面刷新。
    const live = form.assets.find((a) => a.uid === row.uid);
    if (!live) continue;
    if (r.success) {
      Object.assign(live, { key: r.data.key, url: r.data.url, uploading: false });
    } else {
      ElMessage.error(r.error.message);
      form.assets.splice(form.assets.indexOf(live), 1);
    }
  }
}

/** 素材引用、领取按钮都写进模板。 */
async function insertReference(reference: string): Promise<void> {
  if (layout.value === 'preview') layout.value = 'split';
  if (file.value !== TEMPLATE_FILE) {
    file.value = TEMPLATE_FILE;
    await nextTick();
  }
  editor.value?.insert(reference);
}

// ---------------- 模板提示 ----------------

const templateSize = computed(() => template.value.length);
const placedKeys = computed(() => placedRewardKeys(template.value));
const previewAssets = computed(() => form.assets.map((a) => ({ name: a.name, key: a.key ?? '', url: a.url })));
const missingRefs = computed(() => missingAssetRefs(template.value, previewAssets.value));
/** 模板里用了、默认语言语言包里还没有的 key */
const unresolved = computed(() => placeholders(template.value).filter((k) => !messages.value[DEFAULT_LOCALE]?.[k]?.trim()));

// ---------------- AI ----------------

const aiVisible = ref(false);
const aiRaw = ref('');

async function copyPrompt(): Promise<void> {
  try {
    const enabled = rewards.value.filter((r) => r.isEnabled);
    const named = enabled.map((r) => ({ key: r.key, name: messages.value[DEFAULT_LOCALE]?.[messageKeys.rewardName(r.key)] ?? '' }));
    await navigator.clipboard.writeText(buildAiPrompt(form.assets.filter((a) => a.key), named, locales.value));
    const extras = [
      form.assets.length ? `${form.assets.length} 张素材` : '',
      enabled.length ? `${enabled.length} 个奖励` : '',
    ].filter(Boolean).join('、');
    ElMessage.success(extras ? `提示词已复制（含 ${extras}）` : '提示词已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

function applyAiDraft(): void {
  const r = parseAiDraft(aiRaw.value);
  if (!r.ok) {
    ElMessage.error(r.message);
    return;
  }
  const d = r.draft;
  if (d.slug) form.slug = d.slug.trim().toLowerCase();
  const aiTheme = typeof d.theme === 'string' ? presetTheme(d.theme) : d.theme;
  const aiThemeProblem = aiTheme ? themeProblem(aiTheme) : null;
  if (aiTheme && !aiThemeProblem) theme.value = aiTheme;
  if (d.linkUrl !== undefined) form.linkUrl = d.linkUrl ?? '';
  if (d.startAt !== undefined) form.startAt = d.startAt === null ? null : new Date(d.startAt);
  if (d.endAt !== undefined) form.endAt = d.endAt === null ? null : new Date(d.endAt);
  if (d.html !== undefined) template.value = d.html;
  const skipped: string[] = [];
  for (const [l, texts] of Object.entries(d.messages ?? {})) {
    if (!locales.value.includes(l)) {
      skipped.push(l);
      continue;
    }
    const valid = Object.fromEntries(Object.entries(texts).filter(([k]) => !invalidMessageKey(k, null)));
    rewritePack(l, (m) => ({ ...m, ...valid }));
  }
  aiVisible.value = false;
  aiRaw.value = '';
  if (layout.value === 'code') layout.value = 'split';
  if (skipped.length) ElMessage.warning(`已填入；不支持的语言 ${skipped.join('、')} 已跳过`);
  else if (aiThemeProblem) ElMessage.warning(`已填入；AI 给的主题不能用（${aiThemeProblem}），沿用当前主题`);
  else ElMessage.success('已填入');
}

// ---------------- 保存 ----------------

function firstProblem(): { message: string; file?: string } | null {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(form.slug.trim())) return { message: 'slug 只能用小写字母、数字和 -，以字母或数字开头' };
  if (form.startAt && form.endAt && form.endAt <= form.startAt) return { message: '结束时间必须晚于开始时间' };
  if (uploading.cover || uploading.hero || form.assets.some((a) => a.uploading)) return { message: '还有图片在上传，稍等一下' };
  const names = form.assets.map((a) => a.name.trim());
  if (names.some((n) => !/^[a-z0-9][a-z0-9-]{0,47}$/.test(n))) return { message: '有素材名不合规（只能用小写字母、数字和 -）' };
  if (new Set(names).size !== names.length) return { message: '有重复的素材名' };
  if (themeError.value) {
    themeOpen.value = true;
    return { message: `主题：${themeError.value}` };
  }
  if (template.value.length > MESSAGE_LIMITS.template) return { message: '模板太大，图片请上传成素材再引用', file: TEMPLATE_FILE };
  const rewardKeys = new Set(rewards.value.map((r) => r.key));
  for (const l of locales.value) {
    const error = packError(l) ?? Object.keys(messages.value[l] ?? {}).map((k) => invalidMessageKey(k, rewardKeys)).find(Boolean);
    if (error) return { message: `${l}.json：${error}`, file: l };
  }
  const gaps = missing.value[DEFAULT_LOCALE] ?? [];
  if (form.isPublished && gaps.length) return { message: `发布前 ${DEFAULT_LOCALE}.json 还缺：${gaps.slice(0, 6).join('、')}${gaps.length > 6 ? ' 等' : ''}`, file: DEFAULT_LOCALE };
  return null;
}

async function save(): Promise<void> {
  if (saving.value) return;
  const problem = firstProblem();
  if (problem) {
    ElMessage.warning(problem.message);
    if (problem.file) {
      file.value = problem.file;
      if (layout.value === 'preview') layout.value = 'split';
    }
    return;
  }
  saving.value = true;
  try {
    const payload: ActivityInput = { ...structure(), messages: pendingMessages.value };
    const r = activityId.value ? await port.update(activityId.value, payload) : await port.create(payload);
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    fill(r.data);
    // 只挪基线，不动编辑中的 JSON 原文，免得正在打字的光标乱跳。
    savedMessages.value = normalizeMessages(messages.value);
    markSaved();
    ElMessage.success(r.data.isPublished ? '已保存，官网已更新' : '已保存为草稿');
    if (!activityId.value) {
      createdId = r.data.id;
      await router.replace({ name: 'yomi-activity-edit', params: { id: r.data.id } });
    }
  } finally {
    saving.value = false;
  }
}

function back(): void {
  void router.push({ name: 'yomi-activities' });
}
</script>

<template>
  <div
    v-loading="loading"
    class="editor"
  >
    <header class="editor__bar">
      <el-button
        :icon="ArrowLeft"
        text
        @click="back"
      >
        活动中心
      </el-button>
      <div class="editor__crumb">
        <span class="editor__crumb-title">{{ textOf(messages, DEFAULT_LOCALE, messageKeys.title) || (activityId ? '编辑活动' : '新建活动') }}</span>
        <el-tag
          v-if="status"
          size="small"
          effect="plain"
        >
          {{ activityStatusLabels[status] }}
        </el-tag>
        <el-tag
          v-if="dirty"
          size="small"
          type="warning"
          effect="plain"
        >
          未保存
        </el-tag>
      </div>
      <div class="editor__actions">
        <el-button
          :icon="DocumentCopy"
          @click="copyPrompt"
        >
          复制 AI 提示词
        </el-button>
        <el-button
          :icon="MagicStick"
          type="primary"
          plain
          @click="aiVisible = true"
        >
          粘贴 AI 内容
        </el-button>
        <el-divider direction="vertical" />
        <el-switch
          v-model="form.isPublished"
          inline-prompt
          active-text="已发布"
          inactive-text="草稿"
          style="--el-switch-on-color: var(--el-color-success)"
        />
        <el-button
          type="primary"
          :loading="saving"
          @click="save"
        >
          保存<span class="editor__kbd">Ctrl+S</span>
        </el-button>
      </div>
    </header>

    <div class="editor__body">
      <aside class="editor__side">
        <section class="side-block">
          <h3 class="side-block__title">
            基本设置
          </h3>
          <el-form
            label-position="top"
            size="default"
            class="side-form"
          >
            <el-form-item label="Slug">
              <el-input
                v-model="form.slug"
                :maxlength="ACTIVITY_LIMITS.slug"
                placeholder="double-eleven"
              >
                <template #prepend>
                  /activities/
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="参与链接">
              <el-input
                v-model="form.linkUrl"
                placeholder="/console/billing/topups"
              />
            </el-form-item>
            <el-form-item label="活动时间">
              <div class="window-field">
                <el-date-picker
                  v-model="form.startAt"
                  type="datetime"
                  format="YYYY-MM-DD HH:mm"
                  placeholder="立即开始"
                  :shortcuts="startShortcuts"
                  :default-time="startDefaultTime"
                />
                <span class="window-field__sep">至</span>
                <el-date-picker
                  v-model="form.endAt"
                  type="datetime"
                  format="YYYY-MM-DD HH:mm"
                  placeholder="长期"
                  :shortcuts="endShortcuts"
                  :default-time="endDefaultTime"
                  :disabled-date="beforeStart"
                />
              </div>
            </el-form-item>
            <el-form-item label="排序">
              <el-input-number
                v-model="form.sortOrder"
                :step="10"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-form>
        </section>

        <section class="side-block">
          <h3 class="side-block__title">
            图片
          </h3>
          <ActivityImageSlot
            label="封面图"
            :hint="IMAGE_SPECS.cover.hint"
            :ratio="IMAGE_SPECS.cover.ratio"
            :url="form.cover?.url ?? null"
            :placeholder="previewTheme.banner ?? ''"
            :uploading="uploading.cover"
            @upload="(f) => uploadSlot('cover', f)"
            @remove="clearSlot('cover')"
          />
          <ActivityImageSlot
            class="side-block__gap"
            label="Hero 图"
            :hint="IMAGE_SPECS.hero.hint"
            :ratio="IMAGE_SPECS.hero.ratio"
            :url="form.hero?.url ?? null"
            :placeholder="previewTheme.banner ?? ''"
            :uploading="uploading.hero"
            @upload="(f) => uploadSlot('hero', f)"
            @remove="clearSlot('hero')"
          />
        </section>

        <section class="side-block">
          <ActivityRewardPanel
            v-model:rewards="rewards"
            :activity-id="activityId"
            :placed-keys="placedKeys"
            :pack="messages[DEFAULT_LOCALE] ?? {}"
            @insert="insertReference"
            @keys="onRewardKeys"
          />
        </section>

        <section class="side-block">
          <ActivityAssetLibrary
            v-model="form.assets"
            @upload="uploadAssets"
            @insert="insertReference"
          />
        </section>

        <section class="side-block">
          <button
            type="button"
            class="side-block__toggle"
            @click="themeOpen = !themeOpen"
          >
            <el-icon><component :is="themeOpen ? ArrowDown : ArrowRight" /></el-icon>
            <span class="side-block__title side-block__title--inline">主题</span>
            <span
              class="theme-chip"
              :style="{ background: previewTheme.banner, color: previewTheme.ink }"
            >{{ themeName }}</span>
          </button>
          <template v-if="themeOpen">
            <ActivityThemeEditor
              v-model="theme"
              class="side-block__gap"
            />
            <p
              v-if="themeError"
              class="side-block__error"
            >
              {{ themeError }}
            </p>
          </template>
        </section>
      </aside>

      <main class="editor__main">
        <div class="editor__toolbar">
          <el-segmented
            v-model="file"
            :options="fileOptions"
          />
          <span class="editor__spacer" />
          <el-segmented
            v-model="layout"
            :options="[{ label: '预览', value: 'preview' }, { label: '分栏', value: 'split' }, { label: '代码', value: 'code' }]"
          />
          <el-segmented
            v-if="layout !== 'code'"
            v-model="device"
            :options="[{ label: '桌面', value: 'desktop' }, { label: '手机', value: 'mobile' }]"
          />
        </div>

        <div
          class="editor__work"
          :class="`editor__work--${layout}`"
        >
          <section
            v-show="layout !== 'preview'"
            class="pane pane--code"
          >
            <div
              v-if="!editingPack"
              class="pane__head"
            >
              <span>模板 HTML</span>
              <span
                v-if="missingRefs.length"
                class="pane__warn"
              >
                <el-icon><Warning /></el-icon>
                素材库里没有：{{ missingRefs.map((n) => `asset:${n}`).join('、') }}
              </span>
              <span
                v-if="unresolved.length"
                class="pane__warn"
              >
                <el-icon><Warning /></el-icon>
                {{ DEFAULT_LOCALE }}.json 里没有：{{ unresolved.slice(0, 5).join('、') }}{{ unresolved.length > 5 ? ' 等' : '' }}
              </span>
              <span class="pane__size">{{ (templateSize / 1000).toFixed(1) }}K / {{ MESSAGE_LIMITS.template / 1000 }}K</span>
            </div>
            <div
              v-else
              class="pane__head"
            >
              <span>{{ localeLabel(editingPack) }} · {{ editingPack }}.json</span>
              <span
                v-if="packError(editingPack)"
                class="pane__error"
              >
                <el-icon><CircleCloseFilled /></el-icon>
                {{ packError(editingPack) }}
              </span>
              <el-button
                v-else-if="missing[editingPack]?.length"
                size="small"
                text
                type="warning"
                @click="fillMissing"
              >
                补齐缺的 {{ missing[editingPack]!.length }} 个 key
              </el-button>
              <el-button
                v-if="editingPack !== DEFAULT_LOCALE"
                class="pane__end"
                size="small"
                text
                :icon="MagicStick"
                @click="copyTranslatePrompt"
              >
                复制翻译提示词
              </el-button>
            </div>
            <div class="pane__fill">
              <ActivityCodeEditor
                :key="file"
                ref="editor"
                v-model="code"
                :placeholder="codePlaceholder"
                @save="save"
              />
            </div>
          </section>

          <section
            v-show="layout !== 'code'"
            class="pane pane--preview"
          >
            <div class="pane__head">
              <span>预览</span>
              <el-segmented
                v-model="previewLocale"
                class="pane__end"
                size="small"
                :options="locales.map((l) => ({ label: localeLabel(l), value: l }))"
              />
            </div>
            <div class="pane__fill pane__fill--scroll">
              <ActivityHtmlPreview
                :html="previewHtml"
                :assets="previewAssets"
                :hero-url="form.hero?.url ?? null"
                :title="previewTitle"
                :theme="previewTheme"
                :device="device"
                :rewards="rewards"
                :reward-names="previewRewardNames"
                :locale="previewLocale"
              />
            </div>
          </section>
        </div>
      </main>
    </div>

    <el-dialog
      v-model="aiVisible"
      title="粘贴 AI 生成的活动 JSON"
      width="760px"
      append-to-body
    >
      <el-input
        v-model="aiRaw"
        type="textarea"
        :rows="18"
        class="ai-input"
        placeholder="{ &quot;slug&quot;: &quot;double-eleven&quot;, &quot;html&quot;: &quot;<h3>{{lead.title}}</h3>…&quot;, &quot;messages&quot;: { &quot;zh&quot;: { … }, &quot;en&quot;: { … } } }"
      />
      <template #footer>
        <el-button @click="aiVisible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :disabled="!aiRaw.trim()"
          @click="applyAiDraft"
        >
          填入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--el-bg-color-page);
}
.editor__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.editor__crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.editor__crumb-title {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.editor__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor__kbd {
  margin-left: 6px;
  font-size: 11px;
  opacity: 0.7;
}
.editor__body {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.editor__side {
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.side-block + .side-block {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.side-block__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.side-block__gap {
  margin-top: 14px;
}
.side-block__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.side-block__title--inline {
  margin: 0;
}
.theme-chip {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.window-field {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.window-field :deep(.el-date-editor) {
  flex: 1;
  min-width: 0;
  width: auto;
}
/* 侧栏只有 300 来像素宽，省掉日历图标，两个时间才并排放得下 */
.window-field :deep(.el-input__prefix) {
  display: none;
}
.window-field :deep(.el-input__inner) {
  font-size: 12px;
}
.window-field__sep {
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.side-block__error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-danger);
}
.side-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.side-form :deep(.el-form-item__label) {
  font-size: 12px;
}
.editor__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.editor__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.editor__spacer {
  flex: 1;
}
.editor__work {
  display: grid;
  flex: 1;
  min-height: 0;
}
.editor__work--split {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.editor__work--code,
.editor__work--preview {
  grid-template-columns: minmax(0, 1fr);
}
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.pane--code + .pane--preview {
  border-left: 1px solid var(--el-border-color-light);
}
.pane__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.pane__warn,
.pane__error {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pane__warn {
  color: var(--el-color-warning);
}
.pane__error {
  color: var(--el-color-danger);
}
.pane__size,
.pane__end {
  margin-left: auto;
}
.pane__size {
  font-variant-numeric: tabular-nums;
}
.pane__fill {
  flex: 1;
  min-height: 0;
}
.pane__fill--scroll {
  overflow: auto;
}
.ai-input :deep(textarea) {
  font-family: var(--el-font-family-mono, ui-monospace, monospace);
  font-size: 12px;
}
</style>
