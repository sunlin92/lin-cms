import { renderHook } from '@testing-library/react'
import type { TargetAndTransition, Transition, Variants } from 'motion/react'
import { describe, expect, it, vi } from 'vitest'

/** 从 stagger 容器变体中取交错延迟（visible 为 resolver 时视为异常） */
function staggerDelayOf(container: Variants): Transition | undefined {
  const visible = container.visible
  if (typeof visible === 'function') {
    throw new Error('staggerContainer.visible 不应为 resolver')
  }
  return (visible as TargetAndTransition).transition
}

/*
 * useMotionVariants 的契约：依据 useReducedMotion 的返回值选择降级/常规变体。
 * 媒体查询 → useReducedMotion 的链路由 MotionProvider.test.tsx 覆盖，此处 mock 该钩子
 * 以绕开 motion/react 对偏好的模块级缓存（同文件内无法先后模拟两种系统偏好）。
 */
const reducedMotionState = { value: false }

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return {
    ...actual,
    useReducedMotion: () => reducedMotionState.value,
  }
})

import { useMotionVariants } from '@/components/wm/motion'

describe('useMotionVariants（设计书 8.4 减少动态效果降级）', () => {
  it('默认偏好：保留位移、模糊与交错入场', () => {
    reducedMotionState.value = false
    const { result } = renderHook(() => useMotionVariants())

    expect(result.current.fadeUp.hidden).toHaveProperty('y')
    expect(result.current.blurReveal.hidden).toHaveProperty('filter')
    expect(staggerDelayOf(result.current.staggerContainer)?.staggerChildren).toBe(0.07)
  })

  it('开启减少动态效果：移除位移与模糊，交错延迟归零', () => {
    reducedMotionState.value = true
    const { result } = renderHook(() => useMotionVariants())

    expect(result.current.fadeUp.hidden).not.toHaveProperty('y')
    expect(result.current.fadeUp.visible).not.toHaveProperty('y')
    expect(result.current.blurReveal.hidden).not.toHaveProperty('filter')
    expect(staggerDelayOf(result.current.staggerContainer)?.staggerChildren).toBe(0)
    expect(staggerDelayOf(result.current.staggerContainer)?.delayChildren).toBe(0)
  })
})
