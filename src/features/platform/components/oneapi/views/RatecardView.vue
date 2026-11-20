<script setup lang="ts">
/**
 * 模型价格：模型的美元牌价，全站一份，各产品按它出价。左侧厂家、右侧这家的模型。
 *
 * 表的主人是 OneApi 的号池后台，这一页经平台 Bff 直接改它。每个写操作号池后台都当场把受影响的厂家发布出去
 * （发到 NATS，各产品订阅），回包里带发布结果——「表里改成了」和「发布出去了」是两件事，这一页统一在这里报：
 * 没发布出去的留一块提示在页面顶上，直到整张表发布成功，不是弹一句「已保存」就过去了。
 *
 * 这里只有牌价，不算有效价：倍率和有效价是各产品自己的事。
 * 登记的只是厂家发布的模型——哪个渠道用什么别名叫它，是各产品去映射的事。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Delete, Edit, MoreFilled, Plus, Promotion, Refresh, Search, Upload } from '@element-plus/icons-vue';
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

import PriceImportDialog from '../components/ratecard/PriceImportDialog.vue';
import PriceModelCreateDialog, { type NewPriceModel } from '../components/ratecard/PriceModelCreateDialog.vue';
import PricePublishAlert from '../components/ratecard/PricePublishAlert.vue';
import PriceSyncDialog from '../components/ratecard/PriceSyncDialog.vue';
import RatecardStatusStrip, { type LastPublish } from '../components/ratecard/RatecardStatusStrip.vue';
import {
  EMBEDDING_CAPABILITIES,
  describePublish,
  failureText,
  failuresAfterFullPublish,
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
  PriceImportResult,
  PriceMakerGroup,
  PricePublishFailure,
  PricePublishResult,
  RatecardRelayStatus,
} from '../model/ratecard.types';
import { getOneApiRatecardPort } from '../services';

const port = getOneApiRatecardPort();
const auth = useAuthStore();
/** 没有写权限的人只能看：新建、改、删、同步、导入、发布都不摆出来。 */
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

const totalModels = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0));

const activeGroup = computed(
  () => visibleGroups.value.find((g) => g.maker === selectedMaker.value) ?? null,
);

const rows = computed(() => (activeGroup.value?.items ?? []).map(priceRowView));

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

// ---- 发布结果、转发状态 ----------------------------------------------------------

/** 没发布出去的厂家和原因，摆在页面顶上。只有整张表发布成功（发布 / 接管）才整个清掉。 */
const failures = ref<PricePublishFailure[]>([]);
const lastPublish = ref<LastPublish | null>(null);

const relay = ref<RatecardRelayStatus | null>(null);
const relayError = ref<string | null>(null);
const relayLoading = ref(false);
let relayTimer: ReturnType<typeof setTimeout> | null = null;

async function loadRelay(): Promise<void> {
  relayLoading.value = true;
  try {
    const r = await port.relayStatus();
    if (r.success) {
      relay.value = r.data;
      relayError.value = null;
    } else {
      // 不弹：这一条读不到不耽误改价，状态条上自己会写「读不到」
      relayError.value = failureText(r.error);
    }
  } finally {
    relayLoading.value = false;
  }
}

/** 发布以后平台要等 NATS 推过来、再去通知各产品，不是当场就有：马上取一次，隔一会儿再取一次。 */
function refreshRelaySoon(): void {
  void loadRelay();
  if (relayTimer !== null) clearTimeout(relayTimer);
  relayTimer = setTimeout(() => {
    relayTimer = null;
    void loadRelay();
  }, 3000);
}

/** 只碰几个厂家的写操作之后：说一句做成了什么、发布到了哪几家；没发布出去的记到页面顶上。 */
function reportWrite(done: string, result: PricePublishResult, opts: { quiet?: boolean } = {}): void {
  failures.value = failuresAfterWrite(failures.value, result);
  lastPublish.value = { atUtc: Date.now(), result };
  if (!result.ok) ElMessage.error(`${done}，但没有发布出去`);
  else if (!opts.quiet) ElMessage.success(`${done}，${describePublish(result)}`);
  refreshRelaySoon();
}

/** 整张表的发布（发布 / 接管）之后。 */
function reportFullPublish(done: string, result: PricePublishResult): void {
  failures.value = failuresAfterFullPublish(result);
  lastPublish.value = { atUtc: Date.now(), result };
  if (result.ok) ElMessage.success([done, describePublish(result)].filter(Boolean).join('，'));
  else ElMessage.error('没有发布出去');
  refreshRelaySoon();
}

const publishing = ref(false);

async function onPublish(): Promise<void> {
  publishing.value = true;
  try {
    const r = await port.publish();
    if (r.success) reportFullPublish('', r.data);
    else ElMessage.error(failureText(r.error));
  } finally {
    publishing.value = false;
  }
}

