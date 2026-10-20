import { BookOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { NavLink } from 'react-router'
import { useMotionVariants } from '@/components/wm/motion'
import { cn } from '@/lib/utils'
import { buildMenuSections } from '@/routes'
import { useAuthStore } from '@/stores/auth'

/** 品牌区：渐变 Logo 标记 + 站名（折叠时仅标记，spring 缩放过渡） */
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  const { blurReveal } = useMotionVariants()
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
      <motion.div
        layout
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm"
      >
        <BookOpen className="size-4" />
      </motion.div>
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="brand-text"
            variants={blurReveal}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="min-w-0"
          >
            <p className="truncate text-sm font-semibold leading-tight">Lin CMS</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">内容管理平台</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export interface SidebarNavProps {
  collapsed?: boolean
  /** 移动端点击菜单后关闭抽屉 */
  onNavigate?: () => void
}

/** 侧栏菜单：分组标签 + 激活项 layoutId 滑动指示器（Watermelon 风格） */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { blurReveal } = useMotionVariants()
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  const sections = useMemo(() => buildMenuSections(permissions, admin), [permissions, admin])

  return (
    <nav aria-label="侧边导航" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.p
                key={section.id}
                variants={blurReveal}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="px-2 pb-1 text-[11px] font-medium tracking-widest text-muted-foreground/80 uppercase"
              >
                {section.label}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                title={collapsed ? item.title : undefined}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
                        className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary to-primary/85 shadow-sm"
                      />
                    ) : null}
                    {Icon ? (
                      <Icon className="relative size-4 shrink-0 transition-transform group-hover:scale-110" />
                    ) : null}
                    <AnimatePresence initial={false}>
                      {!collapsed ? (
                        <motion.span
                          key="label"
                          variants={blurReveal}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className={cn('relative truncate', isActive && 'font-medium')}
                        >
                          {item.title}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** 桌面端侧栏：spring 宽度折叠动画（280–420ms，Watermelon macos-sidebar 模式） */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 244 }}
      transition={{ type: 'spring', bounce: 0.22, duration: 0.42 }}
      className="hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
    </motion.aside>
  )
}
