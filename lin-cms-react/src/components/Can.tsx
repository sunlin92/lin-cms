import type * as React from 'react'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

export interface PermissionContext {
  admin: boolean
  permissions: string[]
  can: (name: string) => boolean
}

/** 从 auth store 读取权限上下文 */
export function usePermission(): PermissionContext {
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  return {
    admin,
    permissions,
    can: (name: string) => hasPermission(permissions, admin, name),
  }
}

export interface CanProps {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** 权限可见性控制：admin 全通过，否则需具备指定权限名 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = usePermission()
  return <>{can(permission) ? children : fallback}</>
}
