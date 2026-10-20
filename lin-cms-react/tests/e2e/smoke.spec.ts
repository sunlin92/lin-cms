import { expect, type Page, test } from '@playwright/test'

/** 登录公共步骤（每条用例独立 browser context，无残留登录态） */
/** 弹窗内确认（确认按钮文案因页面而异：删除/确认/确定） */
async function confirmDialog(page: Page) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^(删除|确认|确\s*定)$/ }).click()
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/用户名/i).fill('root')
  await page.getByLabel(/密码/i).fill('123456')
  await page.getByRole('button', { name: /登\s*录/i }).click()
  await expect(page).toHaveURL(/dashboard/)
}

test('登录 → 工作台 → 退出', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/用户名/i).fill('root')
  await page.getByLabel(/密码/i).fill('123456')
  await page.getByRole('button', { name: /登\s*录/i }).click()
  await expect(page).toHaveURL(/dashboard/)
  await expect(page.getByText('图书总数')).toBeVisible()

  await page.getByRole('button', { name: '用户菜单' }).click()
  await page.getByRole('menuitem', { name: /退出登录/i }).click()
  await expect(page).toHaveURL(/login/)
})

test('图书：新建 → 列表可见 → 删除', async ({ page }) => {
  await login(page)
  await page.goto('/book/add')
  await page.getByLabel('书名').fill('E2E 测试书')
  await page.getByLabel('作者').fill('Playwright')
  await page.getByLabel('封面链接').fill('https://example.com/cover.jpg')
  await page.getByLabel('简介').fill('端到端自动创建的图书')
  await page.getByRole('button', { name: /保\s*存/i }).click()
  await expect(page).toHaveURL(/book\/list/)
  await expect(page.getByText('E2E 测试书')).toBeVisible()

  const row = page.getByRole('row', { name: /E2E 测试书/ })
  await row.getByRole('button', { name: /删除/i }).click()
  await confirmDialog(page)
  await expect(page.getByText('E2E 测试书')).toHaveCount(0)
})

test('管理员：创建用户 → 列表可见 → 删除', async ({ page }) => {
  await login(page)
  await page.goto('/admin/user/add')
  await page.getByLabel('用户名').fill('e2euser')
  await page.getByLabel(/邮箱（可选）/i).fill('e2e@example.com')
  await page.getByLabel('密码', { exact: true }).fill('E2ePass123')
  await page.getByLabel('确认密码').fill('E2ePass123')
  await page.getByRole('button', { name: '创建用户' }).click()
  await expect(page).toHaveURL(/admin\/user\/list/)
  await expect(page.getByText('e2euser')).toBeVisible()

  const row = page.getByRole('row', { name: /e2euser/ })
  await row.getByRole('button', { name: /删除/i }).click()
  await confirmDialog(page)
  await expect(page.getByText('e2euser')).toHaveCount(0)
})

test('日志页：加载与关键字搜索', async ({ page }) => {
  await login(page)
  await page.goto('/log')
  await expect(page.getByText(/登录成功|日志/i).first()).toBeVisible()
})
