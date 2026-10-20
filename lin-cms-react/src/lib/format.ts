import { format, isValid, parseISO } from 'date-fns'

function parseDateValue(value: string): Date | null {
  const parsed = parseISO(value)
  if (isValid(parsed)) return parsed
  const fallback = new Date(value)
  return isValid(fallback) ? fallback : null
}

/** 输出 "yyyy-MM-dd HH:mm:ss"；无法解析时原样返回 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseDateValue(value)
  return date ? format(date, 'yyyy-MM-dd HH:mm:ss') : value
}

/** 输出 "yyyy-MM-dd"；无法解析时原样返回 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseDateValue(value)
  return date ? format(date, 'yyyy-MM-dd') : value
}
