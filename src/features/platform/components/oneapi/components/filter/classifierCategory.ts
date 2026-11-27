import type { Component } from 'vue';
import { ChatDotRound, CollectionTag, Cpu, Monitor, QuestionFilled, Service } from '@element-plus/icons-vue';

/**
 * 分类器 id 的第一级（`chat.tavern` 的 `chat`）在页面上的样子：一个颜色、一个图标、一个短名。
 * 只是给人认的，类别本身是运营随手写的字符串，这里没列到的一律灰色。
 */
export interface CategoryLook {
  key: string;
  label: string;
  color: string;
  icon: Component;
}

const KNOWN: Readonly<Record<string, Omit<CategoryLook, 'key'>>> = {
  chat: { label: 'Chat', color: '#2563eb', icon: ChatDotRound },
  agent: { label: 'Agent', color: '#7c3aed', icon: Cpu },
  sdk: { label: 'SDK', color: '#0d9488', icon: Monitor },
  bot: { label: 'Bot', color: '#ea580c', icon: Service },
  unknown: { label: 'Unknown', color: '#64748b', icon: QuestionFilled },
};

const OTHER: Omit<CategoryLook, 'key'> = { label: '', color: '#64748b', icon: CollectionTag };

export const categoryOf = (classifierId: string): string => classifierId.split('.')[0] ?? classifierId;

export function lookOfCategory(key: string): CategoryLook {
  const known = KNOWN[key] ?? OTHER;
  return { key, ...known, label: known.label || key };
}

export const categoryLook = (classifierId: string): CategoryLook => lookOfCategory(categoryOf(classifierId));
