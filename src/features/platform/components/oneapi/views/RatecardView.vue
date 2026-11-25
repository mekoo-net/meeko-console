<script setup lang="ts">
/**
 * 模型价格：模型的美元牌价，全站一份，各产品按它出价。左侧厂家、右侧这家的模型。
 *
 * 表的主人是 OneApi 的号池后台，这一页的请求由平台网关直接转给它（不经 Bff），改的就是它那张表。每个写操作号池后台都当场把受影响的厂家发布出去
 * （发到 NATS，平台收到再转给各产品），没发出去的它自己定时重发。所以这一页没有「发布」，发布成了也不提；
 * 只有回包说没发出去的时候在页面顶上留一块提示——「表里改成了」和「发布出去了」是两件事，不能弹一句「已保存」就过去了。
 *
 * 牌价从上游目录同步进来（整张表「同步全部」，或者一家一家「上游同步」），不从别处搬表，所以也没有「导入」。
 *
 * 这里只有牌价，不算有效价：倍率和有效价是各产品自己的事。
 * 渠道里的叫法和厂家目录对不上的（目录里是 gemini-3.1-pro-preview，渠道叫 gemini-3.1-pro），建成映射：
 * 一个模型名按这一家里已有的一行出价，缩进一格挂在它指的那一行下面。
 *
 * 每一行标着价格从哪来：同步来的写目录名，人录的、人改过的写「手动」。上游同步删上游已经不列的模型时只删前一种。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Delete, Edit, Link, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import {
  MAKER_OTHER,
  compareMakers,
  makerLabel,
  type BillingType,
  type ModelCapabilities,
  type RateBody,
} from '@yomi/common';
import RateEditDialog, { type RateDraft } from '@/features/yomi/components/RateEditDialog.vue';
import MakerMark from '@/features/yomi/components/pricing/MakerMark.vue';
import ModelKindMark from '@/features/yomi/components/pricing/ModelKindMark.vue';
import PriceCells from '@/features/yomi/components/pricing/PriceCells.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import { debounce } from '@/shared/lib/debounce';
import EmptyState from '@/shared/ui/EmptyState.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import WorkspaceLayout from '@/shared/ui/workspace/WorkspaceLayout.vue';
import { useAuthStore } from '@/stores/auth';

import PriceModelCreateDialog, { type NewPriceModel } from '../components/ratecard/PriceModelCreateDialog.vue';
import PricePublishAlert from '../components/ratecard/PricePublishAlert.vue';
import PriceSyncDialog from '../components/ratecard/PriceSyncDialog.vue';
import {
  EMBEDDING_CAPABILITIES,
  failureText,
  failuresAfterTakeover,
  failuresAfterWrite,
  formCapabilities,
  hasZeroPrice,
  isEmbeddingRow,
  mergeRate,
  needsTakeover,
  newModelFormCapabilities,
  priceRowView,
  type PriceRowView,
} from '../model/ratecard';
import type {
  ModelPriceRow,
  PriceApplyResult,
  PriceMakerGroup,
  PriceMapping,
  PriceMappingWriteResult,
  PricePublishFailure,
  PricePublishResult,
} from '../model/ratecard.types';
import { getOneApiRatecardPort } from '../services';

const port = getOneApiRatecardPort();
const auth = useAuthStore();
/** 没有写权限的人只能看：新建、改、删、同步都不摆出来。 */
const canWrite = computed(() => auth.hasPermission('platform.settings.write'));

// ---- 列表 -----------------------------------------------------------------------

const groups = ref<PriceMakerGroup[]>([]);
const loading = ref(false);
/** 第一次取完了没有（成没成都算）。整页的加载遮罩只在这之前盖：搜不到东西时列表也是空的，不能又盖一次。 */
const loaded = ref(false);
const loadError = ref<string | null>(null);
const selectedMaker = ref<string | null>(null);

/** 交给后端筛（对模型键和来源标识做包含匹配）。搜的时候左边只剩有匹配的厂家，个数也是匹配到的个数。 */
const keyword = ref('');
const searching = computed(() => keyword.value.trim() !== '');
let loadSeq = 0;

/** 手建、还没模型的厂家。表里没有厂家表，空的厂家只活在这一页上，直到第一条模型写进去。 */
const extraMakers = ref<string[]>([]);

