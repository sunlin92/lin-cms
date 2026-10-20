import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentTokensPage } from '../AgentTokensPage'

const listMock = vi.fn()
const createMock = vi.fn()
const availableMock = vi.fn()
const revokeMock = vi.fn()

vi.mock('@/lib/api/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent')>()
  return {
    ...actual,
    listAgentTokens: (...a: unknown[]) => listMock(...a),
    createAgentToken: (...a: unknown[]) => createMock(...a),
    listAvailableContentTypes: (...a: unknown[]) => availableMock(...a),
    revokeAgentToken: (...a: unknown[]) => revokeMock(...a),
  }
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentTokensPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listMock.mockReset()
  createMock.mockReset()
  revokeMock.mockReset()
  availableMock.mockReset()
  availableMock.mockResolvedValue([
    {
      id: 1,
      key: 'note',
      name: '笔记',
      description: null,
      ops: ['read', 'create'],
      field_count: 2,
      fields: [],
    },
  ])
})

describe('AgentTokensPage', () => {
  it('创建流程：名称/TTL/scope 提交载荷正确', async () => {
    listMock.mockResolvedValue([])
    createMock.mockResolvedValueOnce({
      token_id: 9,
      token: 'lin_agent_abcd1234_secret-value',
      prefix: 'abcd1234',
      expires_at: '2027-01-01T00:00:00',
      scope: [],
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /新建 Token/ }))
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: '我的助手' } })
    await waitFor(() => screen.getByText('笔记'))
    fireEvent.click(screen.getByLabelText('笔记-read'))
    fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    const payload = createMock.mock.calls[0]?.[0] as {
      name: string
      ttl_days?: number
      scope: Array<{ content_type_id: number; ops: string[] }>
    }
    expect(payload.name).toBe('我的助手')
    expect(payload.scope).toEqual([{ content_type_id: 1, ops: ['read'] }])
    // 一次性明文出现
    await waitFor(() => screen.getByText('lin_agent_abcd1234_secret-value'))
  })

  it('关闭明文对话框后列表无明文（一次性语义）', async () => {
    listMock.mockResolvedValue([
      {
        id: 9,
        name: '旧token',
        prefix: 'abcd1234',
        expires_at: '2027-01-01T00:00:00',
        last_used_at: null,
        revoked_at: null,
        create_time: null,
        scope: [{ content_type_id: 1, content_type_key: 'note', ops: ['read'] }],
      },
    ])
    createMock.mockResolvedValueOnce({
      token_id: 10,
      token: 'lin_agent_deadbeef_once-only',
      prefix: 'deadbeef',
      expires_at: '2027-01-01T00:00:00',
      scope: [],
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /新建 Token/ }))
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: 't' } })
    await waitFor(() => screen.getByText('笔记'))
    fireEvent.click(screen.getByLabelText('笔记-read'))
    fireEvent.click(screen.getByRole('button', { name: /^创建$/ }))
    await waitFor(() => screen.getByText('lin_agent_deadbeef_once-only'))
    fireEvent.click(screen.getByRole('button', { name: /我已保存，关闭/ }))
    await waitFor(() => screen.getByText('旧token'))
    expect(screen.queryByText('lin_agent_deadbeef_once-only')).toBeNull()
    expect(listMock).toHaveBeenCalled()
  })

  it('吊销需确认且列表刷新', async () => {
    listMock.mockResolvedValue([
      {
        id: 9,
        name: '旧token',
        prefix: 'abcd1234',
        expires_at: '2027-01-01T00:00:00',
        last_used_at: null,
        revoked_at: null,
        create_time: null,
        scope: [],
      },
    ])
    revokeMock.mockResolvedValueOnce({ message: 'ok', code: 0, request: '' })
    renderPage()
    await waitFor(() => screen.getByText('旧token'))
    fireEvent.click(screen.getByRole('button', { name: /吊销/ }))
    fireEvent.click(screen.getByRole('button', { name: /确认吊销/ }))
    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith(9))
  })
})
