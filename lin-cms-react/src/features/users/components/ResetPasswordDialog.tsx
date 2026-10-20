import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { resetAdminUserPassword } from '@/features/users/api'
import type { AdminUserRow } from '@/lib/api/types'

const resetPasswordSchema = z
  .object({
    new_password: z.string().min(6, '密码长度需为 6-22 位').max(22, '密码长度需为 6-22 位'),
    confirm_password: z.string().min(1, '请再次输入密码'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ['confirm_password'],
    message: '两次输入的密码不一致',
  })

type ResetPasswordValues = z.output<typeof resetPasswordSchema>

export interface ResetPasswordDialogProps {
  user: AdminUserRow
  open: boolean
  onClose: () => void
}

/** 管理员重置用户密码弹窗：6-22 位且两次一致 */
export function ResetPasswordDialog({ user, open, onClose }: ResetPasswordDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof resetPasswordSchema>, unknown, ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  })

  const resetMutation = useMutation({
    mutationFn: (values: ResetPasswordValues) =>
      resetAdminUserPassword(user.id, {
        new_password: values.new_password,
        confirm_password: values.confirm_password,
      }),
    onSuccess: (result) => {
      toast.success(result.message)
      onClose()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '重置失败，请稍后重试')
    },
  })

  const onSubmit = handleSubmit((values) => resetMutation.mutate(values))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
          <DialogDescription>为用户 {user.username} 设置新密码（6-22 位）</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="reset-new-password">新密码</Label>
            <Input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              {...register('new_password')}
            />
            {errors.new_password ? (
              <p className="text-xs text-destructive">{errors.new_password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">确认新密码</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
            {errors.confirm_password ? (
              <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting || resetMutation.isPending}>
              {resetMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              确认重置
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
