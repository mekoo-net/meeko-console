/**
 * 角色卡的预设、描写、额外描述，世界线商品的叙事和设定，在控制台里都按「条目」显示：
 * 标题一行，点开看正文，和客户端里一样分条。这里把几种来源收成同一种条目。
 */
import {
  ActivationModeLabel,
  WorldBookAudienceLabel,
  WorldBookScopeLabel,
  WorldBookTriggerLabel,
  type Preset,
  type PromptEntry,
  type WorldBookEntry,
  type WorldBookLore,
  type WorldBookNode,
} from './content.types';
import type { NarrativeEntry } from './market.types';

export interface EntryTag {
  label: string;
  type: 'info' | 'success' | 'warning';
}

export interface EntryItem {
  key: string;
  title: string;
  tags: EntryTag[];
  /** 描写条目、设定的触发词。 */
  keywords: string[];
  /** 正文上面的一行说明，如设定的生效条件。 */
  note?: string;
  content: string;
}

/** 预设、额外描述：名字和正文。 */
export function promptItems(entries: readonly PromptEntry[]): EntryItem[] {
  return entries.map((e) => ({ key: e.id, title: e.name, tags: [], keywords: [], content: e.content }));
}

/** 描写条目（worldBook）：标出作用域（全局 / 角色专属）、触发方式，停用的也标出来。 */
export function worldBookItems(entries: readonly WorldBookEntry[]): EntryItem[] {
  return entries.map((e, i) => ({
    key: `${i}:${e.title}`,
    title: e.title || e.keywords.join('、'),
    tags: [
      ...(e.scope ? [{ label: WorldBookScopeLabel[e.scope], type: 'info' as const }] : []),
      { label: WorldBookTriggerLabel[e.trigger], type: e.trigger === 'constant' ? ('success' as const) : ('info' as const) },
      ...(e.enabled ? [] : [{ label: '已停用', type: 'warning' as const }]),
    ],
    keywords: e.keywords,
    content: e.content,
  }));
}

/** 市场卡的预设是一份酒馆式的 preset：认得的字段按字段分条，其余文本字段用原名。 */
const PRESET_FIELD_LABEL: Readonly<Record<string, string>> = {
  systemPrompt: '系统提示词',
  description: '角色描述',
  personality: '性格',
  scenario: '场景',
  exampleDialogue: '对话示例',
  postHistoryInstructions: '对话后指令',
};

export function presetItems(preset: Preset): EntryItem[] {
  return Object.entries(preset).flatMap(([field, value]) => {
    const content = typeof value === 'string' ? value : Array.isArray(value) ? value.filter((v) => typeof v === 'string').join('\n') : '';
    return content.trim()
      ? [{ key: field, title: PRESET_FIELD_LABEL[field] ?? field, tags: [], keywords: [], content }]
      : [];
  });
}

/** 世界的叙事：名字和正文，顺序就是拼进系统提示的顺序。 */
export function narrativeItems(entries: readonly NarrativeEntry[]): EntryItem[] {
  return entries.map((e, i) => ({ key: String(i), title: e.name, tags: [], keywords: [], content: e.content }));
}

/** 世界书（节点树）里的设定：分组只当标签，标出所在分组、触发方式、谁看得见；有生效条件的写在正文上面。 */
export function worldBookNodeItems(nodes: readonly WorldBookNode[]): EntryItem[] {
  const groups = new Map(nodes.filter((n) => n.type === 'group').map((n) => [n.id, n.title || n.id]));
  return nodes
    .filter((n): n is WorldBookLore => n.type === 'lore')
    .map((n) => {
      const group = n.parent ? groups.get(n.parent) : undefined;
      return {
        key: n.id,
        title: n.title || n.id,
        tags: [
          ...(group ? [{ label: group, type: 'info' as const }] : []),
          { label: ActivationModeLabel[n.activation.mode], type: n.activation.mode === 'always' ? ('success' as const) : ('info' as const) },
          ...(n.audience === 'all' ? [] : [{ label: WorldBookAudienceLabel[n.audience], type: 'warning' as const }]),
          ...(n.enabled ? [] : [{ label: '已停用', type: 'warning' as const }]),
        ],
        keywords: n.activation.keywords,
        note: n.when ? `生效条件：${n.when}` : undefined,
        content: n.content ?? '',
      };
    });
}
