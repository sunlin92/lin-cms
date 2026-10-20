import * as React from 'react'

const DESKTOP_BREAKPOINT = 768

/** 是否为移动端视口（< 768px） */
export function useIsMobile(breakpoint: number = DESKTOP_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
  )

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}
