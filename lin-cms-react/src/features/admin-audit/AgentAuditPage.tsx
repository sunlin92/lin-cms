import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listAgentAudit } from '@/lib/api/agent'

/** Root 限定的 Agent 操作审计：只读元数据，含分页与三类过滤 */
export function AgentAuditPage() {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState('')
  const [typeKey, setTypeKey] = useState('')
  const [tokenId, setTokenId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['agent-audit', page, action, typeKey, tokenId],
    queryFn: () =>
      listAgentAudit({
        page,
        count: 15,
        action: action || undefined,
        content_type_key: typeKey || undefined,
        token_id: tokenId ? Number(tokenId) : undefined,
      }),
  })

  const rows = data?.items ?? []
  const totalPage = data?.total_page ?? 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 审计"
        description="Token 认证与内容操作的审计元数据（不含数据载荷与凭证）"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label htmlFor="au-action">动作</Label>
          <Input
            id="au-action"
            aria-label="动作过滤"
            className="w-40"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(0)
            }}
            placeholder="create_record"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-type">类型 key</Label>
          <Input
            id="au-type"
            aria-label="类型 key 过滤"
            className="w-36"
            value={typeKey}
            onChange={(e) => {
              setTypeKey(e.target.value)
              setPage(0)
            }}
            placeholder="note"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-token">Token ID</Label>
          <Input
            id="au-token"
            aria-label="Token ID 过滤"
            className="w-24"
            value={tokenId}
            onChange={(e) => {
              setTokenId(e.target.value)
              setPage(0)
            }}
            placeholder="3"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2">时间</th>
              <th className="p-2">Token</th>
              <th className="p-2">用户</th>
              <th className="p-2">类型</th>
              <th className="p-2">记录</th>
              <th className="p-2">动作</th>
              <th className="p-2">结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2 text-xs">{row.create_time?.replace('T', ' ').slice(0, 19)}</td>
                <td className="p-2 text-xs">#{row.agent_token_id ?? '—'}</td>
                <td className="p-2">#{row.user_id}</td>
                <td className="p-2 text-xs">{row.content_type_key ?? '—'}</td>
                <td className="p-2 text-xs">{row.record_id ?? '—'}</td>
                <td className="p-2 font-mono text-xs">{row.action}</td>
                <td className="p-2">
                  {row.success ? (
                    <Badge variant="default">成功</Badge>
                  ) : (
                    <Badge variant="destructive">{row.error_code ?? '失败'}</Badge>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  暂无审计记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          第 {page + 1} / {Math.max(totalPage, 1)} 页（共 {data?.total ?? 0} 条）
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPage}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
