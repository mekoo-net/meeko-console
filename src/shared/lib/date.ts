import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.locale('zh-cn');

export type DateInput = string | number | Date | null | undefined;

/** 把后端 *UtcDateTime* 字符串/Date 转成本地时区可读字符串（默认精确到分）。 */
export function formatDateTime(input: DateInput, pattern = 'YYYY-MM-DD HH:mm'): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = dayjs.utc(input).local();
  return d.isValid() ? d.format(pattern) : '—';
}

export function formatDate(input: DateInput): string {
  return formatDateTime(input, 'YYYY-MM-DD');
}

export function fromNow(input: DateInput): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = dayjs.utc(input).local();
  return d.isValid() ? d.fromNow() : '—';
}

/**
 * Date → 本地壁钟字符串（无时区后缀），供 el-date-picker
 * `value-format="YYYY-MM-DDTHH:mm:ss"` 使用。
 *
 * 与 `toISOString()`（UTC）不同：这里输出本地时区的年月日时分秒，
 * 这样选择器展示的就是用户所在时区的时间，`Date.parse` 也会按本地时区
 * 解析回正确的绝对时刻（epoch）。
 */
export function toLocalDateTimeValue(input: Date): string {
  return dayjs(input).format('YYYY-MM-DDTHH:mm:ss');
}

export function startOfMonth(): Date {
  return dayjs().startOf('month').toDate();
}

export function endOfMonth(): Date {
  return dayjs().endOf('month').toDate();
}
