import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { listAvailableContentTypes } from '@/lib/api/agent'

/** 内容工作区入口：列出当前用户可访问的内容类型 */
export function ContentWorkspacePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['available-content-types'],
    queryFn: listAvailableContentTypes,
  })
  const types = data ?? []
  return (
    <div className="space-y-6">
      <PageHeader title="内容管理" description="按模型组织的数据工作区：只显示你有权限的内容类型" />
      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && types.length === 0 && (
        <p className="text-sm text-muted-foreground">
          还没有可访问的内容类型——请联系管理员创建类型并分配权限，或前往
          <Link className="mx-1 underline" to="/agent-access">
            Agent 接入
          </Link>
          页了解详情
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => (
          <Link
            key={type.id}
            to={`/content/${type.key}`}
            className="space-y-1 rounded-lg border p-4 transition-colors hover:border-primary/60"
          >
            <p className="font-medium">{type.name}</p>
            <p className="text-xs text-muted-foreground">
              {type.key} · {type.field_count} 个字段
            </p>
            <p className="text-xs text-muted-foreground">可用操作：{type.ops.join(' / ')}</p>
            {type.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{type.description}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
