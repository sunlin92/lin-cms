import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  createContentRecord,
  listAvailableContentTypes,
  updateContentRecord,
} from '@/lib/api/agent'
import type { ContentRecordDTO } from '@/lib/api/agent-types'
import { RecordForm } from './RecordForm'

interface RecordDialogProps {
  typeKey: string
  record: ContentRecordDTO | null // null = 新建
  onClose: () => void
}

/** 新建/编辑记录弹层：按 schema 动态渲染 RecordForm */
export function RecordDialog({ typeKey, record, onClose }: RecordDialogProps) {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['available-content-types'],
    queryFn: listAvailableContentTypes,
  })
  const type = data?.find((t) => t.key === typeKey)

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      record
        ? updateContentRecord(typeKey, record.id, payload)
        : createContentRecord(typeKey, payload),
    onSuccess: () => {
      toast.success(record ? '记录已更新' : '记录已创建')
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['content-records', typeKey] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const initial: Record<string, unknown> = record
    ? Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'id'))
    : {}

  return (
    <div
      role="dialog"
      aria-label={record ? '编辑记录' : '新增记录'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[80vh] w-full max-w-lg space-y-4 overflow-auto rounded-lg bg-background p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">
            {record ? `编辑记录 #${record.id}` : `新增记录（${type?.name ?? typeKey}）`}
          </h3>
          <Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <RecordForm
          fields={type?.fields ?? []}
          initial={initial}
          onSubmit={(data) => mutation.mutate(data)}
          submitting={mutation.isPending}
        />
      </div>
    </div>
  )
}
