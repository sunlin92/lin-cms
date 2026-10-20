import type { PermissionTree } from '@/lib/api/types'

/** 权限差集：add = next 有而 prev 无；remove = prev 有而 next 无 */
export interface PermissionChanges {
  add: number[]
  remove: number[]
}

/**
 * 计算两组权限 id 的变化量（纯函数）。
 * 传入集合或数组均可，内部去重；返回顺序保持输入出现顺序。
 */
export function getPermissionChanges(
  next: Iterable<number>,
  prev: Iterable<number>,
): PermissionChanges {
  const nextSet = new Set(next)
  const prevSet = new Set(prev)
  const add: number[] = []
  const remove: number[] = []
  for (const id of nextSet) {
    if (!prevSet.has(id)) add.push(id)
  }
  for (const id of prevSet) {
    if (!nextSet.has(id)) remove.push(id)
  }
  return { add, remove }
}

/** 批量勾选/取消勾选一组权限 id，返回新集合（不修改入参） */
export function togglePermissions(
  current: ReadonlySet<number>,
  ids: Iterable<number>,
  selected: boolean,
): Set<number> {
  const next = new Set(current)
  for (const id of ids) {
    if (selected) {
      next.add(id)
    } else {
      next.delete(id)
    }
  }
  return next
}

/** 权限树中的权限总个数（用于空树判断与统计） */
export function countPermissions(tree: PermissionTree): number {
  return Object.values(tree).reduce((total, permissions) => total + permissions.length, 0)
}
