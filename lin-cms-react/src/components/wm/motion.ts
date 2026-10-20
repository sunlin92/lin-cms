import type { Variants } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

/** 共享 Motion 变体：入场 fade-up + 交错容器（低回弹 spring，时长对齐 docs/ui-design-book.md 8.2） */
export const SPRING = { type: 'spring', bounce: 0.2, duration: 0.4 } as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: SPRING },
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

export const blurReveal: Variants = {
  hidden: { opacity: 0, filter: 'blur(6px)' },
  visible: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.3 } },
  exit: { opacity: 0, filter: 'blur(6px)', transition: { duration: 0.18 } },
}

/*
 * reduced-motion 降级版（设计书 8.4）：Motion 的 reducedMotion="user" 只将 transform/布局类
 * 动画改为即时，filter 与 stagger 延迟不受其管辖，需在此显式移除，仅保留极短淡入。
 */
const fadeUpReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
}

const staggerContainerReduced: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
}

const blurRevealReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export interface MotionVariants {
  fadeUp: Variants
  staggerContainer: Variants
  blurReveal: Variants
}

/** 按系统「减少动态效果」偏好返回共享变体；页面统一经此 hook 取用，替代直接引用常量 */
export function useMotionVariants(): MotionVariants {
  const reduced = useReducedMotion()
  return useMemo(
    () =>
      reduced
        ? {
            fadeUp: fadeUpReduced,
            staggerContainer: staggerContainerReduced,
            blurReveal: blurRevealReduced,
          }
        : { fadeUp, staggerContainer, blurReveal },
    [reduced],
  )
}