const visibleGroups = computed<PriceMakerGroup[]>(() => {
  if (searching.value) return groups.value;
  const have = new Set(groups.value.map((g) => g.maker));
  const extras = extraMakers.value.filter((m) => !have.has(m)).map((maker) => ({ maker, items: [] }));
  // 后端回来的已经按厂家排好了；只有插进了手建的空厂家才重排
  if (extras.length === 0) return groups.value;
  return [...groups.value, ...extras].sort((a, b) => compareMakers(a.maker, b.maker));
});

/** 一家的模型数：有价的行加上映射（映射也是一个模型，只是按别的行出价）。 */
const modelCount = (g: PriceMakerGroup): number => g.items.length + (g.mappings?.length ?? 0);

const totalModels = computed(() => groups.value.reduce((n, g) => n + modelCount(g), 0));

const activeGroup = computed(
  () => visibleGroups.value.find((g) => g.maker === selectedMaker.value) ?? null,
);

/** 号池后台回了映射这一项才让建映射：没有的是有映射之前的版本，建了也存不下。 */
const canMap = computed(() => groups.value.some((g) => g.mappings !== undefined));

/** 整张表已有的映射：新建模型时拿来查重（搜索时只有搜到的那些，号池后台存的时候还会再拦一次）。 */
const allMappings = computed(() => groups.value.flatMap((g) => g.mappings ?? []));

type ListRow =
  | { type: 'price'; key: string; view: PriceRowView; parent: boolean }
  | { type: 'mapping'; key: string; mapping: PriceMapping; view: PriceRowView; last: boolean };

/** 每一行有价的下面挂着映射到它的那几个。 */
const rows = computed<ListRow[]>(() => {
  const group = activeGroup.value;
  if (!group) return [];
  return group.items.flatMap((price): ListRow[] => {
    const view = priceRowView(price);
    const mapped = (group.mappings ?? []).filter((m) => m.targetId === price.id);
    return [
      { type: 'price', key: `p:${price.id}`, view, parent: mapped.length > 0 },
      ...mapped.map(
        (mapping, i): ListRow => ({ type: 'mapping', key: `m:${mapping.id}`, mapping, view, last: i === mapped.length - 1 }),
      ),
    ];
  });
});

/** 选中的厂家还在就不动；不在了（搜没了，或者这家的模型删光了）换到第一家。 */
function ensureSelection(): void {
  if (visibleGroups.value.some((g) => g.maker === selectedMaker.value)) return;
  selectedMaker.value = visibleGroups.value[0]?.maker ?? null;
}

watch(visibleGroups, ensureSelection);

async function load(): Promise<void> {
  const mine = ++loadSeq;
  loading.value = true;
  try {
    const r = await port.listByMaker({ keyword: keyword.value.trim() });
    // 只认最后一次：边打字边搜，慢的旧结果回来不能盖掉新的
    if (mine !== loadSeq) return;
    if (!r.success) {
      loadError.value = failureText(r.error);
      ElMessage.error(failureText(r.error));
      return;
    }
    loadError.value = null;
    groups.value = r.data;
    ensureSelection();
  } finally {
    if (mine === loadSeq) {
      loading.value = false;
      loaded.value = true;
    }
  }
}

// 停手一会儿再搜，不是每敲一个字发一次
const search = debounce(() => void load(), 250);
watch(keyword, () => search());

/** 写完以后重取。等一拍再取：刚清掉的搜索词会先排上一次延迟的搜索，这里把它撤掉，不取两遍。 */
async function reload(): Promise<void> {
  await nextTick();
  search.cancel();
  await load();
}

