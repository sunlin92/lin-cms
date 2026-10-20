import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export interface PageTransitionProps {
  /** 以路由 pathname 作为 key，触发切页入场动画 */
  pageKey: string
  children: ReactNode
}

/** 路由切换入场：轻 fade + 上移（260–380ms 低回弹 spring，不阻塞交互，纯装饰） */
export function PageTransition({ pageKey, children }: PageTransitionProps) {
  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.18, duration: 0.36 }}
    >
      {children}
    </motion.div>
  )
}
