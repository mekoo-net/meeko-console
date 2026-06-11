/**
 * DemuxAi 枚举 / 标签映射——已收敛到平台公共契约 `@demux/common`（单一真源）。
 * 本文件仅做再导出，保留历史 import 路径不变。
 */
export * from '@demux/common';

import { ProviderGroupLabel } from '@demux/common';

/** @deprecated 使用 ProviderGroupLabel */
export const GatewayChannelLabel = ProviderGroupLabel;
