import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { deleteContentRecord, listAvailableContentTypes, listContentRecords } from '@/lib/api/agent'
import type { ContentRecordDTO } from '@/lib/api/agent-types'
import { RecordDialog } from './RecordDialog'
import { RecordFilters } from './RecordFilters'

export function ContentRecordListPage() {
  const { typeKey = '' } = useParams()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<string>('')
  const [editing, setEditing] = useState<ContentRecordDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<ContentRecordDTO | null>(null)

  const availableQuery = useQuery({
    queryKey: ['available-content-types'],
    queryFn: listAvailableContentTypes,
  })
  const type = availableQuery.data?.find((t) => t.key === typeKey)

  const recordsQuery = useQuery({
    queryKey: ['content-records', typeKey, page, filters, sort],
    queryFn: () =>
      listContentRecords(typeKey, {
        page,
        count: 5,
        filters,
        sort: sort || undefined,
        order: 'desc',
      }),
    enabled: Boolean(typeKey),
  })

  const deleteMutation = useMutation({
    mutationFn: (record: ContentRecordDTO) => deleteContentRecord(typeKey, record.id),
    onSuccess: () => {
      toast.success('记录已删除（软删除，管理员可恢复）')
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['content-records', typeKey] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const rows = recordsQuery.data?.items ?? []
  const totalPage = recordsQuery.data?.total_page ?? 1
  const columns = Object.keys(rows[0] ?? {}).filter((k) => k !== 'id')

  if (availableQuery.isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>
  if (!type) {
    return (
      <div className="space-y-3">
        <PageHeader title="内容" description="按内容类型组织的数据工作区" />
        <p className="text-sm text-muted-foreground">
          还没有可访问的内容类型——请先联系管理员创建类型并分配权限，或前往
          <Link className="mx-1 underline" to="/agent-access">
            Agent 接入
          </Link>
          页了解详情
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${type.name}（${type.key}）`}
        description={type.description ?? undefined}
        actions={
          type.ops.includes('create') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 size-4" /> 新增记录
            </Button>
          ) : undefined
        }
      />

      <RecordFilters
        typeKey={typeKey}
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
      />

      {recordsQuery.data?.scan_truncated && (
        <p
          role="status"
          className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          结果可能不完整：命中过滤扫描上限，请收窄筛选条件
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2">#</th>
              {columns.map((col) => (
                <th key={col} className="p-2">
                  {col}
                </th>
              ))}
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2 text-muted-foreground">{row.id}</td>
                {columns.map((col) => (
                  <td key={col} className="max-w-64 truncate p-2">
                    {String(row[col] ?? '—')}
                  </td>
                ))}
                <td className="flex gap-1 p-2">
                  {type.ops.includes('update') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`编辑 ${row.id}`}
                      onClick={() => setEditing(row)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {type.ops.includes('delete') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`删除 ${row.id}`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !recordsQuery.isLoading && (
              <tr>
                <td colSpan={columns.length + 2} className="p-6 text-center text-muted-foreground">
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          第 {page + 1} / {Math.max(totalPage, 1)} 页（共 {recordsQuery.data?.total ?? 0} 条）
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPage}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>

      {(creating || editing) && (
        <RecordDialog
          typeKey={typeKey}
          record={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      {deleting && (
        <div
          role="dialog"
          aria-label="删除确认"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-80 space-y-3 rounded-lg bg-background p-4 shadow-lg">
            <p className="font-medium">删除记录 #{deleting.id}？</p>
            <p className="text-sm text-muted-foreground">软删除，管理员可恢复数据</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(deleting)}
              >
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
