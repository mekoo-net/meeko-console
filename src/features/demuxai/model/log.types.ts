/**
 * DemuxAi 调用日志类型——已收敛到平台公共契约 `@demux/common`（单一真源）。
 *
 * 注意：`account.iamUserUid` / `ListLogsFilter.iamUserUid` 对齐后端 wire 字段名
 * （历史本地命名 `iamId` 已统一为 `iamUserUid`，由 HttpAdapter 直接透传，不再改名）。
 */
export * from '@demux/common';
