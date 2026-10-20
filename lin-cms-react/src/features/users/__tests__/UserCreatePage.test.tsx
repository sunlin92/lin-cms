import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserCreatePage } from '@/features/users/UserCreatePage'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

import { toast } from 'sonner'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

function renderCreatePage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/user/add']}>
        <Routes>
          <Route path="/admin/user/add" element={<UserCreatePage />} />
          <Route path="/admin/user/list" element={<div>user-list-ready</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fillField(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function mockGroupOptions(): void {
  fetchMock.mockResolvedValueOnce(
    jsonResponse(200, [
      { id: 1, name: '管理员', info: '超级管理员' },
      { id: 2, name: '普通用户', info: '默认分组' },
    ]),
  )
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: '创建用户' }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('UserCreatePage', () => {
  it('密码与确认密码不一致：显示错误且不发起注册请求', async () => {
    mockGroupOptions()
    renderCreatePage()

    fillField('用户名', 'newuser')
    fillField('密码', 'secret123')
    fillField('确认密码', 'secret456')
    submit()

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument()
    })
    const registerCalled = fetchMock.mock.calls.some((call) =>
      String(call[0]).includes('/cms/user/register'),
    )
    expect(registerCalled).toBe(false)
  })

  it('用户名非法：长度不足时显示格式错误', async () => {
    mockGroupOptions()
    renderCreatePage()

    fillField('用户名', 'a')
    fillField('密码', 'secret123')
    fillField('确认密码', 'secret123')
    submit()

    await waitFor(() => {
      expect(screen.getByText('用户名需为 2-10 位字母、数字或下划线')).toBeInTheDocument()
    })
  })

  it('提交成功：携带邮箱与分组 id 注册，toast 后端 message 并跳转列表', async () => {
    mockGroupOptions()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { code: 0, message: '用户创建成功', request: 'POST cms/user/register' }),
    )
    renderCreatePage()
    await waitFor(() => {
      expect(screen.getByLabelText('管理员')).toBeInTheDocument()
    })

    fillField('用户名', 'newuser')
    fillField('邮箱（可选）', 'new@example.com')
    fillField('密码', 'secret123')
    fillField('确认密码', 'secret123')
    fireEvent.click(screen.getByLabelText('管理员'))

    submit()

    await waitFor(() => {
      expect(screen.getByText('user-list-ready')).toBeInTheDocument()
    })
    expect(toast.success).toHaveBeenCalledWith('用户创建成功')

    const registerCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/cms/user/register'),
    )
    expect(registerCall).toBeDefined()
    const init = registerCall?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      username: 'newuser',
      password: 'secret123',
      confirm_password: 'secret123',
      email: 'new@example.com',
      group_ids: [1],
    })
  })
})
