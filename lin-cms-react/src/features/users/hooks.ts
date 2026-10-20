import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminUsers, fetchGroupOptions } from '@/features/users/api'

/** 管理端用户分页列表：queryKey 含完整查询条件，翻页保持旧数据避免闪烁 */
export function useAdminUsersQuery(page: number, count: number, groupId?: number) {
  return useQuery({
    queryKey: ['admin', 'users', { page, count, groupId }],
    queryFn: () => fetchAdminUsers({ page, count, groupId }),
    placeholderData: keepPreviousData,
  })
}

/** 全量分组选项（过滤下拉与分组多选共用，缓存 60s） */
export function useGroupOptionsQuery() {
  return useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: fetchGroupOptions,
    staleTime: 60_000,
  })
}
