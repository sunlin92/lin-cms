import { describe, expect, it } from 'vitest'
import {
  countPermissions,
  getPermissionChanges,
  togglePermissions,
} from '@/features/groups/permissions'

describe('getPermissionChanges', () => {
  it('新增权限：next 多出的 id 进入 add，remove 为空', () => {
    const result = getPermissionChanges([1, 2, 3], [1, 2])
    expect(result).toEqual({ add: [3], remove: [] })
  })

  it('移除权限：prev 多出的 id 进入 remove，add 为空', () => {
    const result = getPermissionChanges([2], [1, 2, 3])
    expect(result).toEqual({ add: [], remove: [1, 3] })
  })

  it('同时新增与移除：两侧差集同时返回', () => {
    const result = getPermissionChanges([2, 5], [1, 2, 3])
    expect(result).toEqual({ add: [5], remove: [1, 3] })
  })

  it('集合无变化：add 与 remove 均为空（顺序无关）', () => {
    const result = getPermissionChanges(new Set([3, 1, 2]), new Set([1, 2, 3]))
    expect(result).toEqual({ add: [], remove: [] })
  })

  it('输入含重复 id 时按集合去重', () => {
    const result = getPermissionChanges([1, 1, 2, 2], [2])
    expect(result).toEqual({ add: [1], remove: [] })
  })

  it('空集合：全部 remove；next 全部 add', () => {
    expect(getPermissionChanges([], [1, 2])).toEqual({ add: [], remove: [1, 2] })
    expect(getPermissionChanges([1, 2], [])).toEqual({ add: [1, 2], remove: [] })
  })
})

describe('togglePermissions', () => {
  it('勾选：将 id 加入集合并返回新集合，不修改入参', () => {
    const current = new Set([1])
    const next = togglePermissions(current, [2, 3], true)
    expect([...next].sort()).toEqual([1, 2, 3])
    expect(current.has(2)).toBe(false)
  })

  it('取消勾选：将 id 移出集合', () => {
    const next = togglePermissions(new Set([1, 2, 3]), [2], false)
    expect([...next].sort()).toEqual([1, 3])
  })
})

describe('countPermissions', () => {
  it('统计权限树中全部权限个数，空树为 0', () => {
    const tree = {
      日志: [
        { id: 1, name: '查询日志', module: '日志', mount: '日志' },
        { id: 2, name: '搜索日志', module: '日志', mount: '日志' },
      ],
      图书: [{ id: 3, name: '新增图书', module: '图书', mount: '图书' }],
    }
    expect(countPermissions(tree)).toBe(3)
    expect(countPermissions({})).toBe(0)
  })
})
