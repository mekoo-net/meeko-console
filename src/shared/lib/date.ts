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

export function startOfMonth(): Date {
  return dayjs().startOf('month').toDate();
}

export function endOfMonth(): Date {
  return dayjs().endOf('month').toDate();
}
