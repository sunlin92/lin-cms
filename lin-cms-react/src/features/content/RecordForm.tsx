import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FieldSpec, RecordFieldValue } from '@/lib/api/agent-types'

interface RecordFormProps {
  fields: FieldSpec[]
  initial?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  submitting: boolean
  submitLabel?: string
}

/** 按 schema 动态渲染的记录表单：不执行 schema 内任何逻辑，仅映射基础控件 */
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  submitting,
  submitLabel = '保存',
}: RecordFormProps) {
  const [values, setValues] = useState<Record<string, RecordFieldValue>>(() => {
    const seed: Record<string, RecordFieldValue> = {}
    for (const field of fields) {
      const raw = initial[field.key]
      seed[field.key] =
        raw === undefined || raw === null
          ? field.type === 'boolean'
            ? false
            : ''
          : (raw as RecordFieldValue)
    }
    return seed
  })
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, value: RecordFieldValue) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    for (const field of fields) {
      if (field.required && (values[field.key] === '' || values[field.key] === null)) {
        setError(`「${field.label}」为必填项`)
        return
      }
    }
    const data: Record<string, unknown> = {}
    for (const field of fields) {
      const raw = values[field.key]
      if (raw === '' || raw === null) continue
      data[field.key] = field.type === 'number' ? Number(raw) : raw
    }
    setError(null)
    onSubmit(data)
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`rf-${field.key}`}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          {field.type === 'textarea' ? (
            <Textarea
              id={`rf-${field.key}`}
              aria-label={field.label}
              value={String(values[field.key] ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
            />
          ) : field.type === 'boolean' ? (
            <input
              id={`rf-${field.key}`}
              aria-label={field.label}
              type="checkbox"
              className="size-4"
              checked={Boolean(values[field.key])}
              onChange={(e) => set(field.key, e.target.checked)}
            />
          ) : field.type === 'select' ? (
            <select
              id={`rf-${field.key}`}
              aria-label={field.label}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={String(values[field.key] ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
            >
              <option value="">（未选择）</option>
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`rf-${field.key}`}
              aria-label={field.label}
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={String(values[field.key] ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <Button type="button" onClick={submit} disabled={submitting}>
        {submitting ? '保存中…' : submitLabel}
      </Button>
    </div>
  )
}
