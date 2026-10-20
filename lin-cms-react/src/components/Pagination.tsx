import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useMotionVariants } from '@/components/wm/motion'

export interface PaginationProps {
  /** 0-based 页码 */
  page: number
  /** 每页条数 */
  count: number
  /** 总条数 */
  total: number
  onPageChange: (page: number) => void
}

/** 分页器：显示「第 x/y 页，共 N 条」与上一页/下一页按钮（内部 page 为 0-based） */
export function Pagination({ page, count, total, onPageChange }: PaginationProps) {
  const { fadeUp } = useMotionVariants()
  const totalPages = Math.max(1, Math.ceil(total / Math.max(count, 1)))
  const current = Math.min(page + 1, totalPages)
  const hasData = total > 0
  const canPrev = hasData && current > 1
  const canNext = hasData && current < totalPages

  return (
    <motion.div variants={fadeUp} className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        第 {hasData ? current : 0}/{totalPages} 页，共 {total} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(page - 1, 0))}
        >
          <ChevronLeft />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ChevronRight />
        </Button>
      </div>
    </motion.div>
  )
}
