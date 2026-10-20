import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookPlus, ShieldAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { usePermission } from '@/components/Can'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { RowActions } from '@/components/RowActions'
import { Button } from '@/components/ui/button'
import { useMotionVariants } from '@/components/wm/motion'
import { del, get } from '@/lib/api/client'
import type { ApiEnvelope, Book } from '@/lib/api/types'

/** 行内封面小图：无链接或加载失败时不显示 */
function BookCover({ src, alt }: { src: string; alt: string }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      className="size-10 shrink-0 rounded object-cover"
      onError={(event) => {
        event.currentTarget.style.display = 'none'
      }}
    />
  )
}

function buildBookColumns(
  onEdit: (id: number) => void,
  onDelete: (book: Book) => void,
  canDelete: boolean,
): DataTableColumn<Book>[] {
  return [
    {
      key: 'title',
      header: '书名',
      render: (row) => (
        <div className="flex items-center gap-3">
          <BookCover src={row.image} alt={`${row.title}封面`} />
          <span className="font-medium">{row.title}</span>
        </div>
      ),
    },
    { key: 'author', header: '作者' },
    {
      key: 'actions',
      header: '操作',
      className: 'w-14 md:w-32',
      render: (row) => (
        <RowActions
          menuLabel={`更多图书操作：${row.title}`}
          items={[
            {
              key: 'edit',
              label: '编辑',
              onSelect: () => onEdit(row.id),
            },
            ...(canDelete
              ? [
                  {
                    key: 'delete',
                    label: '删除',
                    destructive: true,
                    onSelect: () => onDelete(row),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ]
}

export function BookListPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const [pendingDelete, setPendingDelete] = useState<Book | null>(null)

  const booksQuery = useQuery({
    queryKey: ['books'],
    queryFn: () => get<Book[]>('v1/book'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del<ApiEnvelope>(`v1/book/${id}`),
    onSuccess: (result) => {
      toast.success(result.message)
      setPendingDelete(null)
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
    },
  })

  const books = booksQuery.data ?? []
  const columns = buildBookColumns(
    (id) => navigate(`/book/edit/${id}`),
    (book) => setPendingDelete(book),
    can('删除图书'),
  )

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="图书列表"
          description="管理内容库中的全部图书"
          actions={
            <Button onClick={() => navigate('/book/add')}>
              <BookPlus />
              新增图书
            </Button>
          }
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        {booksQuery.isError ? (
          <EmptyState
            icon={ShieldAlert}
            title="图书加载失败"
            description={
              booksQuery.error instanceof Error ? booksQuery.error.message : '请稍后重试'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={books}
            rowKey="id"
            rowMotion={fadeUp}
            loading={booksQuery.isLoading}
            emptyText="暂无图书"
          />
        )}
      </motion.div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除图书"
        description={`确定要删除《${pendingDelete?.title ?? ''}》吗？此操作不可恢复。`}
        confirmText="删除"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </motion.div>
  )
}
