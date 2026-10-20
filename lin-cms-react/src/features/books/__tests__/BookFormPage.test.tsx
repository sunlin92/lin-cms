import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookFormPage } from '@/features/books/BookFormPage'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { toast } from 'sonner'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

const existingBook = {
  id: 1,
  title: '三体',
  author: '刘慈欣',
  image: 'https://example.com/santi.png',
  summary: '地球文明的兴衰',
}

function renderForm(path: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/book/add" element={<BookFormPage />} />
          <Route path="/book/edit/:id" element={<BookFormPage />} />
          <Route path="/book/list" element={<div>book-list-ready</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fillField(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('BookFormPage', () => {
  it('编辑模式：GET 图书详情并预填表单', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, existingBook))

    renderForm('/book/edit/1')

    await waitFor(() => {
      expect(screen.getByText('编辑图书')).toBeInTheDocument()
      expect((screen.getByLabelText('书名') as HTMLInputElement).value).toBe('三体')
    })
    expect((screen.getByLabelText('作者') as HTMLInputElement).value).toBe('刘慈欣')
    expect((screen.getByLabelText('封面链接') as HTMLInputElement).value).toBe(
      'https://example.com/santi.png',
    )
    expect((screen.getByLabelText('简介') as HTMLTextAreaElement).value).toBe('地球文明的兴衰')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/v1/book/1')).toBe(true)
  })

  it('编辑模式：提交走 PUT，成功后 toast 信封 message 并跳转列表', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, existingBook))
      .mockResolvedValueOnce(
        jsonResponse(200, { code: 13, message: '更新图书成功', request: 'PUT v1/book/1' }),
      )

    renderForm('/book/edit/1')
    await waitFor(() => {
      expect((screen.getByLabelText('书名') as HTMLInputElement).value).toBe('三体')
    })

    fillField('书名', '三体（新版）')
    fireEvent.click(screen.getByRole('button', { name: '保 存' }))

    await waitFor(() => {
      expect(screen.getByText('book-list-ready')).toBeInTheDocument()
    })
    expect(toast.success).toHaveBeenCalledWith('更新图书成功')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putUrl = String(fetchMock.mock.calls[1]?.[0])
    const putInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(putUrl.endsWith('/v1/book/1')).toBe(true)
    expect(putInit.method).toBe('PUT')
    expect(JSON.parse(String(putInit.body))).toEqual({
      title: '三体（新版）',
      author: '刘慈欣',
      image: 'https://example.com/santi.png',
      summary: '地球文明的兴衰',
    })
  })

  it('新增模式：提交走 POST，成功后 toast 信封 message 并跳转列表', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { code: 12, message: '新建图书成功', request: 'POST v1/book' }),
    )

    renderForm('/book/add')

    expect(screen.getByText('新增图书')).toBeInTheDocument()
    fillField('书名', '球状闪电')
    fillField('作者', '刘慈欣')
    fillField('封面链接', 'https://example.com/qzsd.png')
    fillField('简介', '寻找球状闪电的秘密')
    fireEvent.click(screen.getByRole('button', { name: '保 存' }))

    await waitFor(() => {
      expect(screen.getByText('book-list-ready')).toBeInTheDocument()
    })
    expect(toast.success).toHaveBeenCalledWith('新建图书成功')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const postUrl = String(fetchMock.mock.calls[0]?.[0])
    const postInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(postUrl.endsWith('/v1/book')).toBe(true)
    expect(postInit.method).toBe('POST')
    expect(JSON.parse(String(postInit.body))).toEqual({
      title: '球状闪电',
      author: '刘慈欣',
      image: 'https://example.com/qzsd.png',
      summary: '寻找球状闪电的秘密',
    })
  })
})
