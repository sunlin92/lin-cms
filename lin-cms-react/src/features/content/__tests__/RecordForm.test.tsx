import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldSpec } from '@/lib/api/agent-types'
import { RecordForm } from '../RecordForm'

const fields: FieldSpec[] = [
  { key: 'title', label: '标题', type: 'text', required: true, max_length: 50 },
  { key: 'desc', label: '描述', type: 'textarea' },
  { key: 'price', label: '价格', type: 'number', min: 0, max: 999 },
  { key: 'done', label: '完成', type: 'boolean' },
  { key: 'day', label: '日期', type: 'date' },
  { key: 'level', label: '级别', type: 'select', options: ['low', 'high'] },
]

describe('RecordForm 动态表单', () => {
  it('按 schema 渲染六种字段并提交载荷', () => {
    const onSubmit = vi.fn()
    render(<RecordForm fields={fields} onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'T1' } })
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '描述内容' } })
    fireEvent.change(screen.getByLabelText('价格'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByLabelText('完成'))
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-01-02' } })
    fireEvent.change(screen.getByLabelText('级别'), { target: { value: 'high' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'T1',
      desc: '描述内容',
      price: 12.5,
      done: true,
      day: '2026-01-02',
      level: 'high',
    })
  })

  it('必填缺失时拦截并提示', () => {
    const onSubmit = vi.fn()
    render(<RecordForm fields={fields} onSubmit={onSubmit} submitting={false} />)
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    expect(screen.getByRole('alert').textContent).toContain('标题')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('编辑模式回填已有值', () => {
    const onSubmit = vi.fn()
    render(
      <RecordForm
        fields={fields}
        initial={{ title: '旧标题', price: 3 } as Record<string, unknown>}
        onSubmit={onSubmit}
        submitting={false}
      />,
    )
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('旧标题')
    expect((screen.getByLabelText('价格') as HTMLInputElement).value).toBe('3')
  })

  it('select 渲染枚举选项', () => {
    render(<RecordForm fields={fields} onSubmit={vi.fn()} submitting={false} />)
    const select = screen.getByLabelText('级别') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'low', 'high'])
  })
})
