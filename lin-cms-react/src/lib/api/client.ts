import { clearAuthStorage, getAccessToken, getRefreshToken, saveTokens } from '@/lib/auth/tokens'
import { useAuthStore } from '@/stores/auth'

/** envelope code < 9998 视为成功 */
const SUCCESS_CODE_MAX = 9998
/** access token 损坏 / 过期 */
const ACCESS_EXPIRED_CODES = new Set([10041, 10051])
const REFRESH_PATH = '/cms/user/refresh'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export type QueryParams = Record<string, unknown>

export interface RequestOptions {
  method?: HttpMethod
  /** JSON 请求体（自动设置 Content-Type: application/json） */
  json?: unknown
  /** URL 查询参数（undefined/null/空串会被忽略） */
  params?: QueryParams
  /** FormData 请求体（不设置 Content-Type，交给浏览器补 boundary） */
  formData?: FormData
  /** 额外请求头（如登录验证码的 tag 头） */
  headers?: Record<string, string>
  signal?: AbortSignal
  /**
   * 是否启用自动错误处理（token 过期时的刷新重放、刷新失败后的登出跳转）。
   * 默认 true；调用方需要自行处理 401 语义时可置为 false。
   */
  handleError?: boolean
}

/** 统一 API 错误：status 为 HTTP 状态码，code 为业务错误码（无信封时等于 status） */
export class ApiError extends Error {
  readonly status: number
  readonly code: number
  readonly request: string

  constructor(params: { status: number; code: number; message: string; request: string }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status
    this.code = params.code
    this.request = params.request
  }
}

/* ------------------------------ 内部工具函数 ------------------------------ */

function getBaseUrl(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL
  return typeof raw === 'string' ? raw.replace(/\/+$/, '') : ''
}

function buildUrl(path: string, params?: QueryParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${getBaseUrl()}${normalizedPath}`
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `${url}?${query}` : url
}

/** 递归提取 message 中第一个非空字符串（后端 message 可能是数组/对象） */
function extractMessage(message: unknown): string {
  if (typeof message === 'string' && message) return message
  if (Array.isArray(message)) {
    for (const item of message) {
      const found = extractMessage(item)
      if (found) return found
    }
    return ''
  }
  if (message !== null && typeof message === 'object') {
    for (const value of Object.values(message as Record<string, unknown>)) {
      const found = extractMessage(value)
      if (found) return found
    }
  }
  return ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/** 是否为信封响应（含 code 字段） */
function hasEnvelope(body: unknown): body is Record<string, unknown> {
  return isPlainObject(body) && 'code' in body
}

function envelopeCode(body: Record<string, unknown>): number {
  return typeof body.code === 'number' ? body.code : Number.NaN
}

function toApiError(status: number, body: unknown, fallbackRequest: string): ApiError {
  const record = isPlainObject(body) ? body : {}
  const message = extractMessage(record.message) || `请求失败（HTTP ${status}）`
  const code = typeof record.code === 'number' ? record.code : status
  const request = typeof record.request === 'string' ? record.request : fallbackRequest
  return new ApiError({ status, code, message, request })
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* --------------------------- 未授权跳转（可注入） --------------------------- */

let unauthorizedHandler: () => void = () => {
  if (typeof window !== 'undefined') window.location.assign('/login')
}

/** 注入未授权（刷新失败）时的跳转回调；测试与路由环境下使用 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

function forceLogout(): void {
  clearAuthStorage()
  useAuthStore.getState().logout()
  unauthorizedHandler()
}

/* ------------------------------ token 刷新单飞 ------------------------------ */

let refreshInFlight: Promise<void> | null = null

/** 刷新 access token；模块级单飞，并发请求只触发一次刷新 */
export function refreshAccessToken(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function doRefresh(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    forceLogout()
    throw new ApiError({
      status: 401,
      code: 10052,
      message: '登录状态已失效，请重新登录',
      request: 'GET cms/user/refresh',
    })
  }
  const response = await fetch(`${getBaseUrl()}${REFRESH_PATH}`, {
    method: 'GET',
    headers: { Authorization: refreshToken },
  })
  const body = await parseBody(response)
  const ok = response.ok && (!hasEnvelope(body) || envelopeCode(body) < SUCCESS_CODE_MAX)
  const tokens = isPlainObject(body) ? body : {}
  if (ok && typeof tokens.access_token === 'string' && typeof tokens.refresh_token === 'string') {
    saveTokens(tokens.access_token, tokens.refresh_token)
    return
  }
  // 刷新失败（含 10000/10042/10050/10052/10012 等错误码）：强制登出
  forceLogout()
  throw toApiError(response.status, body, 'GET cms/user/refresh')
}

/* --------------------------------- 主流程 --------------------------------- */

async function performRequest<T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const method = options.method ?? 'GET'
  const url = buildUrl(path, options.params)
  const headers = new Headers(options.headers)
  const token = getAccessToken()
  if (token) headers.set('Authorization', token)

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  }

  const response = await fetch(url, { method, headers, body, signal: options.signal })
  const responseBody = await parseBody(response)

  const success =
    response.ok && (!hasEnvelope(responseBody) || envelopeCode(responseBody) < SUCCESS_CODE_MAX)
  if (success) {
    return responseBody as T
  }

  const error = toApiError(response.status, responseBody, `${method} ${path}`)
  const isAccessExpired = ACCESS_EXPIRED_CODES.has(error.code)
  const canRefresh = options.handleError !== false && allowRefresh && isAccessExpired

  if (canRefresh) {
    try {
      await refreshAccessToken()
    } catch {
      // 刷新失败已在 doRefresh 中完成登出与跳转；向调用方抛出原始错误
      throw error
    }
    return performRequest<T>(path, options, false)
  }
  throw error
}

/**
 * 核心请求函数。
 * - 2xx 且（无信封或 code < 9998）时返回整个响应 body
 * - 失败抛 ApiError（message 递归取后端 body.message 的第一个字符串）
 * - access token 过期（code 10041/10051）时单飞刷新并重放原请求一次
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return performRequest<T>(path, options, true)
}

/* -------------------------------- 便捷函数 -------------------------------- */

export function get<T>(path: string, params?: QueryParams): Promise<T> {
  return request<T>(path, { method: 'GET', params })
}

export function post<T>(
  path: string,
  json?: unknown,
  options?: Omit<RequestOptions, 'method' | 'json'>,
): Promise<T> {
  return request<T>(path, { ...options, method: 'POST', json })
}

export function put<T>(path: string, json?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', json })
}

export function del<T>(path: string, json?: unknown): Promise<T> {
  return request<T>(path, { method: 'DELETE', json })
}

/** FormData 上传便捷函数 */
export function postForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', formData })
}
