import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createContentType, getContentType, updateContentType } from '@/lib/api/agent'
import type { FieldSpec, FieldTypeName } from '@/lib/api/agent-types'

let draftSeq = 0

interface DraftField {
  uid: number
  key: string
  label: string
  type: FieldTypeName
  required: boolean
  options: string
}

const FIELD_TYPES: Array<{ value: FieldTypeName; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '枚举选择' },
]

function draftToSpec(field: DraftField): FieldSpec {
  const spec: FieldSpec = {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required || undefined,
  }
  if (field.type === 'select' && field.options.trim()) {
    spec.options = field.options
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return spec
}

/** 共享向导内核：mode=create 全新建；mode=edit 加载已有类型（key 只读）走更新 */
function ContentTypeForm({
  mode,
  typeId,
  initial,
}: {
  mode: 'create' | 'edit'
  typeId?: number
  initial?: { key: string; name: string; description: string; fields: DraftField[] }
}) {
  const navigate = useNavigate()
  const [key, setKey] = useState(initial?.key ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [fields, setFields] = useState<DraftField[]>(initial?.fields ?? [])
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || null,
        fields: fields.map(draftToSpec),
      }
      if (mode === 'edit' && typeId) {
        return updateContentType(typeId, payload)
      }
      return createContentType(payload)
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? '内容类型更新成功' : '内容类型创建成功')
      navigate('/admin/content-types')
    },
    onError: (err: Error) => setError(err.message),
  })

  const addField = () =>
    setFields((prev) => [
      ...prev,
      { uid: ++draftSeq, key: '', label: '', type: 'text', required: false, options: '' },
    ])
  const patchField = (index: number, patch: Partial<DraftField>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  const removeField = (index: number) => setFields((prev) => prev.filter((_, i) => i !== index))

  const submit = () => {
    setError(null)
    const keys = fields.map((f) => f.key.trim())
    if (!key.trim() || !name.trim() || keys.length === 0) {
      setError('类型 key、显示名称与至少一个字段为必填')
      return
    }
    const duplicated = keys.find((k, i) => keys.indexOf(k) !== i)
    if (duplicated) {
      setError(`字段 key 重复：${duplicated}`)
      return
    }
    if (fields.some((f) => !f.key.trim() || !f.label.trim())) {
      setError('每个字段都需要 key 与名称')
      return
    }
    if (fields.some((f) => f.type === 'select' && !f.options.trim())) {
      setError('枚举字段需要填写选项（逗号分隔）')
      return
    }
    mutation.mutate()
  }

  const preview = JSON.stringify({ key, name, fields: fields.map(draftToSpec) }, null, 2)

  return (
    <div className="space-y-6">
      <PageHeader
        title="新建内容类型"
        description="声明式字段定义：字段即配置，创建后 key 不可修改"
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">1. 基本信息</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ct-key">类型 key（小写字母/数字/连字符）</Label>
            <Input
              id="ct-key"
              aria-label="类型 key"
              value={key}
              readOnly={mode === 'edit'}
              onChange={(e) => setKey(e.target.value)}
              placeholder="product"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-name">显示名称</Label>
            <Input
              id="ct-name"
              aria-label="显示名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="商品目录"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-desc">描述（可选）</Label>
          <Input
            id="ct-desc"
            aria-label="描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">2. 字段编辑器</h3>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="mr-1 size-4" /> 添加字段
          </Button>
        </div>
        {fields.length === 0 && <p className="text-sm text-muted-foreground">尚未添加字段</p>}
        {fields.map((field, index) => (
          <div
            key={field.uid}
            className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto_auto_1fr_auto] sm:items-end"
          >
            <div className="space-y-1">
              <Label aria-label={`字段 key ${index + 1}`}>字段 key</Label>
              <Input
                aria-label="字段 key"
                value={field.key}
                onChange={(e) => patchField(index, { key: e.target.value })}
                placeholder="title"
              />
            </div>
            <div className="space-y-1">
              <Label>字段名称</Label>
              <Input
                aria-label="字段名称"
                value={field.label}
                onChange={(e) => patchField(index, { label: e.target.value })}
                placeholder="标题"
              />
            </div>
            <div className="space-y-1">
              <Label>类型</Label>
              <Select
                value={field.type}
                onValueChange={(v) => patchField(index, { type: v as FieldTypeName })}
              >
                <SelectTrigger aria-label="字段类型" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => patchField(index, { required: e.target.checked })}
              />
              必填
            </label>
            {field.type === 'select' ? (
              <div className="space-y-1">
                <Label>选项（逗号分隔）</Label>
                <Input
                  aria-label="枚举选项"
                  value={field.options}
                  onChange={(e) => patchField(index, { options: e.target.value })}
                  placeholder="low,high"
                />
              </div>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="删除字段"
              onClick={() => removeField(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">3. 预览</h3>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{preview}</pre>
        <div className="flex gap-2">
          <Button type="button" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '保存中…' : mode === 'edit' ? '保存修改' : '创建内容类型'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/content-types')}>
            <ArrowLeft className="mr-1 size-4" /> 返回列表
          </Button>
        </div>
      </section>
    </div>
  )
}

export function ContentTypeWizardPage() {
  return <ContentTypeForm mode="create" />
}

export function ContentTypeEditPage() {
  const { typeId = '' } = useParams()
  const id = Number(typeId)
  const query = useQuery({
    queryKey: ['content-type', id],
    queryFn: () => getContentType(id),
    enabled: Number.isFinite(id) && id > 0,
  })
  if (query.isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>
  if (!query.data) return <p className="text-sm text-muted-foreground">内容类型不存在</p>
  const detail = query.data
  return (
    <ContentTypeForm
      mode="edit"
      typeId={id}
      initial={{
        key: detail.key,
        name: detail.name,
        description: detail.description ?? '',
        fields: (detail.fields ?? []).map((f, i) => ({
          uid: i + 1,
          key: f.key,
          label: f.label,
          type: f.type,
          required: Boolean(f.required),
          options: (f.options ?? []).join(','),
        })),
      }}
    />
  )
}
