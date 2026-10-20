import { Construction } from 'lucide-react'
import type * as React from 'react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

export interface PlaceholderPageProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

/** 业务页占位：显示标题与「待实现」空状态，具体功能由后续迭代补齐 */
export function PlaceholderPage({ title, description, actions }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} actions={actions} />
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="待实现"
            description="该页面为工程占位，业务功能将在后续迭代中补齐。"
            icon={Construction}
          />
        </CardContent>
      </Card>
    </div>
  )
}
