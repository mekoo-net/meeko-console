/**
 * 角色的人设和世界书，在控制台里都按「条目」显示：标题一行，点开看正文，和客户端里玩家看到的一样分条。
 * 这里把几种来源收成同一种条目。
 */
import {
  WorldBookScopeLabel,
  WorldBookTriggerLabel,
  type Preset,
  type PromptEntry,
  type WorldBookEntry,
} from './content.types';

export interface EntryTag {
  label: string;
  type: 'info' | 'success' | 'warning';
}

export interface EntryItem {
  key: string;
  title: string;
  tags: EntryTag[];
  /** 世界书条目的触发词。 */
  keywords: string[];
  content: string;
}

/** 预设、额外描述：名字和正文。 */
export function promptItems(entries: readonly PromptEntry[]): EntryItem[] {
  return entries.map((e) => ({ key: e.id, title: e.name, tags: [], keywords: [], content: e.content }));
}

/** 世界书条目：标出作用域（全局 / 指定角色）、触发方式，停用的也标出来。 */
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

/** 市场卡的人设是一份酒馆式的 preset：认得的字段按字段分条，其余文本字段用原名。 */
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
