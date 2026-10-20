import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  BookPlus,
  FolderOpen,
  FolderPlus,
  Info,
  KeyRound,
  LayoutDashboard,
  PlugZap,
  ScrollText,
  ShieldCheck,
  UserCircle2,
  UserSquare2,
  Users,
} from 'lucide-react'
import type * as React from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { AboutPage } from '@/features/about/AboutPage'
import { AgentAuditPage } from '@/features/admin-audit/AgentAuditPage'
import { AgentAccessPage } from '@/features/agent-access/AgentAccessPage'
import { AgentTokensPage } from '@/features/agent-tokens/AgentTokensPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { BookFormPage } from '@/features/books/BookFormPage'
import { BookListPage } from '@/features/books/BookListPage'
import { ContentRecordListPage } from '@/features/content/ContentRecordListPage'
import { ContentWorkspacePage } from '@/features/content/ContentWorkspacePage'
import { ContentTypeListPage } from '@/features/content-types/ContentTypeListPage'
import {
  ContentTypeEditPage,
  ContentTypeWizardPage,
} from '@/features/content-types/ContentTypeWizardPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { NotFoundPage } from '@/features/errors/NotFoundPage'
import { GroupContentPermissionPage } from '@/features/groups/GroupContentPermissionPage'
import { GroupCreatePage } from '@/features/groups/GroupCreatePage'
import { GroupListPage } from '@/features/groups/GroupListPage'
import { GroupPermissionPage } from '@/features/groups/GroupPermissionPage'
import { LogPage } from '@/features/logs/LogPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { UserCreatePage } from '@/features/users/UserCreatePage'
import { UserListPage } from '@/features/users/UserListPage'
import { getAccessToken } from '@/lib/auth/tokens'
import { hasAnyPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

/* ------------------------------ 路由配置（单一来源） ------------------------------ */

export type RouteSectionId = 'overview' | 'content' | 'system' | 'admin'

export interface RouteMeta {
  title: string
  icon?: LucideIcon
  /** 满足任一权限即可访问/显示；admin 直通 */
  permission?: string[]
  section?: RouteSectionId
  /** 是否出现在侧边栏菜单（默认 true） */
  menu?: boolean
}

export interface AppRouteConfig {
  path: string
  meta: RouteMeta
  element: React.ReactNode
}

export const SECTION_ORDER: RouteSectionId[] = ['overview', 'content', 'system', 'admin']

export const SECTION_LABELS: Record<RouteSectionId, string> = {
  overview: '总览',
  content: '图书管理',
  system: '系统',
  admin: '权限管理',
}

/** 全部业务页面路由（Sidebar 菜单与路由表同源，保证一致） */
export const routeConfigs: AppRouteConfig[] = [
  {
    path: '/dashboard',
    meta: { title: '仪表盘', icon: LayoutDashboard, section: 'overview' },
    element: <DashboardPage />,
  },
  {
    path: '/about',
    meta: { title: '关于', icon: Info, section: 'overview' },
    element: <AboutPage />,
  },
  {
    path: '/log',
    meta: {
      title: '日志管理',
      icon: ScrollText,
      section: 'system',
      permission: ['查询日志', '搜索日志'],
    },
    element: <LogPage />,
  },
  {
    path: '/center',
    meta: { title: '个人中心', icon: UserCircle2, section: 'system', menu: false },
    element: <ProfilePage />,
  },
  {
    path: '/book/list',
    meta: { title: '图书列表', icon: BookOpen, section: 'content' },
    element: <BookListPage />,
  },
  {
    path: '/book/add',
    meta: { title: '新增图书', icon: BookPlus, section: 'content' },
    element: <BookFormPage />,
  },
  {
    path: '/book/edit/:id',
    meta: { title: '编辑图书', icon: BookPlus, section: 'content', menu: false },
    element: <BookFormPage />,
  },
  {
    path: '/content',
    meta: { title: '内容工作区', icon: FolderOpen, section: 'content' },
    element: <ContentWorkspacePage />,
  },
  {
    path: '/content/:typeKey',
    meta: { title: '内容记录', icon: FolderOpen, section: 'content', menu: false },
    element: <ContentRecordListPage />,
  },
  {
    path: '/agent-access',
    meta: { title: 'Agent 接入', icon: PlugZap, section: 'overview' },
    element: <AgentAccessPage />,
  },
  {
    path: '/profile/agent-tokens',
    meta: { title: 'Agent Token', icon: KeyRound, section: 'system' },
    element: <AgentTokensPage />,
  },
  {
    path: '/admin/agent-audit',
    meta: {
      title: 'Agent 审计',
      icon: ShieldCheck,
      section: 'admin',
      permission: ['超级管理员独有权限'],
    },
    element: <AgentAuditPage />,
  },
  {
    path: '/admin/content-types',
    meta: {
      title: '内容类型',
      icon: FolderOpen,
      section: 'admin',
      permission: ['超级管理员独有权限'],
    },
    element: <ContentTypeListPage />,
  },
  {
    path: '/admin/content-types/new',
    meta: {
      title: '新建内容类型',
      icon: FolderPlus,
      section: 'admin',
      menu: false,
      permission: ['超级管理员独有权限'],
    },
    element: <ContentTypeWizardPage />,
  },
  {
    path: '/admin/content-types/:typeId/edit',
    meta: {
      title: '编辑内容类型',
      icon: FolderPlus,
      section: 'admin',
      menu: false,
      permission: ['超级管理员独有权限'],
    },
    element: <ContentTypeEditPage />,
  },
  {
    path: '/admin/user/list',
    meta: { title: '用户列表', icon: Users, section: 'admin', permission: ['超级管理员独有权限'] },
    element: <UserListPage />,
  },
  {
    path: '/admin/user/add',
    meta: {
      title: '添加用户',
      icon: UserSquare2,
      section: 'admin',
      permission: ['超级管理员独有权限'],
    },
    element: <UserCreatePage />,
  },
  {
    path: '/admin/group/list',
    meta: {
      title: '分组管理',
      icon: FolderOpen,
      section: 'admin',
      permission: ['超级管理员独有权限'],
    },
    element: <GroupListPage />,
  },
  {
    path: '/admin/group/add',
    meta: {
      title: '新增分组',
      icon: FolderPlus,
      section: 'admin',
      permission: ['超级管理员独有权限'],
    },
    element: <GroupCreatePage />,
  },
  {
    path: '/admin/groups/:groupId/content-permissions',
    meta: {
      title: '分组内容权限',
      icon: FolderOpen,
      section: 'admin',
      menu: false,
      permission: ['超级管理员独有权限'],
    },
    element: <GroupContentPermissionPage />,
  },
  {
    path: '/admin/group/edit/:id',
    meta: {
      title: '编辑分组',
      icon: FolderPlus,
      section: 'admin',
      menu: false,
      permission: ['超级管理员独有权限'],
    },
    element: <GroupPermissionPage />,
  },
]

/* --------------------------------- 菜单构建 --------------------------------- */

export interface MenuItem {
  path: string
  title: string
  icon?: LucideIcon
}

export interface MenuSection {
  id: RouteSectionId
  label: string
  items: MenuItem[]
}

/** 按权限过滤路由配置并生成侧边栏菜单分区 */
export function buildMenuSections(permissions: string[], admin: boolean): MenuSection[] {
  return SECTION_ORDER.map((id) => ({
    id,
    label: SECTION_LABELS[id],
    items: routeConfigs
      .filter((route) => route.meta.section === id && route.meta.menu !== false)
      .filter(
        (route) =>
          !route.meta.permission || hasAnyPermission(permissions, admin, route.meta.permission),
      )
      .map((route) => ({ path: route.path, title: route.meta.title, icon: route.meta.icon })),
  })).filter((section) => section.items.length > 0)
}

/* ---------------------------------- 守卫 ---------------------------------- */

/** 未登录（无 accessToken）跳转 /login；已登录渲染主布局（内含 Outlet） */
function RequireAuth() {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />
  }
  return <AppLayout />
}

/** 已登录访问 /login 时重定向 /dashboard */
function GuestGuard({ children }: { children: React.ReactNode }) {
  if (getAccessToken()) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

/** meta.permission 校验：admin 直通，否则任一权限匹配；不通过跳 /404 */
function PermissionRoute({ meta, children }: { meta: RouteMeta; children: React.ReactNode }) {
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  if (!meta.permission || hasAnyPermission(permissions, admin, meta.permission)) {
    return children
  }
  return <Navigate to="/404" replace />
}

/* --------------------------------- 路由表 --------------------------------- */

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter([
    {
      path: '/login',
      element: (
        <GuestGuard>
          <LoginPage />
        </GuestGuard>
      ),
    },
    {
      path: '/',
      handle: { title: '首页' },
      element: <RequireAuth />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        ...routeConfigs.map((route) => ({
          path: route.path,
          handle: { title: route.meta.title },
          element: <PermissionRoute meta={route.meta}>{route.element}</PermissionRoute>,
        })),
      ],
    },
    { path: '/404', element: <NotFoundPage /> },
    { path: '*', element: <Navigate to="/404" replace /> },
  ])
}
