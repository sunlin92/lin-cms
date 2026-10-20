import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAuthStorage,
  getAccessToken,
  getRefreshToken,
  normalizeStoredToken,
  saveAccessToken,
  saveTokens,
} from '@/lib/auth/tokens'

describe('normalizeStoredToken', () => {
  it('为裸 token 补充 Bearer 前缀', () => {
    expect(normalizeStoredToken('abc.def.ghi')).toBe('Bearer abc.def.ghi')
  })

  it('保留已有的 Bearer 前缀不重复添加', () => {
    expect(normalizeStoredToken('Bearer abc')).toBe('Bearer abc')
  })

  it('裁剪首尾空白后再归一', () => {
    expect(normalizeStoredToken('  abc  ')).toBe('Bearer abc')
    expect(normalizeStoredToken('  Bearer abc  ')).toBe('Bearer abc')
  })

  it('空字符串与空白归一为空串', () => {
    expect(normalizeStoredToken('')).toBe('')
    expect(normalizeStoredToken('   ')).toBe('')
  })

  it('非字符串输入归一为空串', () => {
    expect(normalizeStoredToken(null)).toBe('')
    expect(normalizeStoredToken(undefined)).toBe('')
    expect(normalizeStoredToken(123)).toBe('')
  })

  it('纯 "Bearer" 前缀（无 token 体）归一为空串', () => {
    expect(normalizeStoredToken('Bearer')).toBe('')
    expect(normalizeStoredToken('Bearer ')).toBe('')
  })
})

describe('token 存取', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saveTokens 写入后读取为归一形式', () => {
    saveTokens('raw-access', 'Bearer raw-refresh')
    expect(getAccessToken()).toBe('Bearer raw-access')
    expect(getRefreshToken()).toBe('Bearer raw-refresh')
    expect(window.localStorage.getItem('lin-cms:access-token')).toBe('Bearer raw-access')
    expect(window.localStorage.getItem('lin-cms:refresh-token')).toBe('Bearer raw-refresh')
  })

  it('saveAccessToken 仅更新 access token', () => {
    saveTokens('old-access', 'old-refresh')
    saveAccessToken('new-access')
    expect(getAccessToken()).toBe('Bearer new-access')
    expect(getRefreshToken()).toBe('Bearer old-refresh')
  })

  it('clearAuthStorage 清空全部 token', () => {
    saveTokens('a', 'r')
    clearAuthStorage()
    expect(getAccessToken()).toBe('')
    expect(getRefreshToken()).toBe('')
    expect(window.localStorage.getItem('lin-cms:access-token')).toBeNull()
    expect(window.localStorage.getItem('lin-cms:refresh-token')).toBeNull()
  })
})
