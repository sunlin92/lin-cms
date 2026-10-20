import { render, renderHook } from '@testing-library/react'
import { MotionConfigContext, useReducedMotion } from 'motion/react'
import { useContext } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MotionProvider } from '@/components/wm/MotionProvider'

/** 以指定偏好打桩 matchMedia（jsdom 默认桩固定 matches:false，无法模拟减少动效） */
function stubMatchMedia(reducedMotion: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

/** 读取 MotionConfigContext.reducedMotion 的探针组件 */
function MotionConfigProbe() {
  const { reducedMotion } = useContext(MotionConfigContext)
  return <p data-testid="motion-config">{reducedMotion ?? 'undefined'}</p>
}

describe('MotionProvider', () => {
  it('全局 Motion 配置 reducedMotion="user"（遵循系统「减少动态效果」偏好）', () => {
    const { getByTestId } = render(
      <MotionProvider>
        <MotionConfigProbe />
      </MotionProvider>,
    )
    expect(getByTestId('motion-config').textContent).toBe('user')
  })

  it('系统开启「减少动态效果」时，useReducedMotion 感知该偏好', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion(), { wrapper: MotionProvider })
    expect(result.current).toBe(true)
  })

  it('未开启偏好时正常挂载子元素（动画配置不阻断渲染）', () => {
    stubMatchMedia(false)
    const { container } = render(
      <MotionProvider>
        <p>内容</p>
      </MotionProvider>,
    )
    expect(container.textContent).toBe('内容')
  })
})
