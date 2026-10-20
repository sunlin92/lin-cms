import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ImagePlus, KeyRound, Loader2, UserRound } from 'lucide-react'
import { motion } from 'motion/react'
import { type ChangeEvent, type RefObject, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { type NavigateFunction, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMotionVariants } from '@/components/wm/motion'
import { postForm, put } from '@/lib/api/client'
import type {
  ApiEnvelope,
  ChangePasswordPayload,
  UpdateProfilePayload,
  UploadedFile,
  UserBasic,
} from '@/lib/api/types'
import { clearAuthStorage } from '@/lib/auth/tokens'
import { useAuthStore } from '@/stores/auth'

const EMAIL_PATTERN = /^[\w.%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

const profileSchema = z.object({
  nickname: z.string().trim().min(2, '昵称需为 2-10 位').max(10, '昵称需为 2-10 位'),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || EMAIL_PATTERN.test(value), { message: '邮箱格式不正确' }),
})

const passwordSchema = z
  .object({
    old_password: z.string().min(1, '请输入旧密码'),
    new_password: z.string().min(6, '密码长度需为 6-22 位').max(22, '密码长度需为 6-22 位'),
    confirm_password: z.string().min(1, '请再次输入新密码'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ['confirm_password'],
    message: '两次输入的密码不一致',
  })

type ProfileValues = z.output<typeof profileSchema>
type PasswordValues = z.output<typeof passwordSchema>

/** 本地合并 user 字段到 auth store（保持 admin/permissions 不变） */
function mergeUser(patch: Partial<UserBasic>): void {
  const { user, admin, permissions, setUserAndState } = useAuthStore.getState()
  if (!user) return
  setUserAndState({ user: { ...user, ...patch }, admin, permissions })
}

/** 头像卡：渐变描边环 + 用户信息 + 更换头像入口 */
function AvatarCard({
  user,
  uploading,
  fileInputRef,
  onPick,
  onFileChange,
}: {
  user: UserBasic | null
  uploading: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  onPick: () => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-start">
        <div className="rounded-full bg-gradient-to-br from-primary to-info p-[2px]">
          <Avatar className="size-20">
            {user?.avatar ? <AvatarImage src={user.avatar} alt={user.username} /> : null}
            <AvatarFallback className="text-xl">
              {(user?.nickname || user?.username || '?').slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="space-y-1 text-center sm:text-left">
          <p className="text-lg font-semibold">{user?.username ?? '未登录'}</p>
          <p className="text-sm text-muted-foreground">{user?.nickname || '暂无昵称'}</p>
          <p className="text-sm text-muted-foreground">{user?.email || '暂无邮箱'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={uploading}
            onClick={onPick}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            更换头像
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/** 基本信息卡：昵称 / 邮箱 */
function ProfileFormCard({
  form,
  pending,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<z.input<typeof profileSchema>, unknown, ProfileValues>>
  pending: boolean
  onSubmit: (values: ProfileValues) => void
}) {
  const errors = form.formState.errors
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
        <CardDescription>修改昵称与邮箱（昵称 2-10 位）</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="profile-nickname">昵称</Label>
            <Input id="profile-nickname" className="h-11" {...form.register('nickname')} />
            {errors.nickname ? (
              <p className="text-xs text-destructive">{errors.nickname.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">邮箱</Label>
            <Input
              id="profile-email"
              className="h-11"
              placeholder="请输入邮箱"
              {...form.register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              className="h-11"
              disabled={form.formState.isSubmitting || pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <UserRound />}
              保存资料
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** 修改密码卡：旧密码 / 新密码 / 确认新密码 */
function PasswordFormCard({
  form,
  pending,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<z.input<typeof passwordSchema>, unknown, PasswordValues>>
  pending: boolean
  onSubmit: (values: PasswordValues) => void
}) {
  const errors = form.formState.errors
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>修改成功后需重新登录</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="old-password">旧密码</Label>
            <Input
              id="old-password"
              type="password"
              className="h-11"
              autoComplete="current-password"
              {...form.register('old_password')}
            />
            {errors.old_password ? (
              <p className="text-xs text-destructive">{errors.old_password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              className="h-11"
              autoComplete="new-password"
              placeholder="6-22 位"
              {...form.register('new_password')}
            />
            {errors.new_password ? (
              <p className="text-xs text-destructive">{errors.new_password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">确认新密码</Label>
            <Input
              id="confirm-new-password"
              type="password"
              className="h-11"
              autoComplete="new-password"
              {...form.register('confirm_password')}
            />
            {errors.confirm_password ? (
              <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="outline"
              className="h-11"
              disabled={form.formState.isSubmitting || pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
              修改密码
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** 资料保存：更新昵称/邮箱并同步到 auth store */
function useProfileMutation() {
  return useMutation({
    mutationFn: (values: ProfileValues) => {
      const payload: UpdateProfilePayload = { nickname: values.nickname }
      if (values.email) payload.email = values.email
      return put<ApiEnvelope>('cms/user', payload)
    },
    onSuccess: (result, values) => {
      toast.success(result.message)
      mergeUser({ nickname: values.nickname, email: values.email })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    },
  })
}

/** 修改密码：成功后清理本地登录态并跳登录页 */
function usePasswordMutation(navigate: NavigateFunction) {
  return useMutation({
    mutationFn: (values: PasswordValues) => {
      const payload: ChangePasswordPayload = {
        old_password: values.old_password,
        new_password: values.new_password,
        confirm_password: values.confirm_password,
      }
      return put<ApiEnvelope>('cms/user/change_password', payload)
    },
    onSuccess: (result) => {
      toast.success(result.message)
      // 改密后旧 token 全部失效：清理本地登录态并跳登录页
      clearAuthStorage()
      useAuthStore.getState().logout()
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '修改失败，请稍后重试')
    },
  })
}

/** 头像上传：cms/file 传文件后把相对 path 写回用户资料 */
function useAvatarMutation() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const uploaded = await postForm<UploadedFile[]>('cms/file', formData)
      const first = uploaded[0]
      if (!first) throw new Error('上传失败：服务端未返回文件')
      // 后端存相对 path，前端展示用返回的 url
      await put<ApiEnvelope>('cms/user', { avatar: first.path })
      return first
    },
    onSuccess: (uploaded) => {
      toast.success('头像已更新')
      mergeUser({ avatar: uploaded.url })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '头像上传失败，请稍后重试')
    },
  })
}

/** 个人中心：资料卡 + 头像上传 + 改昵称/邮箱 + 修改密码 */
export function ProfilePage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const profileForm = useForm<z.input<typeof profileSchema>, unknown, ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nickname: user?.nickname ?? '', email: user?.email ?? '' },
  })

  const passwordForm = useForm<z.input<typeof passwordSchema>, unknown, PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  })

  const profileMutation = useProfileMutation()
  const passwordMutation = usePasswordMutation(navigate)
  const avatarMutation = useAvatarMutation()

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) avatarMutation.mutate(file)
    // 允许重复选择同一文件
    event.target.value = ''
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="个人中心"
          description="维护个人资料与登录密码"
          actions={
            <Button variant="outline" onClick={() => navigate('/profile/agent-tokens')}>
              管理 Agent Token
            </Button>
          }
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <AvatarCard
          user={user}
          uploading={avatarMutation.isPending}
          fileInputRef={fileInputRef}
          onPick={() => fileInputRef.current?.click()}
          onFileChange={handleAvatarChange}
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <ProfileFormCard
          form={profileForm}
          pending={profileMutation.isPending}
          onSubmit={(values) => profileMutation.mutate(values)}
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <PasswordFormCard
          form={passwordForm}
          pending={passwordMutation.isPending}
          onSubmit={(values) => passwordMutation.mutate(values)}
        />
      </motion.div>
    </motion.div>
  )
}
