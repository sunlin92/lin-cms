import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect } from 'react'
import { type FieldErrors, type UseFormRegister, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useMotionVariants } from '@/components/wm/motion'
import { get, post, put } from '@/lib/api/client'
import type { ApiEnvelope, Book } from '@/lib/api/types'

const bookFormSchema = z.object({
  title: z.string().trim().min(1, '请输入书名').max(50, '书名最多 50 个字符'),
  author: z.string().trim().min(1, '请输入作者').max(30, '作者最多 30 个字符'),
  image: z.string().trim().min(1, '请输入封面链接').max(100, '封面链接最多 100 个字符'),
  summary: z.string().trim().min(1, '请输入简介').max(1000, '简介最多 1000 个字符'),
})

type BookFormValues = z.output<typeof bookFormSchema>

const EMPTY_VALUES: BookFormValues = { title: '', author: '', image: '', summary: '' }

/** 解析 /book/add 与 /book/edit/:id 的模式 */
function parseBookId(id: string | undefined): number {
  if (!id) return Number.NaN
  const parsed = Number.parseInt(id, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

export function BookFormPage() {
  const { fadeUp, staggerContainer } = useMotionVariants()
  const { id } = useParams()
  const navigate = useNavigate()
  const bookId = parseBookId(id)
  const isEdit = Number.isInteger(bookId)

  const bookQuery = useQuery({
    queryKey: ['book', isEdit ? bookId : 'new'],
    queryFn: () => get<Book>(`v1/book/${bookId}`),
    enabled: isEdit,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookFormValues, unknown, BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  const book = bookQuery.data
  useEffect(() => {
    if (book) {
      reset({ title: book.title, author: book.author, image: book.image, summary: book.summary })
    }
  }, [book, reset])

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = isEdit
        ? await put<ApiEnvelope>(`v1/book/${bookId}`, values)
        : await post<ApiEnvelope>('v1/book', values)
      toast.success(result.message)
      navigate('/book/list')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
    }
  })

  if (isEdit && bookQuery.isLoading) {
    return <BookFormSkeleton />
  }

  if (isEdit && bookQuery.isError) {
    return (
      <BookFormError
        message={bookQuery.error instanceof Error ? bookQuery.error.message : '请稍后重试'}
        onBack={() => navigate('/book/list')}
      />
    )
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title={isEdit ? '编辑图书' : '新增图书'}
          description={isEdit ? `修改图书资料（ID ${bookId}）` : '填写图书信息并保存到内容库'}
          actions={
            <Button variant="outline" onClick={() => navigate('/book/list')}>
              <ArrowLeft />
              返回
            </Button>
          }
        />
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card className="max-w-2xl border-border/60 shadow-sm">
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <BookFormFields register={register} errors={errors} />
              <Button type="submit" className="h-11" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                {isSubmitting ? '保存中…' : '保 存'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/** 编辑模式加载失败：标题 + 空状态 + 返回按钮 */
function BookFormError({ message, onBack }: { message: string; onBack: () => void }) {
  const { fadeUp, staggerContainer } = useMotionVariants()
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader title="编辑图书" />
      </motion.div>
      <motion.div variants={fadeUp}>
        <EmptyState title="图书加载失败" description={message} />
      </motion.div>
      <motion.div variants={fadeUp} className="flex justify-center">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          返回列表
        </Button>
      </motion.div>
    </motion.div>
  )
}

interface BookFormFieldsProps {
  register: UseFormRegister<BookFormValues>
  errors: FieldErrors<BookFormValues>
}

function BookFormFields({ register, errors }: BookFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="title">书名</Label>
        <Input
          id="title"
          className="h-11"
          placeholder="请输入书名（1-50 字）"
          {...register('title')}
        />
        {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="author">作者</Label>
        <Input
          id="author"
          className="h-11"
          placeholder="请输入作者（1-30 字）"
          {...register('author')}
        />
        {errors.author ? <p className="text-xs text-destructive">{errors.author.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="image">封面链接</Label>
        <Input
          id="image"
          className="h-11"
          placeholder="请输入封面图片链接（1-100 字）"
          {...register('image')}
        />
        {errors.image ? <p className="text-xs text-destructive">{errors.image.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="summary">简介</Label>
        <Textarea
          id="summary"
          rows={5}
          placeholder="请输入简介（1-1000 字）"
          {...register('summary')}
        />
        {errors.summary ? (
          <p className="text-xs text-destructive">{errors.summary.message}</p>
        ) : null}
      </div>
    </>
  )
}

function BookFormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Card className="max-w-2xl border-border/60">
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-11 w-28" />
        </CardContent>
      </Card>
    </div>
  )
}
