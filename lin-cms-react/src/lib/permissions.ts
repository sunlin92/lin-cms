import type { PermissionEntry } from '@/lib/api/types'

/** 后端返回的分组权限结构：模块名 -> 权限数组 */
export type GroupedPermissions = Record<string, PermissionEntry[]>

/**
 * 扁平化分组权限为权限名数组（去重、保持出现顺序）。
 * [{模块: [{permission, module}]}] -> ["permission", ...]
 */
export function flattenPermissions(perms: GroupedPermissions | null | undefined): string[] {
  if (!perms) return []
  const names: string[] = []
  for (const entries of Object.values(perms)) {
    for (const entry of entries) {
      const name = entry?.permission
      if (typeof name === 'string' && name && !names.includes(name)) {
        names.push(name)
      }
    }
  }
  return names
}

/** admin 拥有全部权限；否则检查权限集合是否包含指定权限名 */
export function hasPermission(perms: string[], admin: boolean, name: string): boolean {
  if (admin) return true
  return perms.includes(name)
}

/** 权限名数组任一匹配即通过（admin 直通） */
export function hasAnyPermission(perms: string[], admin: boolean, names: string[]): boolean {
  if (admin) return true
  if (names.length === 0) return true
  return names.some((name) => perms.includes(name))
}
