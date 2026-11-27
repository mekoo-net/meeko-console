import {
  conditionSources,
  opNeedsValue,
  opTakesMany,
  sourceOf,
  type ConditionGroup,
  type ConditionNode,
  type ConditionRow,
  type ConditionSource,
  type ConditionTool,
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
  /** 来源下拉框：分类器（过滤规则才有）、请求头、提示词、工具……；在工具对象里面是名称、描述、参数。 */
  sources: { key: string; label: string }[];
  levelsOf(source: string): ConditionSource['levels'];
  classifiers: readonly FilterClassifier[];
  kindOf(field: string): string;
  operatorsOf(field: string): string[];
  sourceOfRow(row: ConditionRow): string;
  newRow(): ConditionRow;
  newGroup(): ConditionGroup;
  /** 新的工具对象；这一层不能加（已经在工具对象里面，或者号池后台不报工具对象的字段）时是 null。 */
  newTool: (() => ConditionTool) | null;
  /** 工具对象里面那一层用的上下文。 */
  toolContext: EditorContext | null;
  rowFor(source: string, negate?: boolean): ConditionRow;
  rowForField(field: string, negate?: boolean): ConditionRow;
  patch(node: ConditionNode, change: Record<string, unknown>): void;
  setOp(row: ConditionRow, op: string): void;
  replace(group: ConditionGroup, index: number, node: ConditionNode): void;
  add(group: ConditionGroup, node: ConditionNode): void;
  removeAt(group: ConditionGroup, index: number): void;
}

interface Scope {
  fields: FilterSchema['fields'];
  operators: FilterSchema['operators'];
  /** null = 这一层不能引用分类器。 */
  classifiers: readonly FilterClassifier[] | null;
  toolContext: EditorContext | null;
  /** 新的一行默认用哪个比法。 */
  preferredOp(field: string, kind: string): string;
}

function make(scope: Scope): EditorContext {
  const fieldSources = conditionSources(scope.fields);
  const canReference = scope.classifiers !== null;

  const kindOf = (field: string): string => scope.fields.find((f) => f.name === field)?.kind ?? 'text';
  const operatorsOf = (field: string): string[] => scope.operators[kindOf(field)] ?? [];
  const levelsOf = (source: string) => fieldSources.find((s) => s.key === source)?.levels ?? [];

  function defaultOp(field: string): string {
    const preferred = scope.preferredOp(field, kindOf(field));
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
    matchCase: false,
  });

  const rowFor = (source: string, negate = false): ConditionRow =>
    source === CLASSIFIER_SOURCE
      ? { kind: 'classifier', negate, classifiers: [] }
      : rowForField(levelsOf(source)[0]?.field ?? '', negate);

  const newRow = (): ConditionRow =>
    // 过滤规则多半是「是不是某一类」，先给分类器
    canReference ? rowFor(CLASSIFIER_SOURCE) : rowFor(fieldSources[0]?.key ?? 'header');

  const toolContext = scope.toolContext;

  return {
    sources: [
      ...(canReference ? [{ key: CLASSIFIER_SOURCE, label: '分类器' }] : []),
      ...fieldSources.map((s) => ({ key: s.key, label: s.label })),
    ],
    levelsOf,
    classifiers: scope.classifiers ?? [],
    kindOf,
    operatorsOf,
    sourceOfRow: (row) => (row.kind === 'classifier' ? CLASSIFIER_SOURCE : sourceOf(row.field)),
    newRow,
    newGroup: () => ({ kind: 'group', negate: false, mode: 'any', children: [newRow()] }),
    newTool: toolContext
      ? () => ({
          kind: 'tool',
          negate: false,
          // 一上来就是「名称 + 描述」两行：只比名字正是要避免的
          group: {
            kind: 'group',
            negate: false,
            mode: 'all',
            children: toolContext.sources.slice(0, 2).map((s) => toolContext.rowFor(s.key)),
          },
        })
      : null,
    toolContext,
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

export function createEditorContext(
  schema: FilterSchema,
  classifiers: readonly FilterClassifier[] | null,
): EditorContext {
  // 工具对象里面：名字按「等于」认，描述按「包含」，参数按「全部包含」
  const toolContext =
    schema.toolFields && schema.toolFields.length > 0
      ? make({
          fields: schema.toolFields,
          operators: schema.operators,
          classifiers: null,
          toolContext: null,
          preferredOp: (field, kind) => (kind === 'set' ? 'contains_all' : field === 'name' ? 'eq' : 'contains'),
        })
      : null;

  return make({
    fields: schema.fields,
    operators: schema.operators,
    classifiers,
    toolContext,
    // 请求头多半按开头认（UA），提示词按包含认，工具名按「包含任一」，数量按「至少」
    preferredOp: (field, kind) =>
      kind === 'number' ? 'gte' : kind === 'set' ? 'contains_any' : sourceOf(field) === 'header' ? 'prefix' : 'contains',
  });
}
