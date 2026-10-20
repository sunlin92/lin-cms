import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useRef } from 'react'
import { type FieldErrors, type UseFormRegister, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { get, request } from '@/lib/api/client'
import type { CaptchaResult, TokenPair, UserPermissionsResult } from '@/lib/api/types'
import { saveTokens } from '@/lib/auth/tokens'
import { flattenPermissions } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  captcha: z.string(),
})

type LoginFormValues = z.output<typeof loginSchema>

interface CaptchaFieldProps {
  image: string
  error?: string
  register: UseFormRegister<LoginFormValues>
  onRefresh: () => void
}

/** 登录页背景：两枚主色系漂浮光斑（缓慢漂移动画，纯装饰） */
function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 -left-24 size-[420px] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -right-28 -bottom-36 size-[460px] rounded-full bg-info/15 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()

  const captchaQuery = useQuery({
    queryKey: ['captcha'],
    queryFn: () => get<CaptchaResult>('cms/user/captcha'),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  const captcha = captchaQuery.data
  const hasCaptcha = Boolean(captcha?.image)
  const captchaTag = captcha?.tag ?? ''

  // 验证码开关在接口返回后才可知，校验时动态读取，schema 只创建一次
  const hasCaptchaRef = useRef(false)
  hasCaptchaRef.current = hasCaptcha
  const loginValidator = useMemo(
    () =>
      loginSchema.superRefine((values, ctx) => {
        if (hasCaptchaRef.current && !values.captcha.trim()) {
          ctx.addIssue({ code: 'custom', path: ['captcha'], message: '请输入验证码' })
        }
      }),
    [],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof loginValidator>, unknown, LoginFormValues>({
    resolver: zodResolver(loginValidator),
    defaultValues: { username: '', password: '', captcha: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const tokens = await request<TokenPair>('cms/user/login', {
        method: 'POST',
        json: { username: values.username, password: values.password, captcha: values.captcha },
        headers: captchaTag ? { tag: captchaTag } : undefined,
      })
      saveTokens(tokens.access_token, tokens.refresh_token)
      const profile = await get<UserPermissionsResult>('cms/user/permissions')
      useAuthStore.getState().setUserAndState({
        user: {
          id: profile.id,
          username: profile.username,
          nickname: profile.nickname,
          email: profile.email,
          avatar: profile.avatar,
        },
        admin: profile.admin,
        permissions: flattenPermissions(profile.permissions),
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败，请稍后重试')
    }
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <LoginBackdrop />
      <div className="relative w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', bounce: 0.3, duration: 0.7 }}
          className="rounded-2xl border border-border/60 bg-card/95 p-8 shadow-2xl shadow-primary/5 backdrop-blur-xl"
        >
          <div className="space-y-6">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20">
                <BookOpen className="size-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">Lin CMS</h1>
                <p className="text-sm text-muted-foreground">登录内容管理平台</p>
              </div>
            </div>
            <form onSubmit={onSubmit} noValidate>
              <div className="space-y-4">
                <LoginFormFields
                  register={register}
                  errors={errors}
                  hasCaptcha={hasCaptcha}
                  captchaImage={captcha?.image ?? ''}
                  onRefreshCaptcha={() => captchaQuery.refetch()}
                />
                <Button
                  type="submit"
                  className="h-11 w-full text-sm font-medium"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  {isSubmitting ? '登录中…' : '登 录'}
                </Button>
              </div>
            </form>
          </div>
        </motion.div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          FastAPI · React · Watermelon UI
        </p>
      </div>
    </div>
  )
}

interface LoginFormFieldsProps {
  register: UseFormRegister<LoginFormValues>
  errors: FieldErrors<LoginFormValues>
  hasCaptcha: boolean
  captchaImage: string
  onRefreshCaptcha: () => void
}

function LoginFormFields({
  register,
  errors,
  hasCaptcha,
  captchaImage,
  onRefreshCaptcha,
}: LoginFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          className="h-11"
          placeholder="请输入用户名"
          autoComplete="username"
          {...register('username')}
        />
        {errors.username ? (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          className="h-11"
          type="password"
          placeholder="请输入密码"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      {hasCaptcha ? (
        <CaptchaField
          image={captchaImage}
          error={errors.captcha?.message}
          register={register}
          onRefresh={onRefreshCaptcha}
        />
      ) : null}
    </>
  )
}

function CaptchaField({ image, error, register, onRefresh }: CaptchaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="captcha">验证码</Label>
      <div className="flex gap-2">
        <Input
          id="captcha"
          className="h-11"
          placeholder="请输入验证码"
          autoComplete="off"
          {...register('captcha')}
        />
        <button
          type="button"
          aria-label="点击刷新验证码"
          title="点击刷新验证码"
          onClick={onRefresh}
          className="h-11 w-28 shrink-0 overflow-hidden rounded-lg border border-input bg-background"
        >
          {image ? <img src={image} alt="验证码" className="h-full w-full object-cover" /> : null}
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
