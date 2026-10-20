import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { getAccessToken, saveTokens } from '@/lib/auth/tokens'
import { useAuthStore } from '@/stores/auth'

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

function renderProfile(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/center']}>
        <Routes>
          <Route path="/center" element={<ProfilePage />} />
          <Route path="/login" element={<div>login-ready</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  saveTokens('old-access', 'old-refresh')
  useAuthStore.getState().setUserAndState({
    user: { id: 1, username: 'admin', nickname: '管理员', email: 'admin@lin.local', avatar: '' },
    admin: true,
    permissions: ['查询日志'],
  })
})

describe('ProfilePage', () => {
  it('修改密码成功：清空 token 与登录态并跳转 /login', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        code: 0,
        message: '密码修改成功，请重新登录',
        request: 'PUT cms/user/change_password',
      }),
    )
    renderProfile()

    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'newpass123' } })
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))

    await waitFor(() => {
      expect(screen.getByText('login-ready')).toBeInTheDocument()
    })
    expect(toast.success).toHaveBeenCalledWith('密码修改成功，请重新登录')
    // 旧 token 全失效：本地需清理干净
    expect(getAccessToken()).toBe('')
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().admin).toBe(false)

    const requestUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(requestUrl.endsWith('/cms/user/change_password')).toBe(true)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      old_password: 'oldpass',
      new_password: 'newpass123',
      confirm_password: 'newpass123',
    })
  })

  it('新密码两次不一致：显示错误且不发起请求', async () => {
    renderProfile()

    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'otherpass1' } })
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('保存资料成功：更新 auth store 中的昵称与邮箱', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { code: 0, message: '资料更新成功', request: 'PUT cms/user' }),
    )
    renderProfile()

    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '新昵称' } })
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'new@lin.local' } })
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('资料更新成功')
    })
    const state = useAuthStore.getState()
    expect(state.user?.nickname).toBe('新昵称')
    expect(state.user?.email).toBe('new@lin.local')
    expect(state.user?.username).toBe('admin')
    expect(state.admin).toBe(true)
    expect(state.permissions).toEqual(['查询日志'])

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ nickname: '新昵称', email: 'new@lin.local' })
  })
})