function hintTitle(price: ModelPriceRow): string | undefined {
  const lines = [
    price.sourceRef,
    price.fetchedAtUtc === null ? '' : `抓取于 ${formatDateTime(price.fetchedAtUtc)}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

// ---- 没发布出去的 -----------------------------------------------------------------

/**
 * 没发布出去的厂家和原因，摆在页面顶上。平时是空的：发布是号池后台在每个写操作之后自己做的，成了不提。
 * 没成的它自己会定时重发，所以这里没有「发布」按钮；只有一种它补不上——这份表登记的主人是别的库，要人来接管。
 */
const failures = ref<PricePublishFailure[]>([]);

/** 写操作之后：说一句做成了什么；没发布出去的记到页面顶上。 */
function reportWrite(done: string, result: PricePublishResult): void {
  failures.value = failuresAfterWrite(failures.value, result);
  if (result.ok) ElMessage.success(done);
  else ElMessage.error(`${done}，但还没有发布出去`);
}

const takingOver = ref(false);

/**
 * 这份表登记的主人只有一个库。登记的是别的库时号池后台的发布一律不写；接管就是把登记改过来、再全量发布一遍——
 * 现在发布着的那一份会被换掉，各产品收到就照着重算、按它扣钱，所以要人明确来点。
 */
async function onTakeover(): Promise<void> {
  const okp = await confirmDanger({
    title: '接管发布',
    message:
      '现在发布着的、别的库的牌价会换成这一份，各产品收到就照着重算、扣费。只在迁库、重建之后用一次。',
    confirmText: '接管并发布',
  });
  if (!okp) return;
  takingOver.value = true;
  try {
    const r = await port.takeover();
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    failures.value = failuresAfterTakeover(r.data);
    if (r.data.ok) ElMessage.success('已接管');
    else ElMessage.error('接管了，但还没有发布出去');
  } finally {
    takingOver.value = false;
  }
}

// ---- 新建厂家 --------------------------------------------------------------------

const makerOpen = ref(false);
const makerInput = ref('');

function openCreateMaker(): void {
  makerInput.value = '';
  makerOpen.value = true;
}

function confirmNewMaker(): void {
  const key = makerInput.value.trim().toLowerCase();
  // 发布时一个厂家一份、键就是它：先拦住会变成奇怪键名的字符
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) {
    ElMessage.warning('厂家用小写字母开头，只含小写字母、数字、连字符、下划线');
    return;
  }
  if (key === MAKER_OTHER) {
    ElMessage.warning('「其他」是兜底分组，请用厂家自己的名字，例如 novelai');
    return;
  }
  // 建在搜索结果里看不见：先回到整张表
  keyword.value = '';
  if (!groups.value.some((g) => g.maker === key) && !extraMakers.value.includes(key)) {
    extraMakers.value = [...extraMakers.value, key];
  }
  makerOpen.value = false;
  // 等清掉搜索词以后的那份列表出来再选：这之前它还不在左栏里，选了也会被换回第一家
  void nextTick(() => {
    selectedMaker.value = key;
  });
}

// ---- 新建 / 改价 ------------------------------------------------------------------

interface Editing {
  modelKey: string;
  maker: string;
  /** 要改的行；新建是 null。 */
  row: ModelPriceRow | null;
  initial: RateBody | null;
  billingType: BillingType;
  /** 给表单看的模型能力（决定放出哪些档），不是要存的。 */
  capabilities: ModelCapabilities | null;
  embedding: boolean;
}

const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<Editing | null>(null);
const saving = ref(false);

/** 新建走两步：先在当前厂家下定模型名和类型，再填价。厂家由左侧选中项决定，不另外选。 */
function onNewModel(model: NewPriceModel): void {
  const maker = selectedMaker.value;
  if (!maker) return;
  const embedding = model.kind === 'embedding';
  editing.value = {
    modelKey: model.modelKey,
    maker,
    row: null,
    initial: null,
    billingType: model.billingType,
    capabilities: newModelFormCapabilities(model.modelKey, embedding),
    embedding,
  };
  editOpen.value = true;
}

function openEdit(view: PriceRowView): void {
  // 表单是按认识的那几种形状拼 rate 的：拿它去改一个认不出的价，存回去的就是另一种价了
  if (!view.body) return;
  editing.value = {
    modelKey: view.price.modelKey,
    maker: view.price.maker,
    row: view.price,
    initial: view.body,
    billingType: view.body.billingType,
    capabilities: formCapabilities(view.price),
    embedding: isEmbeddingRow(view.price),
  };
  editOpen.value = true;
}

async function onSubmit(draft: RateDraft): Promise<void> {
  const target = editing.value;
  if (!target) return;
  if (hasZeroPrice(draft, target.embedding)) {
    const okp = await confirmDanger({
      title: '价格是 0',
      message: `「${target.modelKey}」有价格是 0，各产品会按免费算。确认保存？`,
      confirmText: '保存',
    });
    if (!okp) return;
  }

  saving.value = true;
  try {
    const r = await port.upsert(
      target.row
        ? {
            // 改已有的行带行号：改的就是点的那一行，键原样不动。
            // 厂家也带上它现在的：不带的话号池后台按模型键重新推断，这一行可能被挪到别的厂家下面。
            id: target.row.id,
            modelKey: target.row.modelKey,
            maker: target.row.maker,
            billingType: draft.billingType,
            rate: mergeRate(target.row.rate, draft),
          }
        : {
            modelKey: target.modelKey,
            // 建在「其他」下面的不带厂家：号池后台见到 other 就原样归到其他，留空它才按模型名推断
            ...(target.maker !== MAKER_OTHER ? { maker: target.maker } : {}),
            billingType: draft.billingType,
            rate: draft.rate,
            ...(target.embedding ? { capabilities: EMBEDDING_CAPABILITIES } : {}),
          },
    );
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    editOpen.value = false;
    // 新建的行不一定对得上正在搜的词：清掉搜索，不然建完看不见它
    if (!target.row) keyword.value = '';
    reportWrite(`已保存 ${r.data.price.modelKey}`, r.data.publish);
    await reload();
    // 厂家可能是号池后台推断出来的：跳到这一行实际落在的那一家
    if (visibleGroups.value.some((g) => g.maker === r.data.price.maker)) {
      selectedMaker.value = r.data.price.maker;
    }
  } finally {
    saving.value = false;
  }
}

async function onDelete(price: ModelPriceRow): Promise<void> {
  const mapped = allMappings.value.filter((m) => m.targetId === price.id).map((m) => m.modelKey);
  const okp = await confirmDanger({
    title: '删除牌价',
    message:
      `删除「${price.modelKey}」？删除后各产品取不到这个模型的牌价。` +
      (mapped.length > 0 ? `映射到它的 ${mapped.join('、')} 一起删掉。` : ''),
    confirmText: '删除',
  });
  if (!okp) return;
  const r = await port.remove(price.id);
  if (!r.success) {
    ElMessage.error(failureText(r.error));
    return;
  }
  reportWrite(`已删除 ${price.modelKey}`, r.data.publish);
  await reload();
}

// ---- 映射 -------------------------------------------------------------------------

/** 新建模型时选了「映射模型」、建好了。 */
async function onMapped(result: PriceMappingWriteResult): Promise<void> {
  // 新建的映射不一定对得上正在搜的词：清掉搜索，不然建完看不见它
  keyword.value = '';
  reportWrite(`已映射 ${result.mapping.modelKey} → ${result.mapping.targetKey}`, result.publish);
  await reload();
}

/** 改一个映射按哪一行出价：只换指向，名字不动（名字要改就删了重建）。 */
const mappingOpen = ref(false);
const mappingEditing = ref<PriceMapping | null>(null);
const mappingTarget = ref('');
const mappingSaving = ref(false);

const mappingTargets = computed(() =>
  [...(activeGroup.value?.items ?? [])].sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
);

function openMapping(mapping: PriceMapping): void {
  mappingEditing.value = mapping;
  mappingTarget.value = mapping.targetId;
  mappingOpen.value = true;
}

async function saveMapping(): Promise<void> {
  const editingMapping = mappingEditing.value;
  if (!editingMapping) return;
  mappingSaving.value = true;
  try {
    const r = await port.saveMapping({ id: editingMapping.id, targetId: mappingTarget.value });
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    mappingOpen.value = false;
    reportWrite(`已映射 ${r.data.mapping.modelKey} → ${r.data.mapping.targetKey}`, r.data.publish);
    await reload();
  } finally {
    mappingSaving.value = false;
  }
}

async function onDeleteMapping(mapping: PriceMapping): Promise<void> {
  const okp = await confirmDanger({
    title: '删除映射',
    message: `删除「${mapping.modelKey}」？删除后它不再按 ${mapping.targetKey} 的价出价。`,
    confirmText: '删除',
  });
  if (!okp) return;
  const r = await port.removeMapping(mapping.id);
  if (!r.success) {
    ElMessage.error(failureText(r.error));
    return;
  }
  reportWrite(`已删除 ${mapping.modelKey}`, r.data.publish);
  await reload();
}

// ---- 上游同步 ---------------------------------------------------------------------

const syncOpen = ref(false);
/** 同步哪一家；null 是整张表（「同步全部」）。 */
const syncMaker = ref<string | null>(null);

function openSync(maker: string | null): void {
  syncMaker.value = maker;
  syncOpen.value = true;
}

async function onApplied(result: PriceApplyResult): Promise<void> {
  const removed = result.removed ? `，删除 ${result.removed} 条` : '';
  reportWrite(`已套用：新增 ${result.added} 条，更新 ${result.updated} 条${removed}`, result.publish);
  await reload();
}

onMounted(() => void load());

onBeforeUnmount(() => search.cancel());
</script>

<template>
  <WorkspaceLayout :loading="loading && !loaded">
    <template #header>
      <PageHeader title="模型价格">
        <template
          v-if="canWrite"
          #actions
        >
          <el-button
            :icon="Refresh"
            @click="openSync(null)"
          >
            同步全部
          </el-button>
        </template>
      </PageHeader>

      <div
        v-if="failures.length > 0"
        class="page-notes"
      >
        <PricePublishAlert
          :failures="failures"
          :auto-retry="!needsTakeover(failures)"
        >
          <template #actions>
            <!-- 主人是别的库时号池后台自己重发多少次都是同一个结果，这时才摆接管；别的失败它自己会补，不摆按钮 -->
            <el-button
              v-if="canWrite && needsTakeover(failures)"
              size="small"
              type="primary"
              :loading="takingOver"
              @click="onTakeover"
            >
              接管发布
            </el-button>
            <el-button
              size="small"
              link
              @click="failures = []"
            >
              关闭
            </el-button>
          </template>
        </PricePublishAlert>
      </div>
    </template>

    <aside class="provider-sidebar">
      <div class="provider-sidebar__toolbar">
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="搜索模型"
          clearable
          size="small"
        />
      </div>
      <div class="provider-sidebar__list">
        <button
          v-for="g in visibleGroups"
          :key="g.maker"
          type="button"
          class="provider-sidebar__item maker-item"
          :class="{ 'provider-sidebar__item--active': selectedMaker === g.maker }"
          @click="selectedMaker = g.maker"
        >
          <MakerMark :maker="g.maker" />
          <span class="maker-item__body">
            <span class="maker-item__name">{{ makerLabel(g.maker) }}</span>
            <span class="maker-item__meta">{{ modelCount(g) }} 个模型</span>
          </span>
        </button>
        <p
          v-if="visibleGroups.length === 0 && !loading"
          class="provider-sidebar__empty"
        >
          {{ searching ? '没有匹配的模型' : '没有厂家' }}
        </p>
      </div>
      <div class="maker-sidebar__foot">
        <span>{{ totalModels }} 个模型</span>
        <el-button
          v-if="canWrite"
          :icon="Plus"
          link
          @click="openCreateMaker"
        >
          新建厂家
        </el-button>
      </div>
    </aside>

    <WorkspaceDetailPanel :show-placeholder="!activeGroup">
      <!-- 没读到、搜不到、表是空的是三回事：重试、换个词、从上游同步一份（或者手建第一家） -->
      <template #placeholder>
        <EmptyState
          v-if="loadError"
          title="没读到模型价格"
          :description="loadError"
        >
          <el-button
            :icon="Refresh"
            @click="load"
          >
            重试
          </el-button>
        </EmptyState>
        <EmptyState
          v-else-if="!loading && searching"
          title="没有匹配的模型"
        />
        <EmptyState
          v-else-if="!loading"
          title="还没有模型价格"
        >
          <template v-if="canWrite">
            <el-button
              :icon="Refresh"
              type="primary"
              @click="openSync(null)"
            >
              同步全部
            </el-button>
            <el-button
              :icon="Plus"
              @click="openCreateMaker"
            >
              新建厂家
            </el-button>
          </template>
        </EmptyState>
      </template>

      <template #header>
        <div class="detail-main">
          <MakerMark :maker="activeGroup!.maker" />
          <div class="detail-ident">
            <h2 class="provider-detail__title">
              {{ makerLabel(activeGroup!.maker) }}
            </h2>
            <p class="detail-sub">
              {{ modelCount(activeGroup!) }} 个模型 · 美元牌价
            </p>
          </div>
        </div>
        <div
          v-if="canWrite"
          class="detail-actions"
        >
          <el-button
            :icon="Refresh"
            @click="openSync(activeGroup!.maker)"
          >
            上游同步
          </el-button>
          <el-button
            :icon="Plus"
            type="primary"
            @click="createOpen = true"
          >
            新建模型
          </el-button>
        </div>
      </template>

      <div
        class="price-list"
        :class="{ 'price-list--readonly': !canWrite }"
      >
        <div
          v-if="rows.length > 0"
          class="price-row price-row--head"
        >
          <span class="price-row__id">模型</span>
          <span class="price-row__type">类型</span>
          <span class="price-row__price">价格</span>
          <span
            v-if="canWrite"
            class="price-row__ops"
          />
        </div>

        <!-- 行按行号认：同一个模型可能有两行（干净名的，和一行导入进来、带日期钉的旧键） -->
        <template
          v-for="row in rows"
          :key="row.key"
        >
          <!-- 映射：缩进挂在它指的那一行下面，价格不重复摆，写一句按谁的价 -->
          <article
            v-if="row.type === 'mapping'"
            class="price-row price-row--mapping"
            :class="{ 'price-row--last-child': row.last }"
          >
            <div class="price-row__id price-row__id--child">
              <div class="price-row__name">
                {{ row.mapping.modelKey }}
              </div>
              <div class="price-row__meta">
                <span class="src-badge src-badge--manual">手动</span>
              </div>
            </div>
            <div class="price-row__follow">
              <el-icon><Link /></el-icon>
              <span>映射到</span>
              <code>{{ row.mapping.targetKey }}</code>
            </div>
            <div
              v-if="canWrite"
              class="price-row__ops"
            >
              <el-button
                :icon="Edit"
                link
                title="编辑"
                @click="openMapping(row.mapping)"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                title="删除"
                @click="onDeleteMapping(row.mapping)"
              />
            </div>
          </article>

          <!-- 行按行号认：同一个模型可能有两行（干净名的，和一行导入进来、带日期钉的旧键） -->
          <article
            v-else
            class="price-row"
            :class="{ 'price-row--parent': row.parent }"
          >
            <div class="price-row__id">
              <div class="price-row__name">
                {{ row.view.price.modelKey }}
              </div>
              <div class="price-row__meta">
                <span
                  class="src-badge"
                  :class="{ 'src-badge--manual': row.view.manual }"
                  :title="hintTitle(row.view.price)"
                >{{ row.view.source }}</span>
                <span
                  v-if="row.view.hint"
                  class="price-row__hint"
                  :title="row.view.hint"
                >{{ row.view.hint }}</span>
              </div>
            </div>
            <div class="price-row__type">
              <ModelKindMark
                v-if="row.view.kind"
                :kind="row.view.kind"
              />
              <span
                v-else
                class="price-row__raw"
              >{{ row.view.price.billingType }}</span>
            </div>
            <div class="price-row__price">
              <PriceCells
                v-if="row.view.cells"
                :model="row.view.cells"
              />
              <!-- 认不出的价照样列出来：要看得见、删得掉，只是这里改不了 -->
              <span
                v-else
                class="price-row__unknown"
              >这种价格这里还认不出</span>
            </div>
            <div
              v-if="canWrite"
              class="price-row__ops"
            >
              <el-button
                v-if="row.view.body"
                :icon="Edit"
                link
                title="编辑"
                @click="openEdit(row.view)"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                title="删除"
                @click="onDelete(row.view.price)"
              />
            </div>
          </article>
        </template>

        <EmptyState
          v-if="rows.length === 0"
          class="price-list__empty"
          title="这家还没有模型"
        />
      </div>
    </WorkspaceDetailPanel>

    <PriceModelCreateDialog
      v-model="createOpen"
      :maker="selectedMaker ?? ''"
      :models="activeGroup?.items ?? []"
      :mappings="allMappings"
      :can-map="canMap"
      @next="onNewModel"
      @mapped="onMapped"
    />

    <RateEditDialog
      v-model="editOpen"
      :subject-key="editing?.modelKey ?? ''"
      :initial="editing?.initial ?? null"
      :billing-type="editing?.billingType"
      :capabilities="editing?.capabilities ?? null"
      :loading="saving"
      title-noun="牌价"
      @submit="onSubmit"
    />

    <el-dialog
      v-model="makerOpen"
      title="新建厂家"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-input
        v-model="makerInput"
        placeholder="novelai / bfl / midjourney"
        clearable
        autofocus
        @keyup.enter="confirmNewMaker"
      />
      <template #footer>
        <el-button @click="makerOpen = false">
          取消
        </el-button>
        <el-button
          type="primary"
          @click="confirmNewMaker"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mappingOpen"
      :title="`映射 · ${mappingEditing?.modelKey ?? ''}`"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-select
        v-model="mappingTarget"
        class="mapping-target"
        placeholder="映射到"
        filterable
      >
        <el-option
          v-for="m in mappingTargets"
          :key="m.id"
          :label="m.modelKey"
          :value="m.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="mappingOpen = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="mappingSaving"
          @click="saveMapping"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <PriceSyncDialog
      v-model="syncOpen"
      :maker="syncMaker"
      @applied="onApplied"
    />
  </WorkspaceLayout>
</template>

<style scoped>
.page-notes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 提示贴着页头：它说的是这一页整张表的事，不是下面某一家的 */
  margin: -6px 0 12px;
}

.maker-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  line-height: 1;
}
.maker-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.maker-item__name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
}
.maker-item__meta {
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-text-color-secondary);
}
.maker-sidebar__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  padding: 8px 10px 8px 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
}

.detail-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-ident {
  min-width: 0;
}
.detail-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.detail-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
:deep(.provider-detail__header) {
  align-items: center;
}

/*
 * 列宽必须由整张表算，不能每行自己 grid：否则「图像」比「LLM」宽，
 * 类型列和价格列的左边缘一行一个位置，看起来就是歪的。
 */
.price-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  /*
   * 价格列至少和这一家里最宽的那一行一样宽（max-content），不够时先让模型名那列让：
   * 视频、图像分档的那几行比按 token 的宽，价格列按固定的下限来的话它们会溢出去、压在右边的操作按钮上。
   * 下限的 340px（放得下三组「icon + 数字」：入 / 写 5m、写 1h、出 / 读）在 .price-row__price 的 min-width 上。
   */
  grid-template-columns: minmax(140px, 1fr) max-content minmax(max-content, 1.2fr) 92px;
  column-gap: 16px;
  align-content: start;
  padding: 0 12px 8px;
}
.price-list--readonly {
  grid-template-columns: minmax(140px, 1fr) max-content minmax(max-content, 1.2fr);
}
.price-list__empty {
  grid-column: 1 / -1;
}
.price-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.price-row:not(.price-row--head):hover {
  background: var(--el-fill-color-light);
}
.price-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0 0 7px;
  background: var(--el-bg-color);
  border-bottom-color: var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.price-row__price {
  /* 含下面的 padding-left：不能被模型名那列挤成 0 */
  min-width: 340px;
  box-sizing: border-box;
  /* 只把类型和价格拉开；加在整表 column-gap 上会连模型名一起垫宽。 */
  padding-left: 28px;
}
.price-row__id {
  min-width: 0;
}
.price-row__type {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 26px;
  text-align: left;
}
.price-row__type :deep(.el-tooltip__trigger) {
  display: inline-flex;
  justify-content: flex-start;
}
.price-row__name {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 映射挂在它指的那一行下面：中间不画分隔线，左边一条拐角线连上去 */
.price-row--parent,
.price-row--mapping:not(.price-row--last-child) {
  border-bottom-color: transparent;
}
.price-row--mapping {
  padding: 2px 0 11px;
}
.price-row__id--child {
  position: relative;
  padding-left: 26px;
}
.price-row__id--child::before {
  content: '';
  position: absolute;
  left: 8px;
  top: -14px;
  width: 11px;
  height: 26px;
  border-left: 1.5px solid var(--el-border-color);
  border-bottom: 1.5px solid var(--el-border-color);
  border-bottom-left-radius: 6px;
}
.price-row--mapping .price-row__name {
  font-weight: 500;
}
.price-row__follow {
  grid-column: 2 / 4;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.price-row__follow code {
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.price-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 4px;
}
/* 来源：同步来的是目录名（带主色），人录的、人改过的是「手动」（灰） */
.src-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.src-badge--manual {
  color: var(--el-text-color-regular);
  background: var(--el-fill-color);
}
.mapping-target {
  width: 100%;
}
.price-row__hint {
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.price-row__raw {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}
.price-row__unknown {
  font-size: 12.5px;
  color: var(--el-text-color-placeholder);
}
.price-row__ops {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
</style>
