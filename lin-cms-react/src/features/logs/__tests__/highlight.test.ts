import { describe, expect, it } from 'vitest'
import { splitHighlight, toRangeEnd, toRangeStart } from '@/features/logs/highlight'

describe('splitHighlight', () => {
  it('多次命中时切分为命中/未命中交替片段', () => {
    expect(splitHighlight('用户user删除了图书user', 'user')).toEqual([
      { text: '用户', hit: false },
      { text: 'user', hit: true },
      { text: '删除了图书', hit: false },
      { text: 'user', hit: true },
    ])
  })

  it('关键字大小写不敏感', () => {
    expect(splitHighlight('Book shop sells BOOK', 'book')).toEqual([
      { text: 'Book', hit: true },
      { text: ' shop sells ', hit: false },
      { text: 'BOOK', hit: true },
    ])
  })

  it('空关键字（含纯空白）返回整段未命中', () => {
    expect(splitHighlight('任意内容', '')).toEqual([{ text: '任意内容', hit: false }])
    expect(splitHighlight('任意内容', '   ')).toEqual([{ text: '任意内容', hit: false }])
  })

  it('相邻命中与首尾命中的边界', () => {
    expect(splitHighlight('abab', 'ab')).toEqual([
      { text: 'ab', hit: true },
      { text: 'ab', hit: true },
    ])
    expect(splitHighlight('hit', 'hit')).toEqual([{ text: 'hit', hit: true }])
    expect(splitHighlight('完全不含', 'xyz')).toEqual([{ text: '完全不含', hit: false }])
  })
})

describe('日期范围拼接', () => {
  it('开始日期拼接 00:00:00，空值返回空串', () => {
    expect(toRangeStart('2024-05-01')).toBe('2024-05-01 00:00:00')
    expect(toRangeStart('')).toBe('')
  })

  it('结束日期拼接 23:59:59，空值返回空串', () => {
    expect(toRangeEnd('2024-05-01')).toBe('2024-05-01 23:59:59')
    expect(toRangeEnd('')).toBe('')
  })
})
