const ACCESS_TOKEN_KEY = 'lin-cms:access-token'
const REFRESH_TOKEN_KEY = 'lin-cms:refresh-token'
const BEARER_PREFIX = 'Bearer '

/**
 * 归一化存储的 token：始终带 "Bearer " 前缀。
 * 空值 / 纯 "Bearer" / 非字符串一律归一为空串。
 */
export function normalizeStoredToken(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'Bearer') return ''
  return trimmed.startsWith(BEARER_PREFIX) ? trimmed : `${BEARER_PREFIX}${trimmed}`
}

function readToken(key: string): string {
  return normalizeStoredToken(window.localStorage.getItem(key))
}

/** 读取 access token（已归一为 "Bearer xxx" 形式；未登录返回空串） */
export function getAccessToken(): string {
  return readToken(ACCESS_TOKEN_KEY)
}

/** 读取 refresh token（已归一为 "Bearer xxx" 形式；未登录返回空串） */
export function getRefreshToken(): string {
  return readToken(REFRESH_TOKEN_KEY)
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, normalizeStoredToken(accessToken))
  window.localStorage.setItem(REFRESH_TOKEN_KEY, normalizeStoredToken(refreshToken))
}

export function saveAccessToken(accessToken: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, normalizeStoredToken(accessToken))
}

export function clearAuthStorage(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
}
