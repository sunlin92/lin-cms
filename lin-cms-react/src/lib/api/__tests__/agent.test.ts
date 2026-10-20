import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentToken,
  createContentType,
  listAgentAudit,
  listAvailableContentTypes,
  listContentRecords,
  revokeAgentToken,
  updateContentRecord,
} from '../agent'
import type { ApiEnvelope } from '../agent-types'
import { ApiError } from '../client'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  localStorage.setItem('lin-cms:access-token', 'Bearer test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('agent api 封装', () => {
  it('列表接口直接返回 DTO 数组', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 1, key: 'product', name: '商品', description: null, ops: ['read'], field_count: 2 },
      ]),
    )
    const items = await listAvailableContentTypes()
    expect(items).toHaveLength(1)
    expect(items[0]?.key).toBe('product')
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.pathname).toBe('/api/v1/content-types/available')
  })

  it('信封接口在 code<9998 时成功返回', async () => {
    const envelope: ApiEnvelope = { message: '成功', code: 0, request: 'POST  /x' }
    fetchMock.mockResolvedValueOnce(jsonResponse(envelope))
    const rv = await createContentType({ name: 'N', fields: [] })
    expect(rv.code).toBe(0)
  })

  it('token 创建返回一次性明文字段', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        token_id: 1,
        token: 'lin_agent_abcd1234_secretsecret',
        prefix: 'abcd1234',
        expires_at: '2027-01-01T00:00:00',
        scope: [],
      }),
    )
    const created = await createAgentToken({
      name: 'n',
      scope: [{ content_type_id: 1, ops: ['read'] }],
    })
    expect(created.token.startsWith('lin_agent_')).toBe(true)
  })

  it('错误信封抛 ApiError 且带业务码', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: '无权执行该内容操作', code: 10310, request: 'GET  /x' }, 403),
    )
    await expect(listContentRecords('denied')).rejects.toBeInstanceOf(ApiError)
  })

  it('内容列表拼装 f_ 过滤与排序参数', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        page: 0,
        count: 5,
        total: 0,
        total_page: 0,
        scan_truncated: false,
      }),
    )
    await listContentRecords('note', { filters: { title: 'hi' }, sort: 'views', order: 'asc' })
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.searchParams.get('f_title')).toBe('hi')
    expect(url.searchParams.get('sort')).toBe('views')
    expect(url.searchParams.get('order')).toBe('asc')
  })

  it('更新走 PATCH 方法', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, title: 'T' }))
    await updateContentRecord('note', 7, { title: 'T' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
  })

  it('吊销与审计查询路径正确', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'ok', code: 0, request: '' }))
    await revokeAgentToken(9)
    expect(new URL(fetchMock.mock.calls[0]?.[0] as string).pathname).toBe('/api/v1/agent-tokens/9')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], page: 0, count: 5, total: 0, total_page: 0 }),
    )
    await listAgentAudit({ action: 'token_auth' })
    const url = new URL(fetchMock.mock.calls[1]?.[0] as string)
    expect(url.pathname).toBe('/api/v1/admin/agent-audit')
    expect(url.searchParams.get('action')).toBe('token_auth')
  })
})
