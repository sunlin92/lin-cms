import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { MotionProvider } from '@/components/wm/MotionProvider'
import { createAppRouter } from '@/routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

const router = createAppRouter()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  )
}
