import { del, get, post, put } from '@/lib/api/client'
import type {
  AdminChangePasswordPayload,
  AdminUserRow,
  ApiEnvelope,
  GroupBrief,
  Paginated,
  RegisterPayload,
  UpdateAdminUserPayload,
} from '@/lib/api/types'

export interface AdminUsersQueryInput {
  /** 0-based 页码 */
  page: number
  count: number
  groupId?: number
}

/** GET cms/admin/users：分页用户列表（可按分组过滤） */
export function fetchAdminUsers(input: AdminUsersQueryInput): Promise<Paginated<AdminUserRow>> {
  return get<Paginated<AdminUserRow>>('cms/admin/users', {
    page: input.page,
    count: input.count,
    group_id: input.groupId,
  })
}

/** GET cms/admin/group/all：全量分组（用于过滤与多选） */
export function fetchGroupOptions(): Promise<GroupBrief[]> {
  return get<GroupBrief[]>('cms/admin/group/all')
}

/** PUT cms/admin/user/{id}：修改邮箱与分组 */
export function updateAdminUser(id: number, payload: UpdateAdminUserPayload): Promise<ApiEnvelope> {
  return put<ApiEnvelope>(`cms/admin/user/${id}`, payload)
}

/** PUT cms/admin/user/{id}/password：管理员重置密码 */
export function resetAdminUserPassword(
  id: number,
  payload: AdminChangePasswordPayload,
): Promise<ApiEnvelope> {
  return put<ApiEnvelope>(`cms/admin/user/${id}/password`, payload)
}

/** DELETE cms/admin/user/{id} */
export function deleteAdminUser(id: number): Promise<ApiEnvelope> {
  return del<ApiEnvelope>(`cms/admin/user/${id}`)
}

/** POST cms/user/register：创建用户 */
export function registerUser(payload: RegisterPayload): Promise<ApiEnvelope> {
  return post<ApiEnvelope>('cms/user/register', payload)
}
