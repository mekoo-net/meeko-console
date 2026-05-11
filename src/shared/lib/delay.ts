/**
 * Mock 专用：模拟网络延迟。从 VITE_MOCK_DELAY_MS 读取上限，未配置则默认 220ms。
 * 用 `delay(0)` 跳过排队，仅在测试里使用。
 */
const DEFAULT_DELAY = 220;

function readEnvDelay(): number {
  const raw = import.meta.env?.VITE_MOCK_DELAY_MS;
  if (!raw) return DEFAULT_DELAY;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY;
}

export function delay(ms?: number): Promise<void> {
  const target = ms ?? readEnvDelay();
  if (target <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, target));
}
