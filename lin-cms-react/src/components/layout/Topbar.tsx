import { Check, LogOut, Menu, Moon, Palette, Sun, UserCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { post } from '@/lib/api/client'
import { clearAuthStorage } from '@/lib/auth/tokens'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { THEME_PRESETS, useThemeStore } from '@/stores/theme'

export interface TopbarProps {
  /** 折叠按钮点击：桌面端切换折叠，移动端打开抽屉 */
  onSidebarClick: () => void
}

function ThemeMenu() {
  const themeId = useThemeStore((state) => state.themeId)
  const isDark = useThemeStore((state) => state.isDark)
  const setTheme = useThemeStore((state) => state.setTheme)
  const toggleDark = useThemeStore((state) => state.toggleDark)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="max-md:h-11 max-md:w-11"
          aria-label="切换主题"
        >
          <Palette />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>主题预设</DropdownMenuLabel>
        {THEME_PRESETS.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => setTheme(preset.id)}>
            <span
              aria-hidden
              className={cn('size-3.5 shrink-0 rounded-full border border-border', preset.swatch)}
            />
            {preset.label}
            {preset.id === themeId ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleDark}>
          {isDark ? <Sun /> : <Moon />}
          {isDark ? '切换浅色模式' : '切换深色模式'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const nickname = user?.nickname || user?.username || ''
  const fallbackText = nickname.slice(0, 1).toUpperCase() || 'U'

  const handleLogout = async () => {
    try {
      await post('cms/user/logout')
    } catch {
      // 登出接口失败不阻塞本地登出
    }
    clearAuthStorage()
    useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="用户菜单"
          className="flex size-9 items-center justify-center rounded-full transition-transform max-md:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar>
            {user?.avatar ? <AvatarImage src={user.avatar} alt={nickname} /> : null}
            <AvatarFallback>{fallbackText}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="truncate">{nickname}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/center')}>
          <UserCircle2 />
          个人中心
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleLogout()}>
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 顶栏：固定于内容滚动区上方（毛玻璃背景）；移动端按钮加大到 44px 触达目标 */
export function Topbar({ onSidebarClick }: TopbarProps) {
  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/75 px-4 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon"
        className="max-md:h-11 max-md:w-11"
        onClick={onSidebarClick}
        aria-label="切换侧边栏"
      >
        <Menu />
      </Button>
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeMenu />
        <UserMenu />
      </div>
    </header>
  )
}
