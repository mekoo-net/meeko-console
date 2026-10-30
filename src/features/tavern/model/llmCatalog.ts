import type { LlmPipelinePurpose, LlmPlatformModelOption } from './llmSettings.types';

export type ModelKind = 'chat' | 'embedding' | 'ranking';

export interface CatalogEntry {
  /** 完整目录 id（`{渠道}/{模型名}`），保存的就是它。 */
  id: string;
  name: string;
  /** 目录里没有这条 id（只是已保存的值）时为 null。 */
  model: LlmPlatformModelOption | null;
  vision: boolean;
  /** 不适用于当前管线的原因；可选时为 null。 */
  unfit: string | null;
}

export interface CatalogChannel {
  id: string;
  entries: CatalogEntry[];
  /** 可选条目数（含目录里已没有、但已保存的那条）。 */
  selectable: number;
}

/**
 * 目录 id 是 `{providerId}/{模型名}`。模型名自己也可能带斜杠
 * （cmdc 的 `deepseek/deepseek-v4-pro`、fireworks 的 `accounts/fireworks/models/...`），只切第一个。
 */
export function splitModelId(id: string): { channel: string; name: string } {
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) return { channel: '', name: id };
  return { channel: id.slice(0, slash), name: id.slice(slash + 1) };
}

export function sameModelId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** 与服务端 `LlmPipelineRegistry.PurposesOf` 同一套名称规则；两边不一致时保存会被拒。 */
export function modelKind(model: Pick<LlmPlatformModelOption, 'id' | 'label'>): ModelKind {
  const name = `${model.id} ${model.label}`.toLowerCase();
  if (name.includes('embed')) return 'embedding';
  if (name.includes('rerank') || name.includes('ranker')) return 'ranking';
  return 'chat';
}

function hasVision(model: LlmPlatformModelOption): boolean {
  return model.modalities.some((m) => m.toLowerCase() === 'vision');
}

/** 服务端 `LlmPipelineRegistry.CandidatesFor` 的镜像，不适用时给出原因。 */
export function unfitReason(purpose: LlmPipelinePurpose, model: LlmPlatformModelOption): string | null {
  const kind = modelKind(model);
  switch (purpose) {
    case 'embedding':
      return kind === 'embedding' ? null : '不是向量模型';
    case 'ranking':
      return kind === 'ranking' ? null : '不是重排模型';
    case 'vision':
      if (kind === 'embedding') return '向量模型';
      if (kind === 'ranking') return '重排模型';
      return hasVision(model) ? null : '目录未标记识图能力';
    default:
      if (kind === 'embedding') return '向量模型';
      if (kind === 'ranking') return '重排模型';
      return null;
  }
}

/**
 * 按渠道分组整份目录。不适用的模型也列出来（标原因、不可选），免得运营以为渠道没上这个模型；
 * `savedIds` 里目录已没有的 id 补进它的渠道，否则已保存的选择在弹窗里看不见。
 * 有可选模型的渠道排前面。
 */
export function groupCatalog(
  catalog: readonly LlmPlatformModelOption[],
  purpose: LlmPipelinePurpose,
  savedIds: ReadonlyArray<string | null | undefined> = [],
): CatalogChannel[] {
  const channels = new Map<string, CatalogChannel>();
  const seen = new Set<string>();

  function channelOf(id: string): CatalogChannel {
    let channel = channels.get(id);
    if (!channel) {
      channel = { id, entries: [], selectable: 0 };
      channels.set(id, channel);
    }
    return channel;
  }

  for (const model of catalog) {
    const key = model.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const { channel, name } = splitModelId(model.id);
    const unfit = unfitReason(purpose, model);
    const target = channelOf(channel);
    target.entries.push({ id: model.id, name, model, vision: hasVision(model), unfit });
    if (!unfit) target.selectable += 1;
  }

  for (const id of savedIds) {
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());

    const { channel, name } = splitModelId(id);
    const target = channelOf(channel);
    target.entries.push({ id, name, model: null, vision: false, unfit: null });
    target.selectable += 1;
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  for (const channel of channels.values()) {
    channel.entries.sort(byName);
  }

  return [...channels.values()].sort((a, b) => {
    const fitA = a.selectable > 0 ? 0 : 1;
    const fitB = b.selectable > 0 ? 0 : 1;
    if (fitA !== fitB) return fitA - fitB;
    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function entryMatches(channel: CatalogChannel, entry: CatalogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return channel.id.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q);
}
