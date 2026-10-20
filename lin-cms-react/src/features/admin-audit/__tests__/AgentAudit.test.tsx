import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentAuditPage } from '../AgentAuditPage'

const auditMock = vi.fn()
vi.mock('@/lib/api/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent')>()
  return { ...actual, listAgentAudit: (...a: unknown[]) => auditMock(...a) }
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentAuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => auditMock.mockReset())

describe('AgentAuditPage', () => {
  it('渲染审计行与结果徽标', async () => {
    auditMock.mockResolvedValue({
      items: [
        {
          id: 1,
          agent_token_id: 3,
          user_id: 2,
          content_type_key: 'note',
          record_id: 7,
          action: 'create_record',
          success: true,
          error_code: null,
          create_time: '2026-10-01T08:00:00',
        },
        {
          id: 2,
          agent_token_id: 3,
          user_id: 2,
          content_type_key: 'note',
          record_id: null,
          action: 'token_auth',
          success: false,
          error_code: 10310,
          create_time: '2026-10-01T08:01:00',
        },
      ],
      page: 0,
      count: 5,
      total: 2,
      total_page: 1,
    })
    renderPage()
    await waitFor(() => screen.getByText('create_record'))
    expect(screen.getByText('token_auth')).toBeTruthy()
    expect(screen.getByText('10310')).toBeTruthy()
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }))
  })

  it('过滤参数拼装', async () => {
    auditMock.mockResolvedValue({ items: [], page: 0, count: 5, total: 0, total_page: 0 })
    renderPage()
    await waitFor(() => screen.getByText(/暂无/))
    fireEvent.change(screen.getByLabelText(/动作/), { target: { value: 'token_auth' } })
    fireEvent.change(screen.getByLabelText(/类型 key/), { target: { value: 'note' } })
    await waitFor(() =>
      expect(auditMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'token_auth', content_type_key: 'note' }),
      ),
    )
  })

  it('空状态', async () => {
    auditMock.mockResolvedValue({ items: [], page: 0, count: 5, total: 0, total_page: 0 })
    renderPage()
    await waitFor(() => screen.getByText(/暂无/))
  })
})
