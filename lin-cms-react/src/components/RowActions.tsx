import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface RowActionItem {
  key: string
  label: string
  icon?: ReactNode
  /** 危险操作（如删除）：文字用 destructive 色 */
  destructive?: boolean
  onSelect: () => void
}

export interface RowActionsProps {
  /** 移动端“更多”触发按钮的可访问名称，建议带实体（如「更多用户操作」） */
  menuLabel: string
  items: RowActionItem[]
}

/**
 * 表格行操作：桌面端（≥768px）内联按钮，移动端收纳进下拉菜单。
 * 触发按钮 44×44，满足触屏最小触达目标（docs/ui-design-book.md 5.2）。
 */
export function RowActions({ menuLabel, items }: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <div className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <Button
            key={`inline-${item.key}`}
            variant="ghost"
            size="sm"
            className={cn(item.destructive && 'text-destructive hover:text-destructive')}
            onClick={item.onSelect}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={menuLabel} className="size-11 md:hidden">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => (
            <DropdownMenuItem
              key={`menu-${item.key}`}
              className={cn(item.destructive && 'text-destructive focus:text-destructive')}
              onSelect={() => item.onSelect()}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
