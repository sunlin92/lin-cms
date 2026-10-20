import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupContentPermissionPage } from '../GroupContentPermissionPage'

const grantsMock = vi.fn()
const replaceMock = vi.fn()
const typesMock = vi.fn()

vi.mock('@/lib/api/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent')>()
  return {
    ...actual,
    getGroupContentPermissions: (...args: unknown[]) => grantsMock(...args),
    replaceGroupContentPermissions: (...args: unknown[]) => replaceMock(...args),
    listAdminContentTypes: (...args: unknown[]) => typesMock(...args),
  }
})

function renderPage(groupId = 7) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/groups/${groupId}/content-permissions`]}>
        <Routes>
          <Route
            path="/admin/groups/:groupId/content-permissions"
            element={<GroupContentPermissionPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  grantsMock.mockReset()
  replaceMock.mockReset()
  typesMock.mockReset()
  typesMock.mockResolvedValue({
    items: [
      {
        id: 1,
        key: 'note',
        name: '笔记',
        status: 'active',
        field_count: 2,
        record_count: 0,
        description: null,
        update_time: null,
      },
      {
        id: 2,
        key: 'task',
        name: '任务',
        status: 'active',
        field_count: 3,
        record_count: 0,
        description: null,
        update_time: null,
      },
    ],
    page: 0,
    count: 2,
    total: 2,
    total_page: 1,
  })
})

describe('GroupContentPermissionPage', () => {
  it('加载已有授权渲染勾选态，取消勾选保存只发剩余项', async () => {
    grantsMock.mockResolvedValueOnce({
      entries: [
        {
          content_type_id: 1,
          can_read: true,
          can_create: true,
          can_update: false,
          can_delete: false,
        },
        {
          content_type_id: 2,
          can_read: true,
          can_create: false,
          can_update: false,
          can_delete: false,
        },
      ],
    })
    replaceMock.mockResolvedValueOnce({ message: 'ok', code: 0, request: '' })
    renderPage()
    await waitFor(() => screen.getByText('笔记'))
    // note 的 读+建 勾选、task 的 读 勾选（等待授权数据应用）
    await waitFor(() =>
      expect((screen.getByLabelText('笔记-读') as HTMLInputElement).checked).toBe(true),
    )
    expect((screen.getByLabelText('笔记-建') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('任务-读') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('任务-删') as HTMLInputElement).checked).toBe(false)
    // 取消 任务-读 后保存 → PUT 只剩 note 条目
    fireEvent.click(screen.getByLabelText('任务-读'))
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() => expect(replaceMock).toHaveBeenCalled())
    expect(replaceMock.mock.calls[0]?.[0]).toBe(7)
    const entries = replaceMock.mock.calls[0]?.[1] as Array<{
      content_type_id: number
      can_read: boolean
    }>
    expect(entries).toHaveLength(1)
    expect(entries[0]?.content_type_id).toBe(1)
  })

  it('空矩阵空状态文案', async () => {
    typesMock.mockResolvedValue({ items: [], page: 0, count: 0, total: 0, total_page: 0 })
    grantsMock.mockResolvedValueOnce({ entries: [] })
    renderPage()
    await waitFor(() => screen.getByText(/还没有内容类型/))
  })

  it('保存失败展示可读错误', async () => {
    grantsMock.mockResolvedValueOnce({ entries: [] })
    replaceMock.mockRejectedValueOnce(new Error('内容类型不存在或已归档：9'))
    renderPage()
    await waitFor(() => screen.getByText('笔记'))
    fireEvent.click(screen.getByLabelText('笔记-读'))
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() => screen.getByText(/内容类型不存在/))
  })
})
