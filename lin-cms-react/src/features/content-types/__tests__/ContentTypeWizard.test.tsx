import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentTypeEditPage, ContentTypeWizardPage } from '../ContentTypeWizardPage'

const createMock = vi.fn()
const updateMock = vi.fn()
const getMock = vi.fn()
vi.mock('@/lib/api/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent')>()
  return {
    ...actual,
    createContentType: (...args: unknown[]) => createMock(...args),
    updateContentType: (...args: unknown[]) => updateMock(...args),
    getContentType: (...args: unknown[]) => getMock(...args),
  }
})

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentTypeWizardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function addField(key: string, label: string) {
  fireEvent.click(screen.getByRole('button', { name: /添加字段/ }))
  const keyInputs = screen.getAllByLabelText(/字段 key/)
  const labelInputs = screen.getAllByLabelText(/字段名称/)
  fireEvent.change(keyInputs[keyInputs.length - 1] as HTMLInputElement, { target: { value: key } })
  fireEvent.change(labelInputs[labelInputs.length - 1] as HTMLInputElement, {
    target: { value: label },
  })
}

beforeEach(() => {
  createMock.mockReset()
  updateMock.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('ContentTypeEditPage', () => {
  it('编辑模式加载已有类型、key 只读、提交走 updateContentType', async () => {
    getMock.mockResolvedValueOnce({
      id: 5,
      key: 'product',
      name: '商品目录',
      description: null,
      status: 'active',
      field_count: 1,
      record_count: 3,
      create_time: null,
      update_time: null,
      fields: [{ key: 'title', label: '标题', type: 'text', required: true }],
    })
    updateMock.mockResolvedValueOnce({ message: '成功', code: 0, request: '' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/content-types/5/edit']}>
          <Routes>
            <Route path="/admin/content-types/:typeId/edit" element={<ContentTypeEditPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => screen.getByDisplayValue('商品目录'))
    expect((screen.getByLabelText(/类型 key/) as HTMLInputElement).readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(5, expect.objectContaining({ key: 'product' })),
    )
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('ContentTypeWizardPage', () => {
  it('填写两个字段提交，载荷带 key/name/fields', async () => {
    createMock.mockResolvedValueOnce({ message: '成功', code: 0, request: '' })
    renderWizard()
    fill(/类型 key/, 'product')
    fill(/显示名称/, '商品目录')
    addField('title', '标题')
    addField('price', '价格')
    fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    const payload = createMock.mock.calls[0]?.[0] as {
      key: string
      name: string
      fields: Array<{ key: string; label: string; type: string }>
    }
    expect(payload.key).toBe('product')
    expect(payload.name).toBe('商品目录')
    expect(payload.fields.map((f) => f.key)).toEqual(['title', 'price'])
    expect(payload.fields[0]?.type).toBe('text')
  })

  it('重复字段 key 时前端拦截，不发请求', async () => {
    renderWizard()
    fill(/类型 key/, 'product')
    fill(/显示名称/, '商品目录')
    addField('title', '标题')
    addField('title', '又一个标题')
    fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    await waitFor(() => screen.getByText(/重复/))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('服务端错误时展示 message', async () => {
    createMock.mockRejectedValueOnce(
      Object.assign(new Error('内容类型 key 已存在：product'), { code: 10060 }),
    )
    renderWizard()
    fill(/类型 key/, 'product')
    fill(/显示名称/, '商品目录')
    addField('title', '标题')
    fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    await waitFor(() => expect(screen.getByText(/内容类型 key 已存在/)).toBeTruthy())
  })
})
