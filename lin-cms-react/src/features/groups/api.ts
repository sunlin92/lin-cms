import { del, get, post, put } from '@/lib/api/client'
import type {
  ApiEnvelope,
  DispatchPermissionsPayload,
  GroupBrief,
  GroupDetail,
  PermissionTree,
} from '@/lib/api/types'

/** GET cms/admin/group/all：全量分组 */
export function fetchGroups(): Promise<GroupBrief[]> {
  return get<GroupBrief[]>('cms/admin/group/all')
}

/** GET cms/admin/group/{id}：分组详情（含已有权限） */
export function fetchGroupDetail(id: number): Promise<GroupDetail> {
  return get<GroupDetail>(`cms/admin/group/${id}`)
}

/** GET cms/admin/permission：权限树（模块名 -> 权限数组） */
export function fetchPermissionTree(): Promise<PermissionTree> {
  return get<PermissionTree>('cms/admin/permission')
}

export interface SaveGroupPayload {
  name: string
  info?: string
  permission_ids: number[]
}

/** POST cms/admin/group：新建分组（含初始权限） */
export function createGroup(payload: SaveGroupPayload): Promise<ApiEnvelope> {
  return post<ApiEnvelope>('cms/admin/group', payload)
}

/** PUT cms/admin/group/{id}：修改分组名称与描述 */
export function updateGroup(
  id: number,
  payload: { name: string; info?: string },
): Promise<ApiEnvelope> {
  return put<ApiEnvelope>(`cms/admin/group/${id}`, payload)
}

/** DELETE cms/admin/group/{id}：删除分组（受保护分组返回 401 + message） */
export function deleteGroup(id: number): Promise<ApiEnvelope> {
  return del<ApiEnvelope>(`cms/admin/group/${id}`)
}

/** POST cms/admin/permission/dispatch/batch：批量新增分组权限 */
export function dispatchGroupPermissions(
  payload: DispatchPermissionsPayload,
): Promise<ApiEnvelope> {
  return post<ApiEnvelope>('cms/admin/permission/dispatch/batch', payload)
}

/** POST cms/admin/permission/remove：批量移除分组权限 */
export function removeGroupPermissions(payload: DispatchPermissionsPayload): Promise<ApiEnvelope> {
  return post<ApiEnvelope>('cms/admin/permission/remove', payload)
}
