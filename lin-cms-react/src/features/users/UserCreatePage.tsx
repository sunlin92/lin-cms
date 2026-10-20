import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { type FieldErrors, type UseFormRegister, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMotionVariants } from '@/components/wm/motion'
import { registerUser } from '@/features/users/api'
import { useGroupOptionsQuery } from '@/features/users/hooks'
import type { GroupBrief } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const EMAIL_PATTERN = /^[\w.%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

const createUserSchema = z
  .object({
    username: z.string().regex(/^[A-Za-z0-9_]{2,10}$/, '用户名需为 2-10 位字母、数字或下划线'),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || EMAIL_PATTERN.test(value), { message: '邮箱格式不正确' }),
    password: z.string().min(6, '密码长度需为 6-22 位').max(22, '密码长度需为 6-22 位'),
    confirm_password: z.string().min(1, '请再次输入密码'),
    group_ids: z.array(z.number()),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ['confirm_password'],
    message: '两次输入的密码不一致',
  })

type CreateUserValues = z.output<typeof createUserSchema>

/** 分组多选：卡片化 checkbox，勾选时主色描边 + 浅底 */
function GroupSelectGrid({
  groups,
  loading,
  selectedIds,
  onToggle,
}: {
  groups: GroupBrief[]
  loading: boolean
  selectedIds: number[]
  onToggle: (groupId: number, checked: boolean) => void
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">分组加载中…</p>
  }
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可选分组，将使用默认分组</p>
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => {
        const checked = selectedIds.includes(group.id)
        return (
          <label
            key={group.id}
            htmlFor={`create-group-${group.id}`}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm transition-colors hover:bg-card-hover/60',
              checked && 'border-primary/40 bg-primary/5',
            )}
          >
            <Checkbox
              id={`create-group-${group.id}`}
              checked={checked}
              onCheckedChange={(value) => onToggle(group.id, value === true)}
            />
            <span className="font-medium">{group.name}</span>
          </label>
        )
      })}
    </div>
  )
}

/** 添加用户页：注册信息 + 分组多选（可空，后端默认 Guest） */
export function UserCreatePage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const groupsQuery = useGroupOptionsQuery()
  const groups = groupsQuery.data ?? []

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createUserSchema>, unknown, CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', email: '', password: '', confirm_password: '', group_ids: [] },
  })

  const selectedGroupIds = watch('group_ids')

  const createMutation = useMutation({
    mutationFn: (values: CreateUserValues) =>
      registerUser({
        username: values.username,
        password: values.password,
        confirm_password: values.confirm_password,
        email: values.email || undefined,
        group_ids: values.group_ids,
      }),
    onSuccess: (result) => {
      toast.success(result.message)
      navigate('/admin/user/list')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '创建失败，请稍后重试')
    },
  })

  const toggleGroup = (groupId: number, checked: boolean) => {
    const next = checked
      ? [...selectedGroupIds, groupId]
      : selectedGroupIds.filter((id) => id !== groupId)
    setValue('group_ids', next, { shouldDirty: true })
  }

  const onSubmit = handleSubmit((values) => createMutation.mutate(values))

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-2xl space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="添加用户"
          description="创建新用户并分配分组，不选分组时默认加入 Guest"
          actions={
            <Button variant="outline" onClick={() => navigate('/admin/user/list')}>
              <ArrowLeft />
              返回列表
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>用户信息</CardTitle>
            <CardDescription>用户名与密码为必填项，邮箱与分组可选</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <CreateUserFields register={register} errors={errors} />
              <div className="space-y-2">
                <Label>分组（可选）</Label>
                <GroupSelectGrid
                  groups={groups}
                  loading={groupsQuery.isLoading}
                  selectedIds={selectedGroupIds}
                  onToggle={toggleGroup}
                />
              </div>
              <CreateUserActions
                pending={createMutation.isPending}
                disabled={isSubmitting || createMutation.isPending}
                onCancel={() => navigate('/admin/user/list')}
              />
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/** 表单操作区：取消 / 创建用户 */
function CreateUserActions({
  pending,
  disabled,
  onCancel,
}: {
  pending: boolean
  disabled: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
        取消
      </Button>
      <Button type="submit" className="h-11" disabled={disabled}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        创建用户
      </Button>
    </div>
  )
}

/** 注册表单字段：用户名 / 邮箱 / 密码 / 确认密码 */
function CreateUserFields({
  register,
  errors,
}: {
  register: UseFormRegister<z.input<typeof createUserSchema>>
  errors: FieldErrors<z.input<typeof createUserSchema>>
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          className="h-11"
          placeholder="2-10 位字母、数字或下划线"
          {...register('username')}
        />
        {errors.username ? (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">邮箱（可选）</Label>
        <Input id="email" className="h-11" placeholder="请输入邮箱" {...register('email')} />
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          className="h-11"
          autoComplete="new-password"
          placeholder="6-22 位"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_password">确认密码</Label>
        <Input
          id="confirm_password"
          type="password"
          className="h-11"
          autoComplete="new-password"
          placeholder="再次输入密码"
          {...register('confirm_password')}
        />
        {errors.confirm_password ? (
          <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
        ) : null}
      </div>
    </>
  )
}
