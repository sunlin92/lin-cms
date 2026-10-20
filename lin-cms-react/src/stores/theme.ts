import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEME_IDS = ['lin-classic', 'book-ink', 'palace-vermilion', 'ru-yao-celadon'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export interface ThemePreset {
  id: ThemeId
  label: string
  /** 色块样式（引用 index.css 中的 --swatch-* token） */
  swatch: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'lin-classic', label: '靛青 · Lin Classic', swatch: 'bg-[var(--swatch-lin-classic)]' },
  { id: 'book-ink', label: '栗褐 · Book Ink', swatch: 'bg-[var(--swatch-book-ink)]' },
  {
    id: 'palace-vermilion',
    label: '胭脂 · Palace Vermilion',
    swatch: 'bg-[var(--swatch-palace-vermilion)]',
  },
  {
    id: 'ru-yao-celadon',
    label: '黛绿 · Ru Yao Celadon',
    swatch: 'bg-[var(--swatch-ru-yao-celadon)]',
  },
]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** 将主题状态写到 <html>：class dark + data-theme */
export function applyThemeToDocument(themeId: ThemeId, isDark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
  document.documentElement.classList.toggle('dark', isDark)
}

export interface ThemeState {
  themeId: ThemeId
  isDark: boolean
  setTheme: (themeId: ThemeId) => void
  toggleDark: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId: 'lin-classic',
      isDark: false,
      setTheme: (themeId) => {
        applyThemeToDocument(themeId, get().isDark)
        set({ themeId })
      },
      toggleDark: () => {
        const { themeId, isDark } = get()
        applyThemeToDocument(themeId, !isDark)
        set({ isDark: !isDark })
      },
    }),
    {
      name: 'lin-cms:theme',
    },
  ),
)
