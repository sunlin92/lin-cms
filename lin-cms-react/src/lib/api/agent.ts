/*
 * Agent 接入 API 封装（/api/v1/**），全部经 client 统一信封解析。
 */

import type {
  AdminAgentTokenRow,
  AgentTokenCreated,
  AgentTokenMeta,
  ApiEnvelope,
  AuditRow,
  ContentListQuery,
  ContentListResult,
  ContentRecordDTO,
  ContentTypeDetail,
  ContentTypeListItem,
  ContentTypePayload,
  ContentTypeSummary,
  GroupContentGrant,
  Paginated,
} from './agent-types'
import { del, get, post, put, request } from './client'

/* --------------------------------- 内容类型 -------------------------------- */

export function listAvailableContentTypes(): Promise<ContentTypeSummary[]> {
  return get<ContentTypeSummary[]>('/api/v1/content-types/available')
}

export function listAdminContentTypes(
  page = 0,
  count = 15,
): Promise<Paginated<ContentTypeListItem>> {
  return get<Paginated<ContentTypeListItem>>('/api/v1/admin/content-types', { page, count })
}

export function createContentType(payload: ContentTypePayload): Promise<ApiEnvelope> {
  return post<ApiEnvelope>('/api/v1/admin/content-types', payload)
}

export function getContentType(typeId: number): Promise<ContentTypeDetail> {
  return get<ContentTypeDetail>(`/api/v1/admin/content-types/${typeId}`)
}

export function updateContentType(
  typeId: number,
  payload: ContentTypePayload,
): Promise<ApiEnvelope> {
  return put<ApiEnvelope>(`/api/v1/admin/content-types/${typeId}`, payload)
}

export function archiveContentType(typeId: number): Promise<ApiEnvelope> {
  return post<ApiEnvelope>(`/api/v1/admin/content-types/${typeId}/archive`)
}

export function restoreContentType(typeId: number): Promise<ApiEnvelope> {
  return post<ApiEnvelope>(`/api/v1/admin/content-types/${typeId}/restore`)
}

/* ------------------------------ 分组内容权限 ------------------------------- */

export function getGroupContentPermissions(
  groupId: number,
): Promise<{ entries: GroupContentGrant[] }> {
  return get<{ entries: GroupContentGrant[] }>(
    `/api/v1/admin/groups/${groupId}/content-permissions`,
  )
}

export function replaceGroupContentPermissions(
  groupId: number,
  entries: GroupContentGrant[],
): Promise<ApiEnvelope> {
  return put<ApiEnvelope>(`/api/v1/admin/groups/${groupId}/content-permissions`, { entries })
}

/* -------------------------------- Agent Token ------------------------------- */

export function listAgentTokens(): Promise<AgentTokenMeta[]> {
  return get<AgentTokenMeta[]>('/api/v1/agent-tokens')
}

export function createAgentToken(payload: {
  name: string
  ttl_days?: number
  scope: Array<{ content_type_id: number; ops: string[] }>
}): Promise<AgentTokenCreated> {
  return post<AgentTokenCreated>('/api/v1/agent-tokens', payload)
}

export function revokeAgentToken(tokenId: number): Promise<ApiEnvelope> {
  return del<ApiEnvelope>(`/api/v1/agent-tokens/${tokenId}`)
}

export function adminListAgentTokens(
  page = 0,
  count = 15,
  userId?: number,
): Promise<Paginated<AdminAgentTokenRow>> {
  return get<Paginated<AdminAgentTokenRow>>('/api/v1/admin/agent-tokens', {
    page,
    count,
    user_id: userId,
  })
}

export function adminRevokeAgentToken(tokenId: number, reason: string): Promise<ApiEnvelope> {
  return post<ApiEnvelope>(`/api/v1/admin/agent-tokens/${tokenId}/revoke`, { reason })
}

/* -------------------------------- 内容记录 --------------------------------- */

export function listContentRecords(
  typeKey: string,
  query: ContentListQuery = {},
): Promise<ContentListResult> {
  const params: Record<string, unknown> = {
    page: query.page ?? 0,
    count: query.count ?? 5,
  }
  if (query.sort) params.sort = query.sort
  if (query.order) params.order = query.order
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    params[`f_${key}`] = value
  }
  return get<ContentListResult>(`/api/v1/content/${typeKey}`, params)
}

export function getContentRecord(typeKey: string, recordId: number): Promise<ContentRecordDTO> {
  return get<ContentRecordDTO>(`/api/v1/content/${typeKey}/${recordId}`)
}

export function createContentRecord(
  typeKey: string,
  data: Record<string, unknown>,
): Promise<ContentRecordDTO> {
  return post<ContentRecordDTO>(`/api/v1/content/${typeKey}`, data)
}

export function updateContentRecord(
  typeKey: string,
  recordId: number,
  patch: Record<string, unknown>,
): Promise<ContentRecordDTO> {
  return request<ContentRecordDTO>(`/api/v1/content/${typeKey}/${recordId}`, {
    method: 'PATCH',
    json: patch,
  })
}

export function deleteContentRecord(typeKey: string, recordId: number): Promise<ApiEnvelope> {
  return del<ApiEnvelope>(`/api/v1/content/${typeKey}/${recordId}`)
}

/* --------------------------------- 审计 ---------------------------------- */

export interface AuditQueryParams {
  page?: number
  count?: number
  token_id?: number
  action?: string
  content_type_key?: string
  [key: string]: unknown
}

export function listAgentAudit(params: AuditQueryParams = {}): Promise<Paginated<AuditRow>> {
  return get<Paginated<AuditRow>>('/api/v1/admin/agent-audit', params)
}
