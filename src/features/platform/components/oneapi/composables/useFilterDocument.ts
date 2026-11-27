import { onMounted, ref, shallowRef } from 'vue';
import { ElMessage } from 'element-plus';

import type { FilterDoc, FilterProblem, FilterSchema } from '../model/filter.types';
import { failureText } from '../model/ratecard';
import { getOneApiFilterPort } from '../services';

/**
 * 「分类器」和「过滤器」两页共用的那一份文档。网关读的是一整份（分类器加各 Vendor 的过滤规则），
 * 所以两页各自改自己那一块，存的都是整份，带着同一个版本号。
 *
 * 一次只存一个动作：两个动作叠着发，后一个带的是旧版本号，会被自己前一个挤掉。
 * 别人先存过就重新读一遍，这次的改动不算——让人看着最新的再改，不替他合并。
 */
export function useFilterDocument() {
  const port = getOneApiFilterPort();

  /** 文档每次都是整份换（读回来的、存完回来的），不在原地改，所以不用深层响应。 */
  const doc = shallowRef<FilterDoc>({});
  /** 存的时候带回去的版本号；还没有文档时是 null。 */
  const version = ref<string | null>(null);
  const schema = shallowRef<FilterSchema>({ fields: [], operators: {}, vendors: [] });
  /**
   * 现在这份文档里网关读不懂的地方。存得进去的文档一定读得懂，所以只有读回来的那一份（有人直接改了 Consul）会有；
   * 有的话那几处在网关那边不生效，并且改好以前整份存不进去。
   */
  const problems = shallowRef<FilterProblem[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const loadError = ref<string | null>(null);
  const saving = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = null;
    const [snapshot, options] = await Promise.all([port.load(), port.schema()]);

    if (!snapshot.success) {
      loading.value = false;
      loaded.value = true;
      loadError.value = failureText(snapshot.error);
      return;
    }
    // 选项没取到不挡着看：下拉框是空的，已有的照样列得出来
    if (options.success) schema.value = options.data;
    else ElMessage.warning(`没取到字段和 Vendor 的选项：${failureText(options.error)}`);

    const checked = await port.validate(snapshot.data.doc);
    doc.value = snapshot.data.doc;
    version.value = snapshot.data.version;
    problems.value = checked.success ? checked.data : [];
    loading.value = false;
    loaded.value = true;
  }

  /** 存整份。成了换上号池后台回来的那一份（连同新版本号）。 */
  async function commit(next: FilterDoc): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    const res = await port.save(next, version.value);
    saving.value = false;

    if (res.success) {
      doc.value = res.data.doc;
      version.value = res.data.version;
      problems.value = [];
      return true;
    }
    if (res.error.code === 'conflict') {
      ElMessage.warning('别人刚改过，已经换成最新的，请看一下再改');
      await load();
      return false;
    }
    ElMessage.error(failureText(res.error));
    return false;
  }

  /**
   * 弹窗交出改动时用：先让号池后台只查不存，`pick` 从它的回话里挑出和这一项有关的那几句，有就不存、交回给弹窗
   * （存的那个接口不过时只回一句话，分不出是哪一处）；没有再存。校验接口没通不挡着存，存的时候号池后台还会再查一遍。
   * 回 null 是存成了；回数组是没存，数组是要给弹窗看的话（可能是空的：存的时候失败了，已经弹过提示）。
   */
  async function checkThenCommit(
    next: FilterDoc,
    pick: (problems: FilterProblem[]) => string[],
  ): Promise<string[] | null> {
    const checked = await port.validate(next);
    if (checked.success) {
      const own = pick(checked.data);
      if (own.length > 0) return own;
    }
    return (await commit(next)) ? null : [];
  }

  onMounted(load);

  return { doc, version, schema, problems, loading, loaded, loadError, saving, load, commit, checkThenCommit };
}
