import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

export interface NumberTickerProps {
  value: number
  /** 滚动时长（秒） */
  duration?: number
  className?: string
}

/** 数字滚动（count-up）：进入时从 0 平滑滚到目标值 */
export function NumberTicker({ value, duration = 1.1, className }: NumberTickerProps) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) => Math.round(latest).toLocaleString())

  useEffect(() => {
    const controls = animate(motionValue, value, { duration, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [motionValue, value, duration])

  return <motion.span className={className}>{rounded}</motion.span>
}
