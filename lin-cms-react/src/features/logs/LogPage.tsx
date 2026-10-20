import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Loader2, Search, ShieldAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { type FormEvent, useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMotionVariants } from '@/components/wm/motion'
import { splitHighlight, toRangeEnd, toRangeStart } from '@/features/logs/highlight'
import type { QueryParams } from '@/lib/api/client'
import { get } from '@/lib/api/client'
import type { LogRow, Paginated } from '@/lib/api/types'
import { formatDateTime } from '@/lib/format'
import { hasAnyPermission, hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

const PERM_QUERY_LOG = '查询日志'
const PERM_SEARCH_LOG = '搜索日志'
const PERM_LOG_USERS = '查询日志记录的用户'

/** 人员筛选的“全部”哨兵值（Radix Select 不允许空字符串 value） */
const ALL_USERS = '__all__'
const PAGE_SIZE = 10

interface LogFilters {
  name: string
  start: string
  end: string
}

/** 日志无限滚动查询：搜索态走 search 端点，否则普通分页 */
function useLogRows(filters: LogFilters, searching: boolean, keyword: string) {
  const logsQuery = useInfiniteQuery({
    queryKey: ['logs', searching, keyword, filters.name, filters.start, filters.end],
    queryFn: ({ pageParam }) => {
      const query: QueryParams = {
        page: pageParam,
        count: PAGE_SIZE,
        name: filters.name,
        start: filters.start,
        end: filters.end,
      }
      if (searching) query.keyword = keyword
      return get<Paginated<LogRow>>(searching ? 'cms/log/search' : 'cms/log', query)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length
      const totalPages = lastPage.total_page || Math.ceil(lastPage.total / PAGE_SIZE)
      return nextPage < totalPages ? nextPage : undefined
    },
  })
  return {
    logsQuery,
    rows: logsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    total: logsQuery.data?.pages[0]?.total ?? 0,
    errorMessage: logsQuery.error instanceof Error ? logsQuery.error.message : '',
  }
}

export function LogPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const admin = useAuthStore((state) => state.admin)
  const permissions = useAuthStore((state) => state.permissions)
  // 双保险：路由已按权限拦截，无任一日志权限时页面自身兜底
  const canView = hasAnyPermission(permissions, admin, [PERM_QUERY_LOG, PERM_SEARCH_LOG])
  if (!canView) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <PageHeader title="日志管理" />
        </motion.div>
        <EmptyState
          icon={ShieldAlert}
          title="无访问权限"
          description="您没有查看日志的权限，请联系管理员开通。"
        />
      </motion.div>
    )
  }
  return (
    <LogPageView
      canSearch={hasPermission(permissions, admin, PERM_SEARCH_LOG)}
      canQueryUsers={hasPermission(permissions, admin, PERM_LOG_USERS)}
    />
  )
}

function LogPageView({ canSearch, canQueryUsers }: { canSearch: boolean; canQueryUsers: boolean }) {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [username, setUsername] = useState(ALL_USERS)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const searching = keyword !== ''
  const filters = useMemo(
    () => ({
      name: username === ALL_USERS ? '' : username,
      start: toRangeStart(startDate),
      end: toRangeEnd(endDate),
    }),
    [username, startDate, endDate],
  )

  const usersQuery = useQuery({
    queryKey: ['log-users'],
    queryFn: () => get<{ items: string[] }>('cms/log/users'),
    enabled: canQueryUsers,
  })

  const { logsQuery, rows, total, errorMessage } = useLogRows(filters, searching, keyword)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setKeyword(keywordInput.trim())
  }

  const clearSearch = () => {
    setKeyword('')
    setKeywordInput('')
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader title="日志管理" description="查看系统操作日志" />
      </motion.div>
      <motion.div variants={fadeUp}>
        <LogFilterBar
          canSearch={canSearch}
          canQueryUsers={canQueryUsers}
          users={usersQuery.data?.items ?? []}
          keywordInput={keywordInput}
          onKeywordInputChange={setKeywordInput}
          username={username}
          onUsernameChange={setUsername}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          onSubmit={submitSearch}
        />
      </motion.div>
      <LogResults
        rows={rows}
        total={total}
        isLoading={logsQuery.isLoading}
        isError={logsQuery.isError}
        errorMessage={errorMessage}
        searching={searching}
        keyword={keyword}
        hasNextPage={logsQuery.hasNextPage}
        isFetchingNextPage={logsQuery.isFetchingNextPage}
        onLoadMore={() => logsQuery.fetchNextPage()}
        onClearSearch={clearSearch}
      />
    </motion.div>
  )
}

