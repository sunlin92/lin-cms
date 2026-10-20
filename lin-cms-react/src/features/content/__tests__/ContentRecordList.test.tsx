import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentRecordListPage } from '../ContentRecordListPage'

const listMock = vi.fn()
const availableMock = vi.fn()
vi.mock('@/lib/api/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent')>()
  return {
    ...actual,
    listContentRecords: (...args: unknown[]) => listMock(...args),
    listAvailableContentTypes: (...args: unknown[]) => availableMock(...args),
  }
})

function renderPage(typeKey: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/content/${typeKey}`]}>
        <Routes>
          <Route path="/content/:typeKey" element={<ContentRecordListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listMock.mockReset()
  availableMock.mockReset()
  availableMock.mockResolvedValue([])
})

describe('ContentRecordListPage', () => {
  it('无可用类型时空状态引导到 Agent 接入页', async () => {
    renderPage('note')
    await waitFor(() => screen.getByText(/还没有可访问的内容类型/))
  })

  it('渲染记录并拼装过滤/排序参数', async () => {
    availableMock.mockResolvedValue([
      {
        id: 1,
        key: 'note',
        name: '笔记',
        description: null,
        ops: ['read', 'create', 'delete'],
        field_count: 2,
        fields: [
          { key: 'title', label: '标题', type: 'text' },
          { key: 'views', label: '阅读数', type: 'number' },
        ],
      },
    ])
    listMock.mockResolvedValue({
      items: [
        { id: 3, title: '甲' },
        { id: 2, title: '乙' },
      ],
      page: 0,
      count: 5,
      total: 2,
      total_page: 1,
      scan_truncated: false,
    })
    renderPage('note')
    await waitFor(() => screen.getByText('甲'))
    expect(listMock.mock.calls[0]?.[0]).toBe('note')
    // 过滤：先从下拉添加筛选字段，再输入过滤值
    fireEvent.change(screen.getByLabelText('添加筛选字段'), { target: { value: 'title' } })
    fireEvent.change(screen.getByLabelText(/过滤 标题/), { target: { value: '甲' } })
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(
        'note',
        expect.objectContaining({ filters: { title: '甲' } }),
      ),
    )
    fireEvent.change(screen.getByLabelText(/排序字段/), { target: { value: 'title' } })
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith('note', expect.objectContaining({ sort: 'title' })),
    )
  })

  it('scan_truncated 提示条出现', async () => {
    availableMock.mockResolvedValue([
      { id: 1, key: 'note', name: '笔记', description: null, ops: ['read'], field_count: 2 },
    ])
    listMock.mockResolvedValue({
      items: [{ id: 1, title: 'x' }],
      page: 0,
      count: 5,
      total: 1,
      total_page: 1,
      scan_truncated: true,
    })
    renderPage('note')
    await waitFor(() => screen.getByText(/结果可能不完整/))
  })
})
