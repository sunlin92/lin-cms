import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  BookPlus,
  ChevronRight,
  FolderOpen,
  ScrollText,
  UserCircle2,
  Users,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMotionVariants } from '@/components/wm/motion'
import { StatCard } from '@/components/wm/StatCard'
import { get } from '@/lib/api/client'
import type { AdminUserRow, Book, GroupBrief, LogRow, Paginated } from '@/lib/api/types'
import { formatDateTime } from '@/lib/format'
import { hasAnyPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

interface QuickLink {
  title: string
  description: string
  to: string
  icon: LucideIcon
  visible: boolean
}

/** 仪表盘：Watermelon 风格统计卡（数字滚动/斜纹/悬浮）+ 最近日志交错列表 + 快捷入口 */
export function DashboardPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  const canViewLogs = admin || permissions.includes('查询日志')

  // 图书数为公开接口，所有人可见
  const booksQuery = useQuery({
    queryKey: ['books'],
    queryFn: () => get<Book[]>('v1/book'),
    staleTime: 60_000,
  })

  // 管理员专属统计
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { page: 0, count: 1 }],
    queryFn: () => get<Paginated<AdminUserRow>>('cms/admin/users', { page: 0, count: 1 }),
    enabled: admin,
    staleTime: 60_000,
  })
  const groupsQuery = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: () => get<GroupBrief[]>('cms/admin/group/all'),
    enabled: admin,
    staleTime: 60_000,
  })

  // 日志统计：失败时整卡隐藏
  const logsTotalQuery = useQuery({
    queryKey: ['logs', 'total'],
    queryFn: () => get<Paginated<LogRow>>('cms/log', { count: 1 }),
    enabled: canViewLogs,
    staleTime: 60_000,
  })

  const recentLogsQuery = useQuery({
    queryKey: ['logs', 'recent', { count: 5 }],
    queryFn: () => get<Paginated<LogRow>>('cms/log', { count: 5 }),
    enabled: canViewLogs,
    staleTime: 60_000,
  })

  const quickLinks: QuickLink[] = [
    {
      title: '图书列表',
      description: '浏览与维护图书',
      to: '/book/list',
      icon: BookOpen,
      visible: true,
    },
    {
      title: '新增图书',
      description: '录入新图书',
      to: '/book/add',
      icon: BookPlus,
      visible: true,
    },
    {
      title: '用户列表',
      description: '管理后台用户',
      to: '/admin/user/list',
      icon: Users,
      visible: admin,
    },
    {
      title: '分组管理',
      description: '维护分组与权限',
      to: '/admin/group/list',
      icon: FolderOpen,
      visible: admin,
    },
    {
      title: '日志管理',
      description: '查看操作日志',
      to: '/log',
      icon: ScrollText,
      visible: hasAnyPermission(permissions, admin, ['查询日志', '搜索日志']),
    },
    {
      title: '个人中心',
      description: '资料与密码',
      to: '/center',
      icon: UserCircle2,
      visible: true,
    },
  ]
  const visibleLinks = quickLinks.filter((link) => link.visible)

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader title="仪表盘" description="数据总览与快捷入口" />
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="图书总数"
          icon={BookOpen}
          tone="primary"
          value={booksQuery.data ? booksQuery.data.length : null}
          loading={booksQuery.isLoading}
          error={booksQuery.isError}
          hint="公开内容库"
        />
        {admin ? (
          <>
            <StatCard
              label="用户数"
              icon={Users}
              tone="info"
              value={usersQuery.data?.total ?? null}
              loading={usersQuery.isLoading}
              error={usersQuery.isError}
              hint="非管理员账户"
            />
            <StatCard
              label="分组数"
              icon={FolderOpen}
              tone="success"
              value={groupsQuery.data ? groupsQuery.data.length : null}
              loading={groupsQuery.isLoading}
              error={groupsQuery.isError}
              hint="权限分组"
            />
          </>
        ) : null}
        {canViewLogs && !logsTotalQuery.isError ? (
          <StatCard
            label="日志条数"
            icon={ScrollText}
            tone="warning"
            value={logsTotalQuery.data?.total ?? null}
            loading={logsTotalQuery.isLoading}
            error={false}
            hint="累计行为记录"
          />
        ) : null}
      </div>

      {canViewLogs ? (
        <motion.div variants={fadeUp}>
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>最近日志</CardTitle>
              <CardDescription>最近 5 条操作记录</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLogsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-5/6" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : recentLogsQuery.isError ? (
                <p className="text-sm text-muted-foreground">日志加载失败，请稍后刷新</p>
              ) : (recentLogsQuery.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">暂无日志</p>
              ) : (
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="divide-y divide-border/60"
                >
                  {recentLogsQuery.data?.items.map((log) => (
                    <motion.li
                      key={log.id}
                      variants={fadeUp}
                      className="flex flex-col gap-1 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-card-hover/60 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{log.message}</p>
                        <p className="text-xs text-muted-foreground">{log.username}</p>
                      </div>
                      <p className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDateTime(log.time)}
                      </p>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <motion.div variants={fadeUp}>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>快捷入口</CardTitle>
            <CardDescription>常用页面导航</CardDescription>
          </CardHeader>
          <CardContent>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visibleLinks.map((link) => (
                <motion.div key={link.to} variants={fadeUp} whileHover={{ y: -3 }}>
                  <Link
                    to={link.to}
                    className="card-lift group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
                      <link.icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{link.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{link.description}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
