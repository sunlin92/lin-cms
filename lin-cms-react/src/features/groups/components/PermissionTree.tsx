import { motion } from 'motion/react'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useMotionVariants } from '@/components/wm/motion'
import { countPermissions, togglePermissions } from '@/features/groups/permissions'
import type { PermissionTree as PermissionTreeData } from '@/lib/api/types'
import { cn } from '@/lib/utils'

export interface PermissionTreeProps {
  /** 模块名 -> 权限数组（来自 GET cms/admin/permission） */
  tree: PermissionTreeData
  /** 已选中的权限 id 集合 */
  value: ReadonlySet<number>
  onChange: (next: Set<number>) => void
  disabled?: boolean
}

const INDETERMINATE_CLASS =
  'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground'

/**
 * 权限树：模块卡片 + 勾选数量徽章。
 * 模块行支持全选/半选（indeterminate），条目 hover 过渡，勾选单个权限即时回调新集合。
 */
export function PermissionTree({ tree, value, onChange, disabled = false }: PermissionTreeProps) {
  const { fadeUp } = useMotionVariants()
  const modules = Object.entries(tree)

  if (countPermissions(tree) === 0) {
    return (
      <div className="rounded-xl border border-border/60">
        <EmptyState title="暂无权限数据" description="后端未返回可用权限" />
      </div>
    )
  }

  return (
    <div className="max-h-96 space-y-3 overflow-auto pr-1">
      {modules.map(([moduleName, permissions], moduleIndex) => {
        const moduleIds = permissions.map((permission) => permission.id)
        const selectedCount = moduleIds.filter((id) => value.has(id)).length
        const allChecked = moduleIds.length > 0 && selectedCount === moduleIds.length
        const someChecked = selectedCount > 0 && !allChecked
        return (
          <motion.div
            key={moduleName}
            variants={fadeUp}
            className="rounded-xl border border-border/60 bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id={`module-${moduleIndex}`}
                className={INDETERMINATE_CLASS}
                checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                onCheckedChange={(checked) =>
                  onChange(togglePermissions(value, moduleIds, checked === true))
                }
                disabled={disabled}
              />
              <label
                htmlFor={`module-${moduleIndex}`}
                className="cursor-pointer text-sm font-medium"
              >
                {moduleName}
              </label>
              <Badge
                variant={allChecked ? 'default' : 'secondary'}
                className="ml-auto tabular-nums"
              >
                {selectedCount}/{moduleIds.length}
              </Badge>
            </div>
            <div className="mt-3 grid gap-1.5 pl-6 sm:grid-cols-2">
              {permissions.map((permission) => (
                <label
                  key={permission.id}
                  htmlFor={`permission-${permission.id}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-card-hover/60',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <Checkbox
                    id={`permission-${permission.id}`}
                    checked={value.has(permission.id)}
                    onCheckedChange={(checked) =>
                      onChange(togglePermissions(value, [permission.id], checked === true))
                    }
                    disabled={disabled}
                  />
                  <span>{permission.name}</span>
                </label>
              ))}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
