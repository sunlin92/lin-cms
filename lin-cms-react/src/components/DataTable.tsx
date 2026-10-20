import type { Variants } from 'motion/react'
import { motion } from 'motion/react'
import type * as React from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THeader, TR } from '@/components/ui/table'

export interface DataTableColumn<T> {
  key: string
  header: React.ReactNode
  render?: (row: T) => React.ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  loading?: boolean
  emptyText?: string
  rowKey: keyof T | ((row: T, index: number) => string)
  /** 可选行入场变体：传入后数据行以 motion 行渲染（配合页面级 stagger 容器交错入场） */
  rowMotion?: Variants
}

/** motion 包装的表格行：保留 tr 语义（role/行内按钮可访问性不变） */
const MotionTR = motion.create(TR)

/** 数据行 hover 态（token 派生，覆盖 TR 默认 hover:bg-muted/50） */
const ROW_HOVER_CLASS = 'hover:bg-card-hover/60'

function resolveRowKey<T>(row: T, index: number, rowKey: DataTableProps<T>['rowKey']): string {
  if (typeof rowKey === 'function') return rowKey(row, index)
  const value = row[rowKey]
  return String(value)
}

const SKELETON_ROW_KEYS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5']

/** 通用数据表格：加载骨架屏 + 空状态 + 可选行入场动画 */
export function DataTable<T>({
  columns,
  rows,
  loading = false,
  emptyText = '暂无数据',
  rowKey,
  rowMotion,
}: DataTableProps<T>) {
  const renderCells = (row: T) =>
    columns.map((column) => (
      <TD key={column.key} className={column.className}>
        {column.render ? column.render(row) : String(row[column.key as keyof T] ?? '')}
      </TD>
    ))

  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <Table>
        <THeader>
          <TR className="hover:bg-transparent">
            {columns.map((column) => (
              <TH key={column.key} className={column.className}>
                {column.header}
              </TH>
            ))}
          </TR>
        </THeader>
        <TBody>
          {loading ? (
            SKELETON_ROW_KEYS.map((skeletonKey) => (
              <TR key={`skeleton-${skeletonKey}`} className={ROW_HOVER_CLASS}>
                {columns.map((column) => (
                  <TD key={column.key} className={column.className}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TD>
                ))}
              </TR>
            ))
          ) : rows.length === 0 ? (
            <TR className="hover:bg-transparent">
              <TD colSpan={columns.length}>
                <EmptyState title={emptyText} />
              </TD>
            </TR>
          ) : (
            rows.map((row, index) => {
              const key = resolveRowKey(row, index, rowKey)
              return rowMotion ? (
                <MotionTR key={key} variants={rowMotion} className={ROW_HOVER_CLASS}>
                  {renderCells(row)}
                </MotionTR>
              ) : (
                <TR key={key} className={ROW_HOVER_CLASS}>
                  {renderCells(row)}
                </TR>
              )
            })
          )}
        </TBody>
      </Table>
    </div>
  )
}
