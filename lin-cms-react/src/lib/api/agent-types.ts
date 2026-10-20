/*
 * Agent 接入相关契约类型（与后端 /api/v1 对齐，docs/04 §5）。
 */

import type { ApiEnvelope, Paginated } from './types'

/* -------------------------------- 内容类型 -------------------------------- */

export type FieldTypeName = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select'

export interface FieldSpec {
  key: string
  label: string
  type: FieldTypeName
  required?: boolean
  options?: string[]
  max_length?: number
  min?: number
  max?: number
}

export type ContentOp = 'read' | 'create' | 'update' | 'delete'

export interface ContentTypeSummary {
  id: number
  key: string
  name: string
  description: string | null
  ops: ContentOp[]
  field_count: number
  /** 字段定义：可见该类型即可见其 schema（表单/过滤渲染用） */
  fields?: FieldSpec[]
}

export interface ContentTypeListItem {
  id: number
  key: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  field_count: number
  record_count: number
  update_time: string | null
}

export interface ContentTypeDetail extends ContentTypeListItem {
  fields: FieldSpec[]
  create_time: string | null
}

export interface ContentTypePayload {
  key?: string
  name: string
  description?: string | null
  fields: FieldSpec[]
}

/* ------------------------------ 分组内容权限 ------------------------------ */

export interface GroupContentGrant {
  content_type_id: number
  can_read: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

/* -------------------------------- Agent Token ------------------------------- */

export interface TokenScopeEntry {
  content_type_id: number
  content_type_key: string | null
  ops: ContentOp[]
}

export interface AgentTokenMeta {
  id: number
  name: string
  prefix: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  create_time: string | null
  scope: TokenScopeEntry[]
}

export interface AgentTokenCreated {
  token_id: number
  /** 一次性明文：仅创建响应返回，之后不可再查看 */
  token: string
  prefix: string
  expires_at: string
  scope: Array<{ content_type_id: number; ops: ContentOp[] }>
}

export interface CreateAgentTokenPayload {
  name: string
  ttl_days?: number
  scope: Array<{ content_type_id: number; ops: ContentOp[] }>
}

export interface AdminAgentTokenRow {
  id: number
  user_id: number
  name: string
  prefix: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}

/* -------------------------------- 内容记录 --------------------------------- */

export type RecordFieldValue = string | number | boolean | null

export interface ContentRecordDTO {
  id: number
  [fieldKey: string]: RecordFieldValue
}

export interface ContentListResult {
  items: ContentRecordDTO[]
  page: number
  count: number
  total: number
  total_page: number
  scan_truncated: boolean
}

export interface ContentListQuery {
  page?: number
  count?: number
  sort?: string
  order?: 'asc' | 'desc'
  /** f_ 前缀过滤参数（等值，最多 5 个字段） */
  filters?: Record<string, string>
}

/* --------------------------------- 审计 ---------------------------------- */

export interface AuditRow {
  id: number
  agent_token_id: number | null
  user_id: number
  content_type_key: string | null
  record_id: number | null
  action: string
  success: boolean
  error_code: number | null
  create_time: string | null
}

export interface AuditQuery extends Paginated<AuditRow> {
  token_id?: number
  action?: string
  content_type_key?: string
}

/* 便捷再导出 */
export type { ApiEnvelope, Paginated }
