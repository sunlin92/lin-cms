import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { Link, useMatches } from 'react-router'

interface TitleHandle {
  title: string
}

function hasTitle(handle: unknown): handle is TitleHandle {
  return (
    handle !== null &&
    typeof handle === 'object' &&
    typeof (handle as { title?: unknown }).title === 'string'
  )
}

interface Crumb {
  id: string
  pathname: string
  title: string
}

function collectCrumbs(matches: ReturnType<typeof useMatches>): Crumb[] {
  return matches
    .map((match) => ({ id: match.id, pathname: match.pathname, handle: match.handle }))
    .filter((item): item is { id: string; pathname: string; handle: TitleHandle } =>
      hasTitle(item.handle),
    )
    .map((item) => ({ id: item.id, pathname: item.pathname, title: item.handle.title }))
}

/** 面包屑：由当前路由链上的 handle.title 生成 */
export function Breadcrumbs() {
  const crumbs = collectCrumbs(useMatches())

  if (crumbs.length === 0) return null

  return (
    <nav
      aria-label="面包屑"
      className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <Fragment key={crumb.id}>
            {index > 0 ? <ChevronRight className="size-3.5 shrink-0" /> : null}
            {isLast ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {crumb.title}
              </span>
            ) : (
              <Link
                to={crumb.pathname}
                className="truncate transition-colors hover:text-foreground"
              >
                {crumb.title}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