interface LogFilterBarProps {
  canSearch: boolean
  canQueryUsers: boolean
  users: string[]
  keywordInput: string
  onKeywordInputChange: (value: string) => void
  username: string
  onUsernameChange: (value: string) => void
  startDate: string
  onStartDateChange: (value: string) => void
  endDate: string
  onEndDateChange: (value: string) => void
}

interface LogResultsProps {
  rows: LogRow[]
  total: number
  isLoading: boolean
  isError: boolean
  errorMessage: string
  searching: boolean
  keyword: string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  onClearSearch: () => void
}

function LogFilterBar(
  props: LogFilterBarProps & { onSubmit: (event: FormEvent<HTMLFormElement>) => void },
) {
  return (
    <form
      onSubmit={props.onSubmit}
      className="flex flex-wrap items-end gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm"
    >
      {props.canSearch ? (
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor="log-keyword">关键字</Label>
          <div className="flex gap-2">
            <Input
              id="log-keyword"
              className="w-full sm:w-56"
              placeholder="输入日志关键字，回车搜索"
              value={props.keywordInput}
              onChange={(event) => props.onKeywordInputChange(event.target.value)}
            />
            <Button type="submit" variant="secondary" className="shrink-0">
              <Search />
              搜索
            </Button>
          </div>
        </div>
      ) : null}
      {props.canQueryUsers ? (
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label>人员</Label>
          <Select value={props.username} onValueChange={props.onUsernameChange}>
            <SelectTrigger className="w-full sm:w-40" aria-label="筛选人员">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_USERS}>全部人员</SelectItem>
              {props.users.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label htmlFor="log-start">开始日期</Label>
        <Input
          id="log-start"
          type="date"
          className="w-full sm:w-44"
          value={props.startDate}
          onChange={(event) => props.onStartDateChange(event.target.value)}
        />
      </div>
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label htmlFor="log-end">结束日期</Label>
        <Input
          id="log-end"
          type="date"
          className="w-full sm:w-44"
          value={props.endDate}
          onChange={(event) => props.onEndDateChange(event.target.value)}
        />
      </div>
    </form>
  )
}

function LogResults(props: LogResultsProps) {
  const { fadeUp } = useMotionVariants()
  const columns: DataTableColumn<LogRow>[] = [
    {
      key: 'message',
      header: '内容',
      render: (row) => (
        <HighlightText text={row.message} keyword={props.searching ? props.keyword : ''} />
      ),
    },
    { key: 'username', header: '人员', className: 'whitespace-nowrap' },
    { key: 'method', header: '方法', className: 'whitespace-nowrap' },
    { key: 'path', header: '路径', className: 'break-all' },
    {
      key: 'time',
      header: '时间',
      className: 'whitespace-nowrap',
      render: (row) => formatDateTime(row.time),
    },
  ]

  return (
    <>
      {props.searching ? (
        <motion.div variants={fadeUp} className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            搜索 “{props.keyword}”，找到 {props.total} 条
          </p>
          <Button variant="link" size="sm" onClick={props.onClearSearch}>
            返回全部日志
          </Button>
        </motion.div>
      ) : null}

      {props.isError ? (
        <EmptyState icon={ShieldAlert} title="日志加载失败" description={props.errorMessage} />
      ) : (
        <>
          <motion.div variants={fadeUp}>
            <DataTable
              columns={columns}
              rows={props.rows}
              rowKey="id"
              rowMotion={fadeUp}
              loading={props.isLoading}
              emptyText="暂无日志"
            />
          </motion.div>
          {props.rows.length > 0 ? (
            <motion.div variants={fadeUp} className="flex justify-center">
              {props.hasNextPage ? (
                <Button
                  variant="outline"
                  disabled={props.isFetchingNextPage}
                  onClick={props.onLoadMore}
                >
                  {props.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
                  加载更多
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">没有更多了</p>
              )}
            </motion.div>
          ) : null}
        </>
      )}
    </>
  )
}

function HighlightText({ text, keyword }: { text: string; keyword: string }) {
  const segments = splitHighlight(text, keyword)
  let offset = 0
  return (
    <span className="break-all">
      {segments.map((segment) => {
        const key = `${offset}-${segment.hit ? 'hit' : 'text'}`
        offset += segment.text.length
        return segment.hit ? (
          <mark key={key} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <span key={key}>{segment.text}</span>
        )
      })}
    </span>
  )
}
