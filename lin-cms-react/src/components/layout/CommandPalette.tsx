import { Search } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { buildMenuSections } from '@/routes'
import { useAuthStore } from '@/stores/auth'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PaletteCommand {
  path: string
  title: string
  section: string
}

/**
 * 命令面板（Ctrl/Cmd+K）：首期仅覆盖现有路由导航（docs/ui-design-book.md 4.2）。
 * 菜单项与侧边栏同源（buildMenuSections，权限过滤），不接入业务数据搜索。
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<PaletteCommand[]>(
    () =>
      buildMenuSections(permissions, admin).flatMap((section) =>
        section.items.map((item) => ({
          path: item.path,
          title: item.title,
          section: section.label,
        })),
      ),
    [permissions, admin],
  )

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return commands
    // 同时匹配标题与路径（如输入 book/log 也能命中），均为现有路由，无业务搜索
    return commands.filter(
      (command) =>
        command.title.toLowerCase().includes(keyword) ||
        command.path.toLowerCase().includes(keyword),
    )
  }, [commands, query])

  // 每次打开重置输入与选中项
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  // 过滤后列表变短时收敛选中下标
  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  const go = (command: PaletteCommand | undefined) => {
    if (!command) return
    onOpenChange(false)
    navigate(command.path)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        filtered.length ? (index - 1 + filtered.length) % filtered.length : 0,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(filtered[activeIndex])
    }
  }

  const activeCommand = filtered[activeIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:animate-[wm-palette-in_240ms_ease-out] data-[state=closed]:animate-[wm-palette-out_180ms_ease-in]"
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">输入页面名称快速导航</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="搜索页面，回车跳转…"
            aria-label="搜索页面"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={activeCommand ? `command-option-${activeIndex}` : undefined}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {/* 空态用 aria-live 播报且不带 listbox 角色（listbox 的合法子元素仅为 option） */}
        {filtered.length === 0 ? (
          <p aria-live="polite" className="px-3 py-6 text-center text-sm text-muted-foreground">
            没有匹配的页面
          </p>
        ) : (
          <div
            id="command-list"
            role="listbox"
            aria-label="页面列表"
            className="max-h-72 overflow-y-auto p-2"
          >
            {filtered.map((command, index) => (
              <div
                key={command.path}
                id={`command-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(command)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    go(command)
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm',
                  index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                <span>{command.title}</span>
                <span className="text-xs text-muted-foreground">{command.section}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
