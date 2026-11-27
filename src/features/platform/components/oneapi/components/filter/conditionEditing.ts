import {
  conditionSources,
  opNeedsValue,
  opTakesMany,
  sourceOf,
  type ConditionGroup,
  type ConditionNode,
  type ConditionRow,
  type ConditionSource,
} from '../../model/filter';
import type { FilterClassifier, FilterSchema } from '../../model/filter.types';

/** 「来源」下拉框里引用分类器的那一项（只有过滤规则有）。 */
export const CLASSIFIER_SOURCE = 'classifier';

/** 组最多套几层（最外面那组是第 0 层）。再深人就看不懂了，真要写可以切 JSON。 */
export const MAX_DEPTH = 2;

/**
 * 条件编辑器各层共用的东西：选项从网关报的字段来，怎么新建一行、怎么改一行。
 * 改树都走这里（而不是在递归的组件里直接改 props），组件只管画。
 */
export interface EditorContext {
  /** 来源下拉框：分类器（过滤规则才有）、请求头、提示词、工具……。 */
  sources: { key: string; label: string }[];
  levelsOf(source: string): ConditionSource['levels'];
  classifiers: readonly FilterClassifier[];
  kindOf(field: string): string;
  operatorsOf(field: string): string[];
  sourceOfRow(row: ConditionRow): string;
  newRow(): ConditionRow;
  newGroup(): ConditionGroup;
  rowFor(source: string, negate?: boolean): ConditionRow;
  rowForField(field: string, negate?: boolean): ConditionRow;
  patch(node: ConditionNode, change: Record<string, unknown>): void;
  setOp(row: ConditionRow, op: string): void;
  replace(group: ConditionGroup, index: number, node: ConditionNode): void;
  add(group: ConditionGroup, node: ConditionNode): void;
  removeAt(group: ConditionGroup, index: number): void;
}

export function createEditorContext(
  schema: FilterSchema,
  classifiers: readonly FilterClassifier[] | null,
): EditorContext {
  const fieldSources = conditionSources(schema.fields);
  const canReference = classifiers !== null;

  const kindOf = (field: string): string => schema.fields.find((f) => f.name === field)?.kind ?? 'text';
  const operatorsOf = (field: string): string[] => schema.operators[kindOf(field)] ?? [];
  const levelsOf = (source: string) => fieldSources.find((s) => s.key === source)?.levels ?? [];

  /** 请求头多半按开头认（UA），提示词按包含认，工具名按「包含任一」，数量按「至少」。 */
  function defaultOp(field: string): string {
    const kind = kindOf(field);
    const preferred =
      kind === 'number' ? 'gte' : kind === 'set' ? 'contains_any' : sourceOf(field) === 'header' ? 'prefix' : 'contains';
    const ops = operatorsOf(field);
    return ops.includes(preferred) ? preferred : (ops[0] ?? '');
  }

  const rowForField = (field: string, negate = false): ConditionRow => ({
    kind: 'field',
    negate,
    field,
    op: defaultOp(field),
    values: [],
    numeric: kindOf(field) === 'number',
    ignoreCase: false,
  });

  const rowFor = (source: string, negate = false): ConditionRow =>
    source === CLASSIFIER_SOURCE
      ? { kind: 'classifier', negate, classifiers: [] }
      : rowForField(levelsOf(source)[0]?.field ?? '', negate);

  const newRow = (): ConditionRow =>
    // 过滤规则多半是「是不是某一类」，先给分类器
    canReference ? rowFor(CLASSIFIER_SOURCE) : rowFor(fieldSources[0]?.key ?? 'header');

  return {
    sources: [
      ...(canReference ? [{ key: CLASSIFIER_SOURCE, label: '分类器' }] : []),
      ...fieldSources.map((s) => ({ key: s.key, label: s.label })),
    ],
    levelsOf,
    classifiers: classifiers ?? [],
    kindOf,
    operatorsOf,
    sourceOfRow: (row) => (row.kind === 'classifier' ? CLASSIFIER_SOURCE : sourceOf(row.field)),
    newRow,
    newGroup: () => ({ kind: 'group', negate: false, mode: 'any', children: [newRow()] }),
    rowFor,
    rowForField,
    patch: (node, change) => Object.assign(node, change),
    /** 换了比法以后，值的个数跟着收：正则、数字只留一个，`有值` 不留。 */
    setOp(row, op) {
      if (row.kind !== 'field') return;
      row.op = op;
      if (!opNeedsValue(op)) row.values = [];
      else if (!opTakesMany(op, row.numeric)) row.values = row.values.slice(0, 1);
    },
    replace: (group, index, node) => void group.children.splice(index, 1, node),
    add: (group, node) => void group.children.push(node),
    removeAt: (group, index) => void group.children.splice(index, 1),
  };
}
