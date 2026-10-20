import { Copy, Globe, Terminal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'

type Mode = 'local' | 'remote'

/** 通用 MCP 客户端配置片段：不含任何真实凭证，只引用环境变量占位符 */
function buildMcpConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        'lin-cms': {
          command: 'lin-cms',
          args: ['mcp'],
          env: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: 客户端环境变量占位符（非模板字符串）
            LIN_CMS_BASE_URL: '${LIN_CMS_BASE_URL}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: 客户端环境变量占位符（非模板字符串）
            LIN_CMS_AGENT_TOKEN: '${LIN_CMS_AGENT_TOKEN}',
          },
        },
      },
    },
    null,
    2,
  )
}

export function AgentAccessPage() {
  const [mode, setMode] = useState<Mode>('local')
  const [config, setConfig] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 接入"
        description="三步接入：拿到 Token → 选择接入方式 → 在客户端配置"
      />

      <section className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">第 1 步：创建 Agent Token</h3>
        <p className="text-sm text-muted-foreground">
          在
          <Link className="mx-1 underline" to="/profile/agent-tokens">
            Agent Token 页
          </Link>
          创建凭证：明文仅展示一次，范围按你的内容能力勾选，默认 90 天有效。
        </p>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">第 2 步：选择接入方式</h3>
        <div className="flex gap-2">
          <Button
            variant={mode === 'local' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('local')}
          >
            <Terminal className="mr-1 size-4" /> 本机（CLI stdio）
          </Button>
          <Button
            variant={mode === 'remote' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('remote')}
          >
            <Globe className="mr-1 size-4" /> 远程（HTTPS）
          </Button>
        </div>
        {mode === 'local' ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>下载对应平台的 lin-cms CLI 单文件程序（见项目发布页与校验和）</li>
            <li>
              运行 <code>lin-cms init</code>：输入 CMS 地址与 Agent Token，凭证存入系统钥匙串
            </li>
            <li>
              运行 <code>lin-cms test</code> 验证连通性与只读能力
            </li>
            <li>
              运行 <code>lin-cms config</code> 输出客户端配置（不含明文 Token）
            </li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              在支持 Streamable HTTP 的 MCP 客户端配置端点：<code>https://你的域名/mcp</code>
              （生产必须 HTTPS）
            </li>
            <li>认证方式填 Bearer Token，值为你的 Agent Token（lin_agent_ 前缀）</li>
            <li>浏览器登录 JWT 不能用于 MCP；Token 吊销或改密后立即失效</li>
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">第 3 步：通用客户端配置</h3>
        <p className="text-sm text-muted-foreground">
          占位符 <code>${'{LIN_CMS_AGENT_TOKEN}'}</code> 与 <code>${'{LIN_CMS_BASE_URL}'}</code>{' '}
          需在客户端进程环境中设置；不同客户端的变量展开规则不同，本片段只保证协议形态。
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setConfig(buildMcpConfig())}>
            生成配置
          </Button>
          {config && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(config)
                toast.success('已复制')
              }}
            >
              <Copy className="mr-1 size-4" /> 复制
            </Button>
          )}
        </div>
        {config && (
          <pre
            data-testid="mcp-config-json"
            className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs"
          >
            {config}
          </pre>
        )}
      </section>

      <section className="space-y-1 rounded-lg border p-4">
        <h3 className="font-medium">常见问题</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>401：Token 过期/吊销，或粘贴时丢失前缀 lin_agent_</li>
          <li>403：当前账号未被授予该内容类型的操作权限（Token 范围是其子集）</li>
          <li>改密后所有 Token 自动吊销，需要重新创建</li>
        </ul>
      </section>
    </div>
  )
}
