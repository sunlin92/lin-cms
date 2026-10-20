import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  getGroupContentPermissions,
  listAdminContentTypes,
  replaceGroupContentPermissions,
} from '@/lib/api/agent'
import type { ContentTypeListItem, GroupContentGrant } from '@/lib/api/agent-types'

const OPS: Array<{
  flag: keyof Omit<GroupContentGrant, 'content_type_id'>
  label: string
  hint: string
}> = [
  { flag: 'can_read', label: '读', hint: '查看与列表' },
  { flag: 'can_create', label: '建', hint: '新增记录' },
  { flag: 'can_update', label: '改', hint: '编辑记录' },
  { flag: 'can_delete', label: '删', hint: '软删除' },
]

function emptyGrant(typeId: number): GroupContentGrant {
  return {
    content_type_id: typeId,
    can_read: false,
    can_create: false,
    can_update: false,
    can_delete: false,
  }
}

export function GroupContentPermissionPage() {
  const { groupId = '' } = useParams()
  const gid = Number(groupId)
  const queryClient = useQueryClient()
  const [grants, setGrants] = useState<Record<number, GroupContentGrant>>({})
  const [error, setError] = useState<string | null>(null)

  const typesQuery = useQuery({
    queryKey: ['admin-content-types'],
    queryFn: () => listAdminContentTypes(0, 15),
  })
  const grantsQuery = useQuery({
    queryKey: ['group-content-permissions', gid],
    queryFn: () => getGroupContentPermissions(gid),
    enabled: Number.isFinite(gid) && gid > 0,
  })

  useEffect(() => {
    if (grantsQuery.data) {
      const map: Record<number, GroupContentGrant> = {}
      for (const entry of grantsQuery.data.entries) {
        map[entry.content_type_id] = entry
      }
      setGrants(map)
    }
  }, [grantsQuery.data])

  const saveMutation = useMutation({
    mutationFn: (entries: GroupContentGrant[]) => replaceGroupContentPermissions(gid, entries),
    onSuccess: () => {
      toast.success('内容权限已保存，下一次请求立即生效')
      void queryClient.invalidateQueries({ queryKey: ['group-content-permissions', gid] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const toggle = (typeId: number, flag: keyof Omit<GroupContentGrant, 'content_type_id'>) => {
    setGrants((prev) => {
      const current = prev[typeId] ?? emptyGrant(typeId)
      return { ...prev, [typeId]: { ...current, [flag]: !current[flag] } }
    })
  }

  const save = () => {
    setError(null)
    const entries = Object.values(grants).filter(
      (g) => g.can_read || g.can_create || g.can_update || g.can_delete,
    )
    saveMutation.mutate(entries)
  }

  const rows = (typesQuery.data?.items ?? []).filter(
    (t: ContentTypeListItem) => t.status === 'active',
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`分组内容权限（#${gid}）`}
        description="矩阵勾选该分组对各内容类型的操作授权；保存为全量替换，未勾选即撤销，立即生效"
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {rows.length === 0 && !typesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          还没有内容类型——请先在「内容类型」页创建模型，再回到这里分配权限
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">内容类型</th>
              {OPS.map((op) => (
                <th key={op.flag} className="py-2" title={op.hint}>
                  {op.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">
                  {row.name}
                  <span className="ml-2 text-xs text-muted-foreground">{row.key}</span>
                </td>
                {OPS.map((op) => {
                  const grant = grants[row.id] ?? emptyGrant(row.id)
                  return (
                    <td key={op.flag} className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`${row.name}-${op.label}`}
                        checked={grant[op.flag]}
                        onChange={() => toggle(row.id, op.flag)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <Button onClick={save} disabled={saveMutation.isPending || !Number.isFinite(gid)}>
          <Save className="mr-1 size-4" /> 保存内容权限
        </Button>
      </div>
    </div>
  )
}
