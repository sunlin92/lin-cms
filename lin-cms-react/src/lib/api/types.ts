/*
 * 后端 API 契约类型（与 lin-cms 后端对齐）。
 * 所有路径相对于 VITE_API_BASE_URL，无 /api 前缀。
 */

/** 信封响应：{message, code, request}；code < 9998 视为成功（0/12/13/14 常见） */
export interface ApiEnvelope {
  message: string
  code: number
  request: string
}

/** 分页查询参数：count 1-15（默认 5），page 0-based */
export interface PaginationQuery {
  page?: number
  count?: number
}

/** 分页响应结构 */
export interface Paginated<T> {
  items: T[]
  count: number
  page: number
  total: number
  total_page: number
}

/* ------------------------------- 认证与用户 ------------------------------- */

export interface LoginPayload {
  username: string
  password: string
  captcha?: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
}

export interface UserBasic {
  id: number
  username: string
  nickname: string
  email: string
  avatar: string
}

export interface PermissionEntry {
  permission: string
  module: string
}

/** GET cms/user/permissions 的响应：permissions 为「模块名 -> 权限数组」 */
export interface UserPermissionsResult extends UserBasic {
  admin: boolean
  permissions: Record<string, PermissionEntry[]>
}

export interface CaptchaResult {
  tag: string
  image: string
}

export interface UpdateProfilePayload {
  email?: string
  nickname?: string
  avatar?: string
}

export interface ChangePasswordPayload {
  old_password: string
  new_password: string
  confirm_password: string
}

/* --------------------------------- 管理端 --------------------------------- */

export interface PermissionInfo {
  id: number
  name: string
  module: string
  mount: string
}

/** GET cms/admin/permission：模块名 -> 权限详情数组 */
export type PermissionTree = Record<string, PermissionInfo[]>

export interface GroupBrief {
  id: number
  name: string
  info?: string
}

export interface GroupDetail extends GroupBrief {
  permissions: PermissionInfo[]
}

export interface AdminUserRow {
  id: number
  username: string
  email: string
  groups: GroupBrief[]
}

export interface AdminUsersQuery extends PaginationQuery {
  group_id?: number
}

export interface RegisterPayload {
  username: string
  password: string
  confirm_password: string
  email?: string
  group_ids: number[]
}

export interface UpdateAdminUserPayload {
  email: string
  group_ids: number[]
}

export interface AdminChangePasswordPayload {
  new_password: string
  confirm_password: string
}

export interface DispatchPermissionsPayload {
  group_id: number
  permission_ids: number[]
}

/* ---------------------------------- 日志 ---------------------------------- */

export interface LogRow {
  id: number
  message: string
  user_id: number
  username: string
  status_code: number
  method: string
  path: string
  permission: string
  time: string
}

export interface LogQuery extends PaginationQuery {
  name?: string
  start?: string
  end?: string
  keyword?: string
}

/* ---------------------------------- 文件 ---------------------------------- */

export interface UploadedFile {
  key: string
  id: number
  path: string
  url: string
}

/* ---------------------------------- 图书 ---------------------------------- */

export interface Book {
  id: number
  title: string
  author: string
  image: string
  summary: string
}

/* ---------------------------------- 健康 ---------------------------------- */

export interface HealthResult {
  status: string
  version: string
}
