import { onBeforeUnmount, onMounted, ref, type Ref, type ShallowRef } from 'vue';

/**
 * 观测宿主元素的实际像素宽度，用于让 SVG 折线图按 1:1 渲染。
 *
 * 背景：折线 / 面积图早先用固定 `viewBox="0 0 720 220"` + `preserveAspectRatio="none"`
 * 撑满容器，容器一旦比 720 宽，X 轴被非等比拉伸，文字（`¥`、数字刻度）跟着横向变形。
 * 这里把 `viewBox` 宽度对齐容器真实像素宽度，缩放比恒为 1，文字不再失真。
 *
 * @param hostEl 宿主元素的模板 ref（建议用 `useTemplateRef` 创建）。
 */
export function useChartWidth(
  hostEl: Readonly<ShallowRef<HTMLElement | null>>,
  fallback = 720,
): Ref<number> {
  const width = ref(fallback);
  let ro: ResizeObserver | null = null;

  onMounted(() => {
    const el = hostEl.value;
    if (!el) return;
    const measured = Math.round(el.clientWidth);
    if (measured > 0) width.value = measured;
    ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) width.value = w;
    });
    ro.observe(el);
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
  });

  return width;
}
