export interface HighlightSegment {
  text: string
  hit: boolean
}

/**
 * 将 message 按 keyword（大小写不敏感）切分为命中/未命中的交替片段。
 * keyword 为空（或全空白）时返回整段未命中，便于直接渲染。
 */
export function splitHighlight(message: string, keyword: string): HighlightSegment[] {
  const trimmed = keyword.trim()
  if (!trimmed) return [{ text: message, hit: false }]
  if (!message) return []

  const lowerMessage = message.toLowerCase()
  const lowerKeyword = trimmed.toLowerCase()
  const segments: HighlightSegment[] = []
  let cursor = 0
  let index = lowerMessage.indexOf(lowerKeyword, cursor)
  while (index !== -1) {
    if (index > cursor) {
      segments.push({ text: message.slice(cursor, index), hit: false })
    }
    segments.push({ text: message.slice(index, index + trimmed.length), hit: true })
    cursor = index + trimmed.length
    index = lowerMessage.indexOf(lowerKeyword, cursor)
  }
  if (cursor < message.length) {
    segments.push({ text: message.slice(cursor), hit: false })
  }
  return segments
}

/** 日期（YYYY-MM-DD）拼接为当天起始时刻；空值原样返回空串 */
export function toRangeStart(date: string): string {
  const trimmed = date.trim()
  return trimmed ? `${trimmed} 00:00:00` : ''
}

/** 日期（YYYY-MM-DD）拼接为当天结束时刻；空值原样返回空串 */
export function toRangeEnd(date: string): string {
  const trimmed = date.trim()
  return trimmed ? `${trimmed} 23:59:59` : ''
}