/**
 * 这份表登记的主人只有一个库。登记的是别的库时平常的发布一律不写；接管就是把登记改过来、再全量发布一遍——
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
  publishing.value = true;
  try {
    const r = await port.publish({ takeover: true });
    if (r.success) reportFullPublish('已接管', r.data);
    else ElMessage.error(failureText(r.error));
  } finally {
    publishing.value = false;
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
  const okp = await confirmDanger({
    title: '删除牌价',
    message: `删除「${price.modelKey}」？删除后各产品取不到这个模型的牌价。`,
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

// ---- 上游同步、导入 ---------------------------------------------------------------

const syncOpen = ref(false);
const syncMaker = ref<string | null>(null);
const importOpen = ref(false);

function openSync(maker: string | null): void {
  syncMaker.value = maker;
  syncOpen.value = true;
}

async function onApplied(result: PriceApplyResult): Promise<void> {
  reportWrite(`已套用：新增 ${result.added} 条，更新 ${result.updated} 条`, result.publish);
  await reload();
}

async function onImported(result: PriceImportResult): Promise<void> {
  // 各多少行导入窗口里已经摆着了，成了就不再弹；没发布出去的照样记到页面顶上
  reportWrite('已导入', result.publish, { quiet: true });
  await reload();
}

function onMore(command: string): void {
  if (command === 'sync-all') openSync(null);
}

onMounted(() => {
  void load();
  void loadRelay();
});

onBeforeUnmount(() => {
  search.cancel();
  if (relayTimer !== null) clearTimeout(relayTimer);
});
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
            :icon="Upload"
            @click="importOpen = true"
          >
            导入
          </el-button>
          <el-button
            :icon="Promotion"
            :loading="publishing"
            @click="onPublish"
          >
            发布
          </el-button>
          <el-dropdown
            trigger="click"
            @command="onMore"
          >
            <el-button
              :icon="MoreFilled"
              plain
            />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="sync-all">
                  同步全部
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </PageHeader>

      <div class="page-notes">
        <RatecardStatusStrip
          :last-publish="lastPublish"
          :relay="relay"
          :relay-error="relayError"
          :loading="relayLoading"
          @refresh="loadRelay"
        />
        <PricePublishAlert
          v-if="failures.length > 0"
          :failures="failures"
        >
          <template #actions>
            <!-- 主人是别的库时再点发布还是同一个结果，这时摆的是接管；别的失败（连不上、文档太大）才是重新发布 -->
            <el-button
              v-if="canWrite && needsTakeover(failures)"
              size="small"
              type="primary"
              :loading="publishing"
              @click="onTakeover"
            >
              接管发布
            </el-button>
            <el-button
              v-else-if="canWrite"
              size="small"
              :loading="publishing"
              @click="onPublish"
            >
              重新发布
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
            <span class="maker-item__meta">{{ g.items.length }} 个模型</span>
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
      <!-- 没读到、搜不到、表是空的是三回事：重试、换个词、去建第一家 -->
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
              :icon="Plus"
              type="primary"
              @click="openCreateMaker"
            >
              新建厂家
            </el-button>
            <el-button
              :icon="Upload"
              @click="importOpen = true"
            >
              导入
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
              {{ activeGroup!.items.length }} 个模型 · 美元牌价
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
        <article
          v-for="row in rows"
          :key="row.price.id"
          class="price-row"
        >
          <div class="price-row__id">
            <div class="price-row__name">
              {{ row.price.modelKey }}
            </div>
            <div
              v-if="row.hint"
              class="price-row__hint"
              :title="hintTitle(row.price)"
            >
              {{ row.hint }}
            </div>
          </div>
          <div class="price-row__type">
            <ModelKindMark
              v-if="row.kind"
              :kind="row.kind"
            />
            <span
              v-else
              class="price-row__raw"
            >{{ row.price.billingType }}</span>
          </div>
          <div class="price-row__price">
            <PriceCells
              v-if="row.cells"
              :model="row.cells"
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
              v-if="row.body"
              :icon="Edit"
              link
              title="编辑"
              @click="openEdit(row)"
            />
            <el-button
              :icon="Delete"
              link
              type="danger"
              title="删除"
              @click="onDelete(row.price)"
            />
          </div>
        </article>

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
      @next="onNewModel"
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

    <PriceSyncDialog
      v-model="syncOpen"
      :maker="syncMaker"
      @applied="onApplied"
    />

    <PriceImportDialog
      v-model="importOpen"
      @imported="onImported"
    />
  </WorkspaceLayout>
</template>

<style scoped>
.page-notes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 状态条贴着页头：它说的是这一页整张表的事，不是下面某一家的 */
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
  grid-template-columns: minmax(140px, 1fr) max-content minmax(max-content, 1.2fr) 64px;
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
.price-row__hint {
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
