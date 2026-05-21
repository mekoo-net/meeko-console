/**
 * 运行时模式：启动时根据 VITE_USE_MOCK 决定一次。
 * 各 feature 的 services 工厂据此选择 Mock / Http 实现，不在 getter 内部反复判断。
 */
const raw = (import.meta.env?.VITE_USE_MOCK as string | undefined)?.toLowerCase();

export const isMockMode: boolean = raw !== 'false';
