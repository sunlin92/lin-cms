import type { LucideIcon } from 'lucide-react'
import { BookOpen, Database, ExternalLink, Layers, Server } from 'lucide-react'
import { motion } from 'motion/react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMotionVariants } from '@/components/wm/motion'

const APP_VERSION = '0.1.0'
const REPO_URL = 'https://github.com/example/lin-cms-react'

interface StackGroup {
  label: string
  icon: LucideIcon
  items: string[]
}

const STACK_GROUPS: StackGroup[] = [
  { label: '后端', icon: Server, items: ['FastAPI', 'SQLAlchemy', 'SQLite'] },
  {
    label: '前端',
    icon: Layers,
    items: ['React 19', 'Vite', 'Tailwind CSS 4', 'shadcn 风格组件'],
  },
  {
    label: '数据与状态',
    icon: Database,
    items: ['TanStack Query', 'React Hook Form', 'Zod', 'Zustand'],
  },
]

/** 技术栈分组卡片：色调徽章图标 + outline 徽章组，交错入场 + 悬浮抬升 */
function StackGroupCard({ group }: { group: StackGroup }) {
  const { fadeUp } = useMotionVariants()
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3 }}
      className="card-lift rounded-xl border border-border/60 bg-card p-4"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <group.icon className="size-4" />
        </div>
        <p className="text-sm font-medium">{group.label}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.items.map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
    </motion.div>
  )
}

/** 关于页：项目介绍 / 技术栈 / 版本与仓库链接占位 */
export function AboutPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl space-y-4"
    >
      <motion.div variants={fadeUp}>
        <PageHeader title="关于" description="本项目的信息与技术栈" />
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="items-start space-y-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="size-6" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-lg">Lin CMS 现代重建</CardTitle>
                <CardDescription>内容管理系统的现代化前端实现</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">v{APP_VERSION}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              本项目是 Lin CMS 的现代化重建版本：后端基于 FastAPI 与 SQLAlchemy 提供 RESTful
              API，前端采用 React 19 与 Vite 构建的 SPA 架构，配合 Tailwind CSS 4 与 shadcn
              风格组件库，提供简洁高效的内容管理体验。内置基于分组的细粒度权限控制、操作日志与文件管理等能力。
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>技术栈</CardTitle>
            <CardDescription>当前版本使用的主要依赖</CardDescription>
          </CardHeader>
          <CardContent>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {STACK_GROUPS.map((group) => (
                <StackGroupCard key={group.label} group={group} />
              ))}
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>源代码</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-4" />
              仓库链接（占位）
            </a>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
