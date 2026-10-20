import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, get, post, setUnauthorizedHandler } from '@/lib/api/client'
import { getAccessToken, getRefreshToken, saveTokens } from '@/lib/auth/tokens'
import { useAuthStore } from '@/stores/auth'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('client 信封成功判定', () => {
  it('2xx 且信封 code=0 时返回整个 body（含信封字段）', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        code: 0,
        message: '登录成功',
        request: 'POST cms/user/login',
        access_token: 'a-token',
        refresh_token: 'r-token',
      }),
    )
    const result = await post<{ code: number; access_token: string }>('cms/user/login', {
      username: 'admin',
      password: 'secret',
    })
    expect(result.code).toBe(0)
    expect(result.access_token).toBe('a-token')
  })

  it('2xx 且信封 code=12（<9998）同样视为成功', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { code: 12, message: '新建图书成功', request: 'POST v1/book' }),
    )
    const result = await post<{ code: number }>('v1/book', { title: 't' })
    expect(result.code).toBe(12)
  })

  it('2xx 无信封（无 code 字段）时直接返回 body JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'ok', version: '0.0.1' }))
    const result = await get<{ status: string }>('/health')
    expect(result.status).toBe('ok')
  })
})

describe('client 错误映射', () => {
  it('非 2xx 抛出 ApiError，映射 status/code/message/request', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { code: 10030, message: '参数错误', request: 'POST cms/user/register' }),
    )
    const error = await post('cms/user/register', {}).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(400)
    expect(apiError.code).toBe(10030)
    expect(apiError.message).toBe('参数错误')
    expect(apiError.request).toBe('POST cms/user/register')
  })

  it('message 为数组/对象时递归提取第一个字符串', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        code: 10030,
        message: { email: ['邮箱格式不正确'], username: ['用户名已注册'] },
        request: 'POST cms/user/register',
      }),
    )
    const error = (await post('cms/user/register', {}).catch(
      (caught: unknown) => caught,
    )) as ApiError
    expect(error.message).toBe('邮箱格式不正确')
  })

  it('无信封的错误响应 code 回退为 HTTP 状态码', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    const error = (await get('v1/book/999').catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(404)
    expect(error.code).toBe(404)
  })
})

describe('client 请求构造', () => {
  it('自动附带归一化的 Authorization 头', async () => {
    saveTokens('plain-access', 'plain-refresh')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { username: 'admin' }))
    await get('cms/user/information')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer plain-access')
  })

  it('params 序列化到查询串并忽略空值', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [], count: 0, page: 0, total: 0, total_page: 0 }),
    )
    await get('cms/admin/users', { page: 0, count: 5, group_id: undefined, name: '' })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url.endsWith('/cms/admin/users?page=0&count=5')).toBe(true)
  })

  it('POST json 自动设置 Content-Type 并序列化 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { code: 0, message: 'ok', request: 'x' }))
    await post('cms/user/login', { username: 'admin', password: 'secret' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ username: 'admin', password: 'secret' })
  })
})

describe('client 401 刷新重放', () => {
  it('code 10051 触发刷新，成功后携带新 token 重放原请求', async () => {
    saveTokens('old-access', 'old-refresh')
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, {
          code: 10051,
          message: '令牌过期',
          request: 'GET cms/user/information',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'new-access', refresh_token: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { username: 'admin' }))

    const result = await get<{ username: string }>('cms/user/information')

    expect(result.username).toBe('admin')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const refreshUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(refreshUrl.endsWith('/cms/user/refresh')).toBe(true)
    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(new Headers(refreshInit.headers).get('Authorization')).toBe('Bearer old-refresh')
    const replayInit = fetchMock.mock.calls[2]?.[1] as RequestInit
    expect(new Headers(replayInit.headers).get('Authorization')).toBe('Bearer new-access')
    expect(getAccessToken()).toBe('Bearer new-access')
    expect(getRefreshToken()).toBe('Bearer new-refresh')
  })

  it('刷新失败时清空 token 与 auth store 并触发跳转，抛出原始错误', async () => {
    let redirected = false
    setUnauthorizedHandler(() => {
      redirected = true
    })
    useAuthStore.getState().setUserAndState({
      user: { id: 1, username: 'admin', nickname: '管理员', email: '', avatar: '' },
      admin: false,
      permissions: ['查询日志'],
    })
    saveTokens('access', 'refresh')
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, {
          code: 10041,
          message: '令牌损坏',
          request: 'GET cms/user/information',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          code: 10042,
          message: 'refresh token 无效',
          request: 'GET cms/user/refresh',
        }),
      )

    const error = (await get('cms/user/information').catch((caught: unknown) => caught)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(10041)
    expect(getAccessToken()).toBe('')
    expect(getRefreshToken()).toBe('')
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().permissions).toEqual([])
    expect(redirected).toBe(true)
  })

  it('并发请求共享同一次刷新（模块级单飞）', async () => {
    saveTokens('access', 'refresh')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 10051, message: '过期', request: 'a' }))
      .mockResolvedValueOnce(jsonResponse(401, { code: 10051, message: '过期', request: 'b' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'shared-a', refresh_token: 'shared-r' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { value: 'one' }))
      .mockResolvedValueOnce(jsonResponse(200, { value: 'two' }))

    const [first, second] = await Promise.all([
      get<{ value: string }>('cms/first'),
      get<{ value: string }>('cms/second'),
    ])

    expect(first.value).toBe('one')
    expect(second.value).toBe('two')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/cms/user/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })
})
