import { describe, expect, it } from 'vitest';

import {
  entryMatches,
  groupCatalog,
  splitModelId,
  unfitReason,
  type CatalogChannel,
} from '../model/llmCatalog';
import type { LlmPlatformModelOption } from '../model/llmSettings.types';

const OPUS: LlmPlatformModelOption = { id: 'kiro/claude-opus-5', label: 'claude-opus-5', modalities: ['text'] };
const GEMINI: LlmPlatformModelOption = {
  id: 'antigravity/gemini-4-argon',
  label: 'gemini-4-argon',
  modalities: ['text', 'vision'],
};
const EMBED: LlmPlatformModelOption = {
  id: 'fireworks/accounts/fireworks/models/qwen3-embedding-8b',
  label: 'accounts/fireworks/models/qwen3-embedding-8b',
  modalities: ['text'],
};

const CATALOG: LlmPlatformModelOption[] = [
  OPUS,
  { id: 'cmdc/deepseek/deepseek-v4-pro', label: 'deepseek/deepseek-v4-pro', modalities: ['text'] },
  GEMINI,
  EMBED,
];

function channel(channels: CatalogChannel[], id: string): CatalogChannel {
  const found = channels.find((c) => c.id === id);
  if (!found) throw new Error(`channel ${id} missing`);
  return found;
}

describe('llmCatalog', () => {
  it('splits only on the first slash, so nested model names stay whole', () => {
    expect(splitModelId('cmdc/deepseek/deepseek-v4-pro')).toEqual({
      channel: 'cmdc',
      name: 'deepseek/deepseek-v4-pro',
    });
    expect(splitModelId('gpt-5.5')).toEqual({ channel: '', name: 'gpt-5.5' });
  });

  it('lists every channel, unfit ones last and still showing their models', () => {
    const channels = groupCatalog(CATALOG, 'embedding');
    expect(channels.map((c) => c.id)).toEqual(['fireworks', 'antigravity', 'cmdc', 'kiro']);
    const kiro = channel(channels, 'kiro');
    expect(kiro.selectable).toBe(0);
    expect(kiro.entries[0]?.unfit).toBe('不是向量模型');
  });

  it('keeps a saved id the catalog no longer has, in its own channel', () => {
    const stale = 'compat/accounts/fireworks/models/qwen3-embedding-8b';
    const channels = groupCatalog(CATALOG, 'embedding', [stale, null]);
    const compat = channel(channels, 'compat');
    expect(compat.entries).toHaveLength(1);
    expect(compat.entries[0]).toMatchObject({ id: stale, model: null, unfit: null });
    expect(compat.selectable).toBe(1);
  });

  it('does not duplicate a saved id that differs from the catalog only by case', () => {
    const channels = groupCatalog(CATALOG, 'chat', ['KIRO/Claude-Opus-5']);
    expect(channel(channels, 'kiro').entries).toHaveLength(1);
    expect(channels.some((c) => c.id === 'KIRO')).toBe(false);
  });

  it('mirrors the server purpose rules', () => {
    expect(unfitReason('chat', OPUS)).toBeNull();
    expect(unfitReason('chat', EMBED)).toBe('向量模型');
    expect(unfitReason('vision', OPUS)).toBe('目录未标记识图能力');
    expect(unfitReason('vision', GEMINI)).toBeNull();
    expect(unfitReason('ranking', OPUS)).toBe('不是重排模型');
  });

  it('search matches the channel or the model name', () => {
    const kiro = channel(groupCatalog(CATALOG, 'chat'), 'kiro');
    const entry = kiro.entries[0]!;
    expect(entryMatches(kiro, entry, 'KIRO')).toBe(true);
    expect(entryMatches(kiro, entry, 'opus')).toBe(true);
    expect(entryMatches(kiro, entry, 'gemini')).toBe(false);
  });
});
