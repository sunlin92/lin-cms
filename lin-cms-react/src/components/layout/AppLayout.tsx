import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Sidebar, SidebarBrand, SidebarNav } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PageTransition } from '@/components/wm/PageTransition'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * 应用主布局：视口高度外壳，侧栏与主内容各自独立滚动（长页面不带走导航）。
 * 桌面端左侧弹簧折叠 Sidebar，移动端（<768px）Sheet 抽屉 + 遮罩。
 * 内容区带路由切换入场动画（Watermelon 风格 fade-up spring）；
 * Ctrl/Cmd+K 打开命令面板（路由导航，docs/ui-design-book.md 4.2）。
 */
export function AppLayout() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  // 路由切换后主内容滚动复位（设计书 5.3：独立滚动容器不归 ScrollRestoration 管）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 以 pathname 变化作为复位触发器，effect 内无需读取
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0
    }
  }, [location.pathname])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSidebarClick = () => {
    if (isMobile) {
      setMobileOpen(true)
    } else {
      setCollapsed((value) => !value)
    }
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="border-b border-sidebar-border p-0">
            <SidebarBrand />
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <SheetDescription className="sr-only">选择要前往的页面</SheetDescription>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <Topbar onSidebarClick={handleSidebarClick} />
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <PageTransition pageKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
