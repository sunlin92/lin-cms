import { useQuery } from '@tanstack/react-query'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listAvailableContentTypes } from '@/lib/api/agent'
import type { FieldSpec } from '@/lib/api/agent-types'

interface RecordFiltersProps {
  typeKey: string
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
  sort: string
  onSortChange: (sort: string) => void
}

const SORTABLE = new Set(['text', 'number', 'date', 'boolean'])

/** 等值过滤（最多 5 个字段）+ 排序白名单 */
export function RecordFilters({
  typeKey,
  filters,
  onChange,
  sort,
  onSortChange,
}: RecordFiltersProps) {
  const { data } = useQuery({
    queryKey: ['available-content-types'],
    queryFn: listAvailableContentTypes,
  })
  const fields = (data?.find((t) => t.key === typeKey)?.fields ?? []) as FieldSpec[]

  const setFilter = (key: string, value: string) => {
    onChange({ ...filters, [key]: value })
  }

  const removeFilter = (key: string) => {
    const next = { ...filters }
    delete next[key]
    onChange(next)
  }

  const active = Object.keys(filters)
  const remaining = fields.filter((f) => !(f.key in filters))

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Filter className="size-4" /> 筛选
      </div>
      {active.map((key) => {
        const field = fields.find((f) => f.key === key)
        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={`flt-${key}`}>{`过滤 ${field?.label ?? key}`}</Label>
            <Input
              id={`flt-${key}`}
              className="w-36"
              value={filters[key]}
              onChange={(e) => setFilter(key, e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`移除筛选 ${field?.label ?? key}`}
              onClick={() => removeFilter(key)}
            >
              ×
            </Button>
          </div>
        )
      })}
      {active.length < 5 && remaining.length > 0 && (
        <div className="space-y-1">
          <Label>添加筛选字段</Label>
          <select
            aria-label="添加筛选字段"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value=""
            onChange={(e) => e.target.value && setFilter(e.target.value, '')}
          >
            <option value="">选择字段…</option>
            {remaining.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label>排序</Label>
        <select
          aria-label="排序字段"
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="">（默认按创建时间倒序）</option>
          {fields
            .filter((f) => SORTABLE.has(f.type))
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}
