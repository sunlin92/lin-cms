import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { RowActions } from '@/components/RowActions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMotionVariants } from '@/components/wm/motion'
import { deleteGroup, fetchGroups, updateGroup } from '@/features/groups/api'
import type { GroupBrief } from '@/lib/api/types'

const groupInfoSchema = z.object({
  name: z.string().trim().min(1, '请输入分组名称').max(60, '分组名称过长'),
  info: z.string().trim().max(255, '分组描述过长'),
})

type GroupInfoValues = z.output<typeof groupInfoSchema>

interface GroupListHandlers {
  onEdit: (group: GroupBrief) => void
  onPermissions: (group: GroupBrief) => void
  onContentPermissions: (group: GroupBrief) => void
  onDelete: (group: GroupBrief) => void
}

function buildColumns(handlers: GroupListHandlers): DataTableColumn<GroupBrief>[] {
  return [
    { key: 'name', header: '名称' },
    { key: 'info', header: '描述', render: (row) => row.info || '—' },
    {
      key: 'actions',
      header: '操作',
      className: 'w-14 md:w-56',
      render: (row) => (
        <RowActions
          menuLabel={`更多分组操作：${row.name}`}
          items={[
            {
              key: 'edit',
              label: '信息',
              icon: <Pencil />,
              onSelect: () => handlers.onEdit(row),
            },
            {
              key: 'permissions',
              label: '权限',
              icon: <ShieldCheck />,
              onSelect: () => handlers.onPermissions(row),
            },
            {
              key: 'content-permissions',
              label: '内容权限',
              icon: <ShieldCheck />,
              onSelect: () => handlers.onContentPermissions(row),
            },
            {
              key: 'delete',
              label: '删除',
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => handlers.onDelete(row),
            },
          ]}
        />
      ),
    },
  ]
}

/** 分组列表页：查看/编辑信息、配置权限、删除 */
export function GroupListPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<GroupBrief | null>(null)
  const [deleting, setDeleting] = useState<GroupBrief | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: fetchGroups,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: (result) => {
      toast.success(result.message)
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })
    },
    onError: (error) => {
      // 后端拒绝删除（如 401 受保护分组）时展示其 message，例如「不可删除此分组」
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
      setDeleting(null)
    },
  })

  const columns = buildColumns({
    onEdit: setEditing,
    onPermissions: (group) => navigate(`/admin/group/edit/${group.id}`),
    onContentPermissions: (group) => navigate(`/admin/groups/${group.id}/content-permissions`),
    onDelete: setDeleting,
  })

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="分组管理"
          description="维护分组信息与权限配置"
          actions={
            <Button onClick={() => navigate('/admin/group/add')}>
              <Plus />
              新增分组
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <DataTable
          columns={columns}
          rows={groupsQuery.data ?? []}
          rowKey="id"
          rowMotion={fadeUp}
          loading={groupsQuery.isLoading}
          emptyText="暂无分组"
        />
      </motion.div>

      {editing ? (
        <GroupInfoDialog
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title="删除分组"
        description={`确定删除分组「${deleting?.name ?? ''}」吗？`}
        confirmText="删除"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          const target = deleting
          if (target) deleteMutation.mutate(target.id)
        }}
        onCancel={() => setDeleting(null)}
      />
    </motion.div>
  )
}

interface GroupInfoDialogProps {
  group: GroupBrief
  onClose: () => void
  onSaved: () => void
}

/** 编辑分组名称/描述弹窗 */
function GroupInfoDialog({ group, onClose, onSaved }: GroupInfoDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof groupInfoSchema>, unknown, GroupInfoValues>({
    resolver: zodResolver(groupInfoSchema),
    defaultValues: { name: group.name, info: group.info ?? '' },
  })

  const updateMutation = useMutation({
    mutationFn: (values: GroupInfoValues) =>
      updateGroup(group.id, { name: values.name, info: values.info }),
    onSuccess: (result) => {
      toast.success(result.message)
      onSaved()
      onClose()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    },
  })

  const onSubmit = handleSubmit((values) => updateMutation.mutate(values))

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑分组</DialogTitle>
          <DialogDescription>修改分组名称与描述</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="group-name">名称</Label>
            <Input
              id="group-name"
              className="h-11"
              placeholder="请输入分组名称"
              {...register('name')}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-info">描述</Label>
            <Textarea id="group-info" placeholder="请输入分组描述（可选）" {...register('info')} />
            {errors.info ? <p className="text-xs text-destructive">{errors.info.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
