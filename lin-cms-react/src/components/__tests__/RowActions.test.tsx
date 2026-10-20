import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type RowActionItem, RowActions } from '@/components/RowActions'

let items: RowActionItem[]

beforeEach(() => {
  items = [
    { key: 'edit', label: '编辑', onSelect: vi.fn() },
    { key: 'delete', label: '删除', destructive: true, onSelect: vi.fn() },
  ]
})

describe('RowActions', () => {
  it('渲染桌面端内联按钮与移动端“更多”触发按钮（可访问名称齐全）', () => {
    render(<RowActions menuLabel="更多用户操作" items={items} />)
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多用户操作' })).toBeInTheDocument()
  })

  it('移动端下拉菜单展开后可触发对应操作', async () => {
    render(<RowActions menuLabel="更多用户操作" items={items} />)
    const trigger = screen.getByRole('button', { name: '更多用户操作' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const menuDelete = await screen.findByRole('menuitem', { name: '删除' })
    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeInTheDocument()
    fireEvent.click(menuDelete)

    expect(items[1].onSelect).toHaveBeenCalledTimes(1)
    expect(items[0].onSelect).not.toHaveBeenCalled()
  })
})
