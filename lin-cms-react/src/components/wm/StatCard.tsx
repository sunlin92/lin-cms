import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'
import { useMotionVariants } from '@/components/wm/motion'
import { NumberTicker } from '@/components/wm/NumberTicker'
import { cn } from '@/lib/utils'

export type StatTone = 'primary' | 'success' | 'warning' | 'info' | 'danger'

/** 色调 → 徽章底/描边/文字（color-mix 由 token 派生，不硬编码色值） */
const TONE_MIX: Record<StatTone, { badge: string; text: string }> = {
  primary: { badge: 'bg-primary/10 border-primary/25', text: 'text-primary' },
  success: { badge: 'bg-success/10 border-success/25', text: 'text-success' },
  warning: { badge: 'bg-warning/10 border-warning/25', text: 'text-warning' },
  info: { badge: 'bg-info/10 border-info/25', text: 'text-info' },
  danger: { badge: 'bg-destructive/10 border-destructive/25', text: 'text-destructive' },
}

/** Watermelon 风格斜纹渐变（135° 细条纹，主色 8% 透明度） */
function stripeGradient(tone: StatTone): string {
  const token = `var(--${tone === 'danger' ? 'destructive' : tone})`
  return `repeating-linear-gradient(135deg, color-mix(in oklab, ${token} 8%, transparent) 0px, color-mix(in oklab, ${token} 8%, transparent) 1px, transparent 1px, transparent 6px)`
}

export interface StatCardProps {
  label: string
  icon: LucideIcon
  value: number | null
  loading?: boolean
  error?: boolean
  tone?: StatTone
  hint?: string
}

/** 统计卡：色调解徽章 + 斜纹渐变 + 数字滚动 + 悬浮抬升 + 入场动画 */
export function StatCard({
  label,
  icon: Icon,
  value,
  loading = false,
  error = false,
  tone = 'primary',
  hint,
}: StatCardProps) {
  const { fadeUp } = useMotionVariants()
  const mix = TONE_MIX[tone]
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
      className="card-lift relative overflow-hidden rounded-xl border border-border/60 bg-card p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ backgroundImage: stripeGradient(tone) }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : error || value === null ? (
            <p className="text-3xl font-semibold tabular-nums tracking-tight">—</p>
          ) : (
            <p className={cn('text-3xl font-semibold tabular-nums tracking-tight', mix.text)}>
              <NumberTicker value={value} />
            </p>
          )}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border',
            mix.badge,
            mix.text,
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </motion.div>
  )
}
