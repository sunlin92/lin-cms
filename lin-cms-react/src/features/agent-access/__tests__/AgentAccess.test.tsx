import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AgentAccessPage } from '../AgentAccessPage'

describe('AgentAccessPage 接入向导', () => {
  it('生成的通用 MCP 配置可 JSON.parse 且不含真实 token', () => {
    render(
      <MemoryRouter>
        <AgentAccessPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /生成配置/ }))
    const text = (screen.getByTestId('mcp-config-json') as HTMLElement).textContent ?? ''
    const parsed = JSON.parse(text) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>
    }
    const server = parsed.mcpServers['lin-cms']
    expect(server.command).toBe('lin-cms')
    expect(server.args).toContain('mcp')
    expect(text).not.toMatch(/lin_agent_[A-Za-z0-9_-]+/)
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 断言占位符存在（非模板字符串）
    expect(text).toContain('${LIN_CMS_AGENT_TOKEN}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 断言占位符存在（非模板字符串）
    expect(text).toContain('${LIN_CMS_BASE_URL}')
  })

  it('远程方式展示 HTTPS /mcp 端点说明', () => {
    render(
      <MemoryRouter>
        <AgentAccessPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /远程/ }))
    expect(screen.getByText(/\/mcp/)).toBeTruthy()
    expect(screen.getAllByText(/HTTPS/).length).toBeGreaterThan(0)
  })
})
