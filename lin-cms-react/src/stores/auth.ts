import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserBasic } from '@/lib/api/types'

export interface SetUserAndStatePayload {
  user: UserBasic
  admin: boolean
  /** 已扁平化的权限名数组（见 lib/permissions.ts 的 flattenPermissions） */
  permissions: string[]
}

export interface AuthState {
  user: UserBasic | null
  admin: boolean
  permissions: string[]
  /** 登录成功后写入用户信息与权限（permissions 需先扁平化） */
  setUserAndState: (payload: SetUserAndStatePayload) => void
  /** 清空登录态（本地状态；token 清理见 lib/auth/tokens.ts） */
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      admin: false,
      permissions: [],
      setUserAndState: (payload) =>
        set({ user: payload.user, admin: payload.admin, permissions: payload.permissions }),
      logout: () => set({ user: null, admin: false, permissions: [] }),
    }),
    {
      name: 'lin-cms:auth',
    },
  ),
)
