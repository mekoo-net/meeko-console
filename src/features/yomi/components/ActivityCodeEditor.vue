<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

/**
 * 正文 HTML 的代码框：等宽、带行号、Tab 缩进、Ctrl/⌘+S 保存。
 * 没引入 CodeMirror 之类的编辑器依赖——内容主要是粘贴 AI 的产出再微调，够用。
 */
const model = defineModel<string>({ required: true });

defineProps<{ placeholder?: string }>();

const emit = defineEmits<{ save: [] }>();

const textarea = ref<HTMLTextAreaElement>();
const gutter = ref<HTMLElement>();

const lineNumbers = computed(() => {
  const count = model.value.split('\n').length;
  return Array.from({ length: count }, (_, i) => i + 1).join('\n');
});

function syncScroll(): void {
  if (gutter.value && textarea.value) gutter.value.scrollTop = textarea.value.scrollTop;
}

function insert(text: string): void {
  const el = textarea.value;
  if (!el) {
    model.value += text;
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  model.value = model.value.slice(0, start) + text + model.value.slice(end);
  void nextTick(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + text.length;
  });
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    emit('save');
    return;
  }
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    insert('  ');
  }
}

defineExpose({ insert });
</script>

<template>
  <div class="code-editor">
    <pre
      ref="gutter"
      class="code-editor__gutter"
      aria-hidden="true"
    >{{ lineNumbers }}</pre>
    <textarea
      ref="textarea"
      v-model="model"
      class="code-editor__input"
      spellcheck="false"
      wrap="off"
      autocomplete="off"
      :placeholder="placeholder"
      @scroll="syncScroll"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped>
.code-editor {
  --code-font: var(--el-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  display: flex;
  height: 100%;
  min-height: 0;
  background: #1e1b2e;
  color: #e8e2f4;
}
.code-editor__gutter,
.code-editor__input {
  margin: 0;
  padding: 12px 0;
  font-family: var(--code-font);
  font-size: 13px;
  line-height: 20px;
}
.code-editor__gutter {
  flex-shrink: 0;
  min-width: 48px;
  padding-right: 10px;
  overflow: hidden;
  text-align: right;
  color: #6f6890;
  background: #18162a;
  user-select: none;
}
.code-editor__input {
  flex: 1;
  min-width: 0;
  padding-left: 12px;
  padding-right: 12px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}
.code-editor__input::placeholder {
  color: #6f6890;
}
</style>
