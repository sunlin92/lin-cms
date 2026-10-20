import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { motion } from 'motion/react'
import { useMotionVariants } from '@/components/wm/motion'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: LucideIcon
}

/** 空状态占位：大号渐变图标容器 + fadeUp 入场（依赖父级 stagger 容器时可交错） */
export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  const { fadeUp } = useMotionVariants()
  return (
    <motion.div
      variants={fadeUp}
      className="flex flex-col items-center justify-center gap-3 py-10 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-info/10 text-primary">
        <Icon className="size-7" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </motion.div>
  )
}
