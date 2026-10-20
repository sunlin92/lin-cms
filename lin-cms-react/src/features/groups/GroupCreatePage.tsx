import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { type FieldErrors, type UseFormRegister, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useMotionVariants } from '@/components/wm/motion'
import { createGroup, fetchPermissionTree } from '@/features/groups/api'
import { PermissionTree } from '@/features/groups/components/PermissionTree'

const createGroupSchema = z.object({
  name: z.string().trim().min(1, '请输入分组名称').max(60, '分组名称过长'),
  info: z.string().trim().max(255, '分组描述过长'),
})

type CreateGroupValues = z.output<typeof createGroupSchema>

/** 基本信息 fields：名称 / 描述 */
function GroupInfoFields({
  register,
  errors,
}: {
  register: UseFormRegister<z.input<typeof createGroupSchema>>
  errors: FieldErrors<z.input<typeof createGroupSchema>>
}) {
  return (
    <>
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
    </>
  )
}

/** 权限选择区：已选计数 + 加载骨架 / 错误提示 / 权限树 */
function PermissionFieldSection({
  selectedIds,
  onSelectedChange,
}: {
  selectedIds: Set<number>
  onSelectedChange: (next: Set<number>) => void
}) {
  const treeQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: fetchPermissionTree,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>权限</Label>
        <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 项</span>
      </div>
      {treeQuery.isLoading ? (
        <div className="space-y-2 rounded-xl border border-border/60 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : treeQuery.isError ? (
        <p className="text-sm text-destructive">权限数据加载失败，请刷新重试</p>
      ) : (
        <PermissionTree
          tree={treeQuery.data ?? {}}
          value={selectedIds}
          onChange={onSelectedChange}
        />
      )}
    </div>
  )
}

/** 新增分组页：基本信息 + 初始权限树 */
export function GroupCreatePage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createGroupSchema>, unknown, CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: '', info: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateGroupValues) =>
      createGroup({
        name: values.name,
        info: values.info || undefined,
        permission_ids: [...selectedIds],
      }),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })
      navigate('/admin/group/list')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '创建失败，请稍后重试')
    },
  })

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
          title="新增分组"
          description="创建分组并勾选初始权限，可稍后在分组管理中调整"
          actions={
            <Button variant="outline" onClick={() => navigate('/admin/group/list')}>
              <ArrowLeft />
              返回列表
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>分组信息</CardTitle>
            <CardDescription>名称必填，描述可选</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <GroupInfoFields register={register} errors={errors} />
              <PermissionFieldSection selectedIds={selectedIds} onSelectedChange={setSelectedIds} />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => navigate('/admin/group/list')}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="h-11"
                  disabled={isSubmitting || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                  创建分组
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
