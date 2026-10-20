import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { RowActions } from '@/components/RowActions'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMotionVariants } from '@/components/wm/motion'
import { deleteAdminUser } from '@/features/users/api'
import { EditUserDialog } from '@/features/users/components/EditUserDialog'
import { ResetPasswordDialog } from '@/features/users/components/ResetPasswordDialog'
import { useAdminUsersQuery, useGroupOptionsQuery } from '@/features/users/hooks'
import type { AdminUserRow, GroupBrief } from '@/lib/api/types'

const PAGE_COUNT = 10

interface UserListPageState {
  editing: AdminUserRow | null
  resetting: AdminUserRow | null
  deleting: AdminUserRow | null
}

/** 分组过滤下拉：all 哨兵值 → undefined */
function GroupFilterSelect({
  groups,
  value,
  onChange,
}: {
  groups: GroupBrief[]
  value: number | undefined
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-sm text-muted-foreground">分组过滤</span>
      <Select value={value === undefined ? 'all' : String(value)} onValueChange={onChange}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="全部分组" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部分组</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={String(group.id)}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** 用户列表页：分页 + 分组过滤 + 编辑/重置密码/删除 */
export function UserListPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [groupId, setGroupId] = useState<number | undefined>(undefined)
  const [dialogs, setDialogs] = useState<UserListPageState>({
    editing: null,
    resetting: null,
    deleting: null,
  })

  const usersQuery = useAdminUsersQuery(page, PAGE_COUNT, groupId)
  const groupsQuery = useGroupOptionsQuery()
  const groups = groupsQuery.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: (result) => {
      toast.success(result.message)
      setDialogs((prev) => ({ ...prev, deleting: null }))
      const remaining = usersQuery.data?.items.length ?? 0
      // 当前页只剩一条且不是第 1 页：回退一页，否则原地刷新
      if (remaining <= 1 && page > 0) {
        setPage(page - 1)
      } else {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
    },
  })

  const handleGroupChange = (value: string) => {
    setGroupId(value === 'all' ? undefined : Number(value))
    setPage(0)
  }

  const columns = buildColumns({
    onEdit: (user) => setDialogs((prev) => ({ ...prev, editing: user })),
    onReset: (user) => setDialogs((prev) => ({ ...prev, resetting: user })),
    onDelete: (user) => setDialogs((prev) => ({ ...prev, deleting: user })),
  })

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="用户列表"
          description="管理系统用户，维护邮箱与分组归属"
          actions={
            <Button onClick={() => navigate('/admin/user/add')}>
              <Plus />
              添加用户
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <GroupFilterSelect groups={groups} value={groupId} onChange={handleGroupChange} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <DataTable
          columns={columns}
          rows={usersQuery.data?.items ?? []}
          rowKey="id"
          rowMotion={fadeUp}
          loading={usersQuery.isLoading}
          emptyText="暂无用户"
        />
      </motion.div>
      <Pagination
        page={page}
        count={PAGE_COUNT}
        total={usersQuery.data?.total ?? 0}
        onPageChange={setPage}
      />
      <UserDialogs
        dialogs={dialogs}
        groups={groups}
        deletePending={deleteMutation.isPending}
        onDialogsChange={setDialogs}
        onConfirmDelete={() => {
          const target = dialogs.deleting
          if (target) deleteMutation.mutate(target.id)
        }}
      />
    </motion.div>
  )
}

/** 列表页的三个弹窗集合（编辑 / 重置密码 / 删除确认） */
function UserDialogs({
  dialogs,
  groups,
  deletePending,
  onDialogsChange,
  onConfirmDelete,
}: {
  dialogs: UserListPageState
  groups: GroupBrief[]
  deletePending: boolean
  onDialogsChange: (update: (prev: UserListPageState) => UserListPageState) => void
  onConfirmDelete: () => void
}) {
  return (
    <>
      {dialogs.editing ? (
        <EditUserDialog
          user={dialogs.editing}
          groups={groups}
          open
          onClose={() => onDialogsChange((prev) => ({ ...prev, editing: null }))}
        />
      ) : null}
      {dialogs.resetting ? (
        <ResetPasswordDialog
          user={dialogs.resetting}
          open
          onClose={() => onDialogsChange((prev) => ({ ...prev, resetting: null }))}
        />
      ) : null}
      <ConfirmDialog
        open={dialogs.deleting !== null}
        title="删除用户"
        description={`确定删除用户「${dialogs.deleting?.username ?? ''}」吗？该操作不可恢复。`}
        confirmText="删除"
        loading={deletePending}
        onConfirm={onConfirmDelete}
        onCancel={() => onDialogsChange((prev) => ({ ...prev, deleting: null }))}
      />
    </>
  )
}

interface ColumnHandlers {
  onEdit: (user: AdminUserRow) => void
  onReset: (user: AdminUserRow) => void
  onDelete: (user: AdminUserRow) => void
}

function buildColumns(handlers: ColumnHandlers): DataTableColumn<AdminUserRow>[] {
  return [
    { key: 'username', header: '用户名' },
    { key: 'email', header: '邮箱', render: (row) => row.email || '—' },
    {
      key: 'groups',
      header: '分组',
      render: (row) => row.groups.map((group) => group.name).join('，') || '—',
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-14 md:w-56',
      render: (row) => (
        <RowActions
          menuLabel={`更多用户操作：${row.username}`}
          items={[
            {
              key: 'edit',
              label: '编辑',
              icon: <Pencil />,
              onSelect: () => handlers.onEdit(row),
            },
            {
              key: 'reset',
              label: '重置密码',
              icon: <KeyRound />,
              onSelect: () => handlers.onReset(row),
            },
            {
              key: 'delete',
              label: '删除',
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => handlers.onDelete(row),
            },
          ]}
        />
      ),
    },
  ]
}
