import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { updateAdminUser } from '@/features/users/api'
import type { AdminUserRow, GroupBrief } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const editUserSchema = z.object({
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[\w.%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value), {
      message: '邮箱格式不正确',
    }),
  group_ids: z.array(z.number()),
})

type EditUserValues = z.output<typeof editUserSchema>

export interface EditUserDialogProps {
  user: AdminUserRow
  groups: GroupBrief[]
  open: boolean
  onClose: () => void
}

/** 编辑用户弹窗：修改邮箱 + 分组多选 */
export function EditUserDialog({ user, groups, open, onClose }: EditUserDialogProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof editUserSchema>, unknown, EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { email: user.email ?? '', group_ids: user.groups.map((g) => g.id) },
  })

  const selectedGroupIds = watch('group_ids')

  const updateMutation = useMutation({
    mutationFn: (values: EditUserValues) =>
      updateAdminUser(user.id, { email: values.email, group_ids: values.group_ids }),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    },
  })

  const toggleGroup = (groupId: number, checked: boolean) => {
    const next = checked
      ? [...selectedGroupIds, groupId]
      : selectedGroupIds.filter((id) => id !== groupId)
    setValue('group_ids', next, { shouldDirty: true })
  }

  const onSubmit = handleSubmit((values) => updateMutation.mutate(values))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑用户</DialogTitle>
          <DialogDescription>修改用户 {user.username} 的邮箱与所属分组</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="edit-email">邮箱</Label>
            <Input id="edit-email" placeholder="请输入邮箱" {...register('email')} />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>分组</Label>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无可选分组</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {groups.map((group) => {
                  const checked = selectedGroupIds.includes(group.id)
                  return (
                    <label
                      key={group.id}
                      htmlFor={`edit-group-${group.id}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm transition-colors hover:bg-card-hover/60',
                        checked && 'border-primary/40 bg-primary/5',
                      )}
                    >
                      <Checkbox
                        id={`edit-group-${group.id}`}
                        checked={checked}
                        onCheckedChange={(checked) => toggleGroup(group.id, checked === true)}
                      />
                      <span className="font-medium">{group.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
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
