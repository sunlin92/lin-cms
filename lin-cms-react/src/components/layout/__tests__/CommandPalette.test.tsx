import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useAuthStore } from '@/stores/auth'

function renderPalette(onOpenChange = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
        <Route path="/book/list" element={<div>book-list-page</div>} />
      </Routes>
      <CommandPalette open onOpenChange={onOpenChange} />
    </MemoryRouter>,
  )
  return onOpenChange
}

beforeEach(() => {
  useAuthStore.setState({ admin: true, permissions: [] })
})

describe('CommandPalette', () => {
  it('打开后展示权限内全部菜单页面（含分区标签）', () => {
    renderPalette()
    expect(screen.getByRole('combobox', { name: '搜索页面' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /图书列表/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /日志管理/ })).toBeInTheDocument()
  })

  it('按标题过滤：仅保留匹配项', () => {
    renderPalette()
    fireEvent.change(screen.getByRole('combobox', { name: '搜索页面' }), {
      target: { value: '日志' },
    })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('日志管理')
  })

  it('路径关键词也能命中（如输入 book）', () => {
    renderPalette()
    fireEvent.change(screen.getByRole('combobox', { name: '搜索页面' }), {
      target: { value: 'book' },
    })
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(options[0]).toHaveTextContent('图书列表')
  })

  it('无匹配时空态播报且不渲染 listbox', () => {
    renderPalette()
    fireEvent.change(screen.getByRole('combobox', { name: '搜索页面' }), {
      target: { value: '不存在的页面' },
    })
    expect(screen.getByText('没有匹配的页面')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('过滤后回车跳转目标页面', async () => {
    const onOpenChange = renderPalette()
    const input = screen.getByRole('combobox', { name: '搜索页面' })
    fireEvent.change(input, { target: { value: '图书' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('book-list-page')).toBeInTheDocument()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('ArrowDown / ArrowUp 循环移动选中项', () => {
    renderPalette()
    const input = screen.getByRole('combobox', { name: '搜索页面' })
    const options = () => screen.getAllByRole('option')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Escape 请求关闭面板', async () => {
    const onOpenChange = renderPalette()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
