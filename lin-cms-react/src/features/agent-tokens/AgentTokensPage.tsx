import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createAgentToken,
  listAgentTokens,
  listAvailableContentTypes,
  revokeAgentToken,
} from '@/lib/api/agent'
import type { AgentTokenMeta } from '@/lib/api/agent-types'

const OP_LABELS: Record<string, string> = { read: '读', create: '建', update: '改', delete: '删' }

function CreateTokenDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [ttl, setTtl] = useState(90)
  const [ops, setOps] = useState<Record<number, string[]>>({})
  const [created, setCreated] = useState<{ token: string; expires_at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const availableQuery = useQuery({
    queryKey: ['available-content-types'],
    queryFn: listAvailableContentTypes,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const scope = Object.entries(ops)
        .map(([typeId, selected]) => ({ content_type_id: Number(typeId), ops: selected }))
        .filter((entry) => entry.ops.length > 0)
      return createAgentToken({ name: name.trim(), ttl_days: ttl, scope })
    },
    onSuccess: (data) => {
      setCreated({ token: data.token, expires_at: data.expires_at })
      void queryClient.invalidateQueries({ queryKey: ['agent-tokens'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const toggleOp = (typeId: number, op: string) => {
    setOps((prev) => {
      const current = prev[typeId] ?? []
      return {
        ...prev,
        [typeId]: current.includes(op) ? current.filter((o) => o !== op) : [...current, op],
      }
    })
  }

  const submit = () => {
    setError(null)
    if (!name.trim()) {
      setError('请填写 Token 名称')
      return
    }
    if (ttl < 1 || ttl > 365) {
      setError('有效期需在 1..365 天之间')
      return
    }
    if (!Object.values(ops).some((selected) => selected.length > 0)) {
      setError('至少勾选一个内容类型操作')
      return
    }
    createMutation.mutate()
  }

  return (
    <div
      role="dialog"
      aria-label="新建 Agent Token"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[80vh] w-full max-w-lg space-y-4 overflow-auto rounded-lg bg-background p-5 shadow-lg">
        {created ? (
          <>
            <h3 className="font-medium">Token 已创建（仅此一次展示）</h3>
            <p className="text-sm text-muted-foreground">
              关闭后不可再查看；请立即复制并保存到安全位置（推荐 CLI keyring
              或密码管理器）。过期时间：{created.expires_at}
            </p>
            <div className="flex items-center gap-2">
              <code
                data-testid="token-plaintext"
                className="flex-1 break-all rounded-md bg-muted p-2 text-xs"
              >
                {created.token}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(created.token)
                  toast.success('已复制到剪贴板')
                }}
              >
                <Copy className="mr-1 size-4" /> 复制
              </Button>
            </div>
            <Button className="w-full" onClick={onClose}>
              我已保存，关闭
            </Button>
          </>
        ) : (
          <>
            <h3 className="font-medium">新建 Agent Token</h3>
            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tk-name">名称</Label>
              <Input
                id="tk-name"
                aria-label="Token 名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="我的助手"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-ttl">有效期（天，1..365，默认 90）</Label>
              <Input
                id="tk-ttl"
                aria-label="有效期"
                type="number"
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>范围（按你的内容能力勾选）</Label>
              {(availableQuery.data ?? []).map((type) => (
                <div key={type.id} className="space-y-1 rounded-md border p-2">
                  <p className="text-sm font-medium">
                    {type.name} <span className="text-xs text-muted-foreground">{type.key}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {type.ops.map((op) => (
                      <label key={op} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={(ops[type.id] ?? []).includes(op)}
                          aria-label={`${type.name}-${op}`}
                          onChange={() => toggleOp(type.id, op)}
                        />
                        {OP_LABELS[op] ?? op}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? '创建中…' : '创建'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function TokenRow({ token }: { token: AgentTokenMeta }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const revokeMutation = useMutation({
    mutationFn: () => revokeAgentToken(token.id),
    onSuccess: () => {
      toast.success('Token 已吊销')
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: ['agent-tokens'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
  const expired = new Date(token.expires_at).getTime() < Date.now()
  return (
    <tr className="border-b">
      <td className="p-2">{token.name}</td>
      <td className="p-2 font-mono text-xs">{token.prefix}…</td>
      <td className="p-2 text-xs">
        {token.scope.map((s) => `${s.content_type_key}(${s.ops.join('/')})`).join('、') || '—'}
      </td>
      <td className="p-2 text-xs">
        {token.revoked_at ? (
          <Badge variant="secondary">已吊销</Badge>
        ) : expired ? (
          <Badge variant="destructive">已过期</Badge>
        ) : (
          <Badge variant="default">有效至 {token.expires_at.slice(0, 10)}</Badge>
        )}
      </td>
      <td className="p-2 text-xs text-muted-foreground">
        {token.last_used_at ? token.last_used_at.slice(0, 16) : '未使用'}
      </td>
      <td className="p-2">
        {!token.revoked_at &&
          !expired &&
          (confirming ? (
            <Button variant="destructive" size="sm" onClick={() => revokeMutation.mutate()}>
              确认吊销
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              吊销
            </Button>
          ))}
      </td>
    </tr>
  )
}

export function AgentTokensPage() {
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['agent-tokens'], queryFn: listAgentTokens })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Token"
        description="供 MCP/CLI 接入的凭证：明文仅创建时展示一次，改密后自动吊销"
        actions={
          <Button onClick={() => setCreating(true)}>
            <KeyRound className="mr-1 size-4" /> 新建 Token
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2">名称</th>
              <th className="p-2">前缀</th>
              <th className="p-2">范围</th>
              <th className="p-2">状态</th>
              <th className="p-2">最近使用</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
            {!(data ?? []).length && !isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  还没有 Agent Token
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {creating && <CreateTokenDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
