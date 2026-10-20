import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { archiveContentType, listAdminContentTypes, restoreContentType } from '@/lib/api/agent'
import type { ContentTypeListItem } from '@/lib/api/agent-types'

const columns: Array<DataTableColumn<ContentTypeListItem>> = [
  { key: 'name', header: '名称' },
  { key: 'key', header: 'key' },
  {
    key: 'status',
    header: '状态',
    render: (row) =>
      row.status === 'active' ? (
        <Badge variant="default">active</Badge>
      ) : (
        <Badge variant="secondary">archived</Badge>
      ),
  },
  { key: 'field_count', header: '字段数' },
  { key: 'record_count', header: '记录数' },
]

export function ContentTypeListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-content-types'],
    queryFn: () => listAdminContentTypes(0, 15),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveContentType(id),
    onSuccess: () => {
      toast.success('已归档：该模型不可再写入，也不再出现在可用列表（记录保留可恢复）')
      void queryClient.invalidateQueries({ queryKey: ['admin-content-types'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
  const restoreMutation = useMutation({
    mutationFn: (id: number) => restoreContentType(id),
    onSuccess: () => {
      toast.success('已恢复')
      void queryClient.invalidateQueries({ queryKey: ['admin-content-types'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容类型"
        description="可配置内容模型：字段声明式定义，按分组分配内容操作权限"
        actions={
          <Button onClick={() => navigate('/admin/content-types/new')}>
            <Plus className="mr-1 size-4" /> 新建类型
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        rowKey={(row) => String(row.id)}
        emptyText="还没有内容类型，点击右上角新建"
      />
      {(data?.items.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {data?.items.map((item) => (
            <Button
              key={`edit-${item.id}`}
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/admin/content-types/${item.id}/edit`)}
            >
              编辑 {item.name}
            </Button>
          ))}
          {data?.items.map((item) =>
            item.status === 'active' ? (
              <Button
                key={item.id}
                variant="outline"
                size="sm"
                onClick={() => archiveMutation.mutate(item.id)}
              >
                <Archive className="mr-1 size-4" /> 归档 {item.name}
              </Button>
            ) : (
              <Button
                key={item.id}
                variant="outline"
                size="sm"
                onClick={() => restoreMutation.mutate(item.id)}
              >
                <ArchiveRestore className="mr-1 size-4" /> 恢复 {item.name}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
