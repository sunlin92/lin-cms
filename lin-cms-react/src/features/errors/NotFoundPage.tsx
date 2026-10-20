import { motion } from 'motion/react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { SPRING } from '@/components/wm/motion'

/** 404 页：渐变大字 + 弹簧入场 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <motion.p
        initial={{ opacity: 0, y: 28, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className="text-gradient-primary text-9xl font-bold leading-none tracking-tight"
      >
        404
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.12 }}
        className="space-y-2"
      >
        <h1 className="text-xl font-semibold text-foreground">页面不存在</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          您访问的页面不存在或已被移动，也可能是当前账号没有访问该页面的权限。
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.24 }}
      >
        <Button asChild size="lg">
          <Link to="/dashboard">返回工作台</Link>
        </Button>
      </motion.div>
    </div>
  )
}
