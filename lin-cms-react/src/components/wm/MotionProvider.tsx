import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * 全局 Motion 配置。
 * reducedMotion="user"：用户系统开启「减少动态效果」时，Motion 自动移除位移/缩放/布局动画，
 * 仅保留淡入淡出（与 index.css 中 prefers-reduced-motion 的 CSS 降级互补）。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
