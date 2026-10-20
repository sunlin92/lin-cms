import { describe, expect, it } from 'vitest'
import { flattenPermissions, hasAnyPermission, hasPermission } from '@/lib/permissions'

describe('flattenPermissions', () => {
  it('将分组权限结构扁平化为权限名数组', () => {
    const grouped = {
      日志: [
        { permission: '查询日志', module: '日志' },
        { permission: '查询所有日志', module: '日志' },
      ],
      用户: [{ permission: '查看所有用户', module: '用户' }],
    }
    expect(flattenPermissions(grouped)).toEqual(['查询日志', '查询所有日志', '查看所有用户'])
  })

  it('去重同名权限并保持出现顺序', () => {
    const grouped = {
      图书: [{ permission: '新增图书', module: '图书' }],
      内容: [
        { permission: '新增图书', module: '内容' },
        { permission: '删除图书', module: '内容' },
      ],
    }
    expect(flattenPermissions(grouped)).toEqual(['新增图书', '删除图书'])
  })

  it('空对象 / null / undefined 返回空数组', () => {
    expect(flattenPermissions({})).toEqual([])
    expect(flattenPermissions(null)).toEqual([])
    expect(flattenPermissions(undefined)).toEqual([])
  })

  it('忽略空 permission 字段的条目', () => {
    const grouped = {
      混合: [
        { permission: '有效权限', module: 'x' },
        { permission: '', module: 'y' },
      ],
    }
    expect(flattenPermissions(grouped)).toEqual(['有效权限'])
  })
})

describe('hasPermission', () => {
  it('admin 拥有全部权限', () => {
    expect(hasPermission([], true, '任意权限')).toBe(true)
  })

  it('非 admin 按权限集合判断', () => {
    expect(hasPermission(['查询日志'], false, '查询日志')).toBe(true)
    expect(hasPermission(['查询日志'], false, '删除日志')).toBe(false)
  })
})

describe('hasAnyPermission', () => {
  it('权限名数组任一匹配即通过', () => {
    expect(hasAnyPermission(['查询日志'], false, ['查询所有日志', '查询日志'])).toBe(true)
    expect(hasAnyPermission(['其他'], false, ['查询日志', '查询所有日志'])).toBe(false)
  })

  it('空权限名数组视为无门槛', () => {
    expect(hasAnyPermission([], false, [])).toBe(true)
  })

  it('admin 直通', () => {
    expect(hasAnyPermission([], true, ['查询日志'])).toBe(true)
  })
})
