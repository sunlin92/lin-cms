import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMotionVariants } from '@/components/wm/motion'
import {
  dispatchGroupPermissions,
  fetchGroupDetail,
  fetchPermissionTree,
  removeGroupPermissions,
} from '@/features/groups/api'
import { PermissionTree } from '@/features/groups/components/PermissionTree'
import { getPermissionChanges } from '@/features/groups/permissions'
import type {
  ApiEnvelope,
  GroupDetail,
  PermissionTree as PermissionTreeData,
} from '@/lib/api/types'

/** 路由 id 无效时的兜底视图 */
function InvalidGroupView({ onBack }: { onBack: () => void }) {
  const { fadeUp, staggerContainer } = useMotionVariants()
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="分组权限"
          actions={
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft />
              返回
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp} className="rounded-xl border border-border/60">
        <EmptyState title="分组不存在" description="路由参数中的分组 id 无效" />
      </motion.div>
    </motion.div>
  )
}

/** 权限树主体：骨架 / 错误提示 / 权限树 */
function PermissionCardBody({
  detailLoading,
  detailError,
  treeLoading,
  treeError,
  tree,
  selected,
  onSelectedChange,
  savePending,
}: {
  detailLoading: boolean
  detailError: boolean
  treeLoading: boolean
  treeError: boolean
  tree: PermissionTreeData
  selected: Set<number>
  onSelectedChange: (next: Set<number>) => void
  savePending: boolean
}) {
  if (detailLoading || treeLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    )
  }
  if (detailError) {
    return <p className="text-sm text-destructive">分组信息加载失败，请刷新重试</p>
  }
  if (treeError) {
    return <p className="text-sm text-destructive">权限数据加载失败，请刷新重试</p>
  }
  return (
    <PermissionTree
      tree={tree}
      value={selected}
      onChange={onSelectedChange}
      disabled={savePending}
    />
  )
}

/** 权限数据加载：分组详情 + 权限树，详情到达时同步初始集与编辑集 */
function useGroupPermissionData(groupId: number, enabled: boolean) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [initial, setInitial] = useState<Set<number>>(new Set())

  const detailQuery = useQuery({
    queryKey: ['admin', 'group', groupId],
    queryFn: () => fetchGroupDetail(groupId),
    enabled,
  })
  const treeQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: fetchPermissionTree,
    staleTime: 60_000,
  })

  // 详情到达时同步初始集与编辑集（保存成功后 invalidate 会再次触发，即“刷新初始集”）
  useEffect(() => {
    const detail = detailQuery.data
    if (!detail) return
    const ids = new Set(detail.permissions.map((permission) => permission.id))
    setInitial(ids)
    setSelected(new Set(ids))
  }, [detailQuery.data])

  return { detailQuery, treeQuery, selected, setSelected, initial }
}

/** 差集保存：add 走批量新增、remove 走批量移除，成功后刷新分组详情 */
function usePermissionSave(groupId: number, selected: Set<number>, initial: Set<number>) {
  const queryClient = useQueryClient()
  const saveMutation = useMutation({
    mutationFn: async (): Promise<ApiEnvelope | null> => {
      const { add, remove } = getPermissionChanges(selected, initial)
      let last: ApiEnvelope | null = null
      if (add.length > 0) {
        last = await dispatchGroupPermissions({ group_id: groupId, permission_ids: add })
      }
      if (remove.length > 0) {
        last = await removeGroupPermissions({ group_id: groupId, permission_ids: remove })
      }
      return last
    },
    onSuccess: (result) => {
      toast.success(result?.message ?? '权限已更新')
      queryClient.invalidateQueries({ queryKey: ['admin', 'group', groupId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    },
  })

  const handleSave = () => {
    const { add, remove } = getPermissionChanges(selected, initial)
    if (add.length === 0 && remove.length === 0) {
      toast.warning('权限未发生变化')
      return
    }
    saveMutation.mutate()
  }

  return { saveMutation, handleSave }
}

/** 分组权限配置页：以已有权限为初始集，保存时按差集批量新增/移除 */
export function GroupPermissionPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const { id } = useParams()
  const groupId = Number(id)
  const navigate = useNavigate()

  const validGroupId = Number.isInteger(groupId) && groupId > 0
  const { detailQuery, treeQuery, selected, setSelected, initial } = useGroupPermissionData(
    groupId,
    validGroupId,
  )
  const { saveMutation, handleSave } = usePermissionSave(groupId, selected, initial)

  if (!validGroupId) {
    return <InvalidGroupView onBack={() => navigate('/admin/group/list')} />
  }

  const detail: GroupDetail | undefined = detailQuery.data
  const changes = getPermissionChanges(selected, initial)

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title={`配置权限${detail ? ` · ${detail.name}` : ''}`}
          description="勾选权限后保存，系统按与当前配置的差集批量新增或移除"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/group/list')}>
                <ArrowLeft />
                返回
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || detailQuery.isLoading}
              >
                {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                保存
              </Button>
            </div>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>权限配置</CardTitle>
            <CardDescription>
              {detail
                ? `分组「${detail.name}」${detail.info ? `：${detail.info}` : ''}`
                : '加载分组信息中…'}
              {changes.add.length + changes.remove.length > 0
                ? `（待新增 ${changes.add.length} 项，待移除 ${changes.remove.length} 项）`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PermissionCardBody
              detailLoading={detailQuery.isLoading}
              detailError={detailQuery.isError}
              treeLoading={treeQuery.isLoading}
              treeError={treeQuery.isError}
              tree={treeQuery.data ?? {}}
              selected={selected}
              onSelectedChange={setSelected}
              savePending={saveMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              已选 {selected.size} 项
              {changes.add.length + changes.remove.length > 0 ? '，存在未保存的变更' : ''}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
