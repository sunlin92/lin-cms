import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '@/features/auth/LoginPage'
import { getAccessToken } from '@/lib/auth/tokens'
import { useAuthStore } from '@/stores/auth'

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

function captchaResponse(tag: string, image: string): Response {
  return jsonResponse(200, { tag, image })
}

function renderLogin(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>dashboard-ready</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fillAndSubmit(username: string, password: string, captcha?: string): void {
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } })
  if (captcha !== undefined) {
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: captcha } })
  }
  fireEvent.click(screen.getByRole('button', { name: '登 录' }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.getState().logout()
})

describe('LoginPage', () => {
  it('校验必填：空表单提交显示错误且不发登录请求', async () => {
    fetchMock.mockResolvedValueOnce(captchaResponse('', ''))

    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: '登 录' }))
    await waitFor(() => {
      expect(screen.getByText('请输入用户名')).toBeInTheDocument()
      expect(screen.getByText('请输入密码')).toBeInTheDocument()
    })
    // 仅发出验证码探测请求，未发起登录
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/cms/user/captcha')).toBe(true)
  })

  it('提交成功：保存 token、拉取权限、写入 store 并跳转 /dashboard', async () => {
    fetchMock
      .mockResolvedValueOnce(captchaResponse('', ''))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          code: 0,
          message: '登录成功',
          request: 'POST cms/user/login',
          access_token: 'access-value',
          refresh_token: 'refresh-value',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 1,
          username: 'admin',
          nickname: '管理员',
          email: 'admin@lin.local',
          avatar: '',
          admin: true,
          permissions: {
            日志: [
              { permission: '查询日志', module: '日志' },
              { permission: '查询所有日志', module: '日志' },
            ],
          },
        }),
      )

    renderLogin()
    fillAndSubmit('admin', 'admin123')

    await waitFor(() => {
      expect(screen.getByText('dashboard-ready')).toBeInTheDocument()
    })

    expect(getAccessToken()).toBe('Bearer access-value')
    const state = useAuthStore.getState()
    expect(state.admin).toBe(true)
    expect(state.permissions).toEqual(['查询日志', '查询所有日志'])
    expect(state.user?.username).toBe('admin')
    expect(state.user?.nickname).toBe('管理员')

    const captchaUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(captchaUrl.endsWith('/cms/user/captcha')).toBe(true)
    const loginUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(loginUrl.endsWith('/cms/user/login')).toBe(true)
    const loginInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(loginInit.method).toBe('POST')
    expect(JSON.parse(String(loginInit.body))).toEqual({
      username: 'admin',
      password: 'admin123',
      captcha: '',
    })
    // 验证码关闭时不携带 tag 头
    expect(new Headers(loginInit.headers).get('tag')).toBe(null)
    const permissionsUrl = String(fetchMock.mock.calls[2]?.[0])
    expect(permissionsUrl.endsWith('/cms/user/permissions')).toBe(true)
  })

  it('提交失败：toast 展示后端 message 且不跳转', async () => {
    fetchMock.mockResolvedValueOnce(captchaResponse('', '')).mockResolvedValueOnce(
      jsonResponse(401, {
        code: 10031,
        message: '账号或密码不正确',
        request: 'POST cms/user/login',
      }),
    )

    renderLogin()
    fillAndSubmit('admin', 'wrong-password')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('账号或密码不正确')
    })
    expect(screen.queryByText('dashboard-ready')).not.toBeInTheDocument()
    expect(getAccessToken()).toBe('')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('验证码关闭：captcha 接口返回空时不显示验证码输入框与图片', async () => {
    fetchMock.mockResolvedValueOnce(captchaResponse('', ''))

    renderLogin()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByLabelText('验证码')).not.toBeInTheDocument()
    expect(screen.queryByAltText('验证码')).not.toBeInTheDocument()
  })

  it('验证码开启：显示验证码图片，不填时 zod 校验必填且不发起登录', async () => {
    fetchMock.mockResolvedValueOnce(captchaResponse('tag-1', 'data:image/png;base64,AAAA'))

    renderLogin()
    expect(await screen.findByAltText('验证码')).toBeInTheDocument()
    expect(screen.getByLabelText('验证码')).toBeInTheDocument()

    fillAndSubmit('admin', 'admin123')
    await waitFor(() => {
      expect(screen.getByText('请输入验证码')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('验证码开启：填写后登录请求携带 tag 头与 captcha 字段', async () => {
    fetchMock
      .mockResolvedValueOnce(captchaResponse('tag-2', 'data:image/png;base64,BBBB'))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          code: 0,
          message: '登录成功',
          request: 'POST cms/user/login',
          access_token: 'a2',
          refresh_token: 'r2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 2,
          username: 'admin',
          nickname: '管理员',
          email: '',
          avatar: '',
          admin: false,
          permissions: {},
        }),
      )

    renderLogin()
    expect(await screen.findByAltText('验证码')).toBeInTheDocument()
    fillAndSubmit('admin', 'admin123', '8g4e')

    await waitFor(() => {
      expect(screen.getByText('dashboard-ready')).toBeInTheDocument()
    })
    const loginInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(new Headers(loginInit.headers).get('tag')).toBe('tag-2')
    expect(JSON.parse(String(loginInit.body))).toEqual({
      username: 'admin',
      password: 'admin123',
      captcha: '8g4e',
    })
  })
})
