import { expect, type Page, test } from '@playwright/test'

/**
 * 响应式与布局验收（docs/ui-design-book.md 5.2 / 12）：
 * 移动端 375px 抽屉导航、Escape 关闭、行操作菜单收纳；桌面端独立滚动与侧栏折叠。
 */

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/用户名/i).fill('root')
  await page.getByLabel(/密码/i).fill('123456')
  await page.getByRole('button', { name: /登\s*录/i }).click()
  await expect(page).toHaveURL(/dashboard/)
}

test('移动端 375px：抽屉导航 → 行操作菜单可达 → Escape 关闭抽屉', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await login(page)

  // 顶栏图标按钮均有可访问名称（验收清单：图标按钮可访问名称）
  await expect(page.getByRole('button', { name: '切换侧边栏' })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换主题' })).toBeVisible()
  await expect(page.getByRole('button', { name: '用户菜单' })).toBeVisible()

  // 抽屉：打开 → 导航 → 选中后自动关闭
  await page.getByRole('button', { name: '切换侧边栏' }).click()
  const drawer = page.getByRole('dialog', { name: '导航菜单' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('link', { name: '图书列表' }).click()
  await expect(page).toHaveURL(/book\/list/)
  await expect(drawer).toBeHidden()

  // 新建一本图书，验证移动端行操作收纳进“更多”菜单
  await page.goto('/book/add')
  await page.getByLabel('书名').fill('移动端响应式测试书')
  await page.getByLabel('作者').fill('Playwright')
  await page.getByLabel('封面链接').fill('https://example.com/cover.jpg')
  await page.getByLabel('简介').fill('响应式验收用例自动创建的图书')
  await page.getByRole('button', { name: /保\s*存/i }).click()
  await expect(page).toHaveURL(/book\/list/)

  const row = page.getByRole('row', { name: /移动端响应式测试书/ })
  await row.getByRole('button', { name: /更多图书操作/ }).click()
  await page.getByRole('menuitem', { name: '编辑' }).click()
  await expect(page).toHaveURL(/book\/edit\//)

  // 清理：回列表经“更多”菜单删除
  await page.goto('/book/list')
  const cleanupRow = page.getByRole('row', { name: /移动端响应式测试书/ })
  await cleanupRow.getByRole('button', { name: /更多图书操作/ }).click()
  await page.getByRole('menuitem', { name: '删除' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^(删除|确认|确\s*定)$/ }).click()
  await expect(page.getByText('移动端响应式测试书')).toHaveCount(0)

  // Escape 可关闭抽屉
  await page.getByRole('button', { name: '切换侧边栏' }).click()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('桌面端：长页面滚动时侧栏仍在视口内，路由切换后滚动复位', async ({ page }) => {
  // 矮视口 + 攒登录日志，保证日志页内容高度超过视口（用例自足，不依赖前序数据）
  await page.setViewportSize({ width: 1280, height: 600 })
  await login(page)
  for (let round = 0; round < 4; round++) {
    await page.getByRole('button', { name: '用户菜单' }).click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    await expect(page).toHaveURL(/login/)
    await login(page)
  }
  await page.goto('/log')

  // 滚动主内容区（wheel 事件落在内容区中心）
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 2400)
  await expect
    .poll(async () => page.locator('main').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)

  // 侧栏导航项仍完整处于视口内（未被长内容带出屏幕）
  const viewportHeight = page.viewportSize()?.height ?? 720
  const navItem = page.getByRole('link', { name: '日志管理' })
  const box = await navItem.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.y).toBeGreaterThanOrEqual(0)
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight)
  await expect(page.getByRole('navigation', { name: '侧边导航' })).toBeVisible()

  // 路由切换后主内容滚动复位（设计书 5.3）；点不同路由（仪表盘）才会触发 pathname 变化
  await page.getByRole('link', { name: '仪表盘' }).click()
  await expect(page).toHaveURL(/dashboard/)
  await expect.poll(() => page.locator('main').evaluate((element) => element.scrollTop)).toBe(0)
})

test('弹层动画定位：对话框居中、命令面板水平居中（无 translate 叠加位移）', async ({ page }) => {
  await login(page)

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('未能获取视口尺寸')

  // 建一本临时书用于触发删除确认框（管理端用户列表不含 root，不能依赖其行操作）
  await page.goto('/book/add')
  await page.getByLabel('书名').fill('弹层定位测试书')
  await page.getByLabel('作者').fill('Playwright')
  await page.getByLabel('封面链接').fill('https://example.com/cover.jpg')
  await page.getByLabel('简介').fill('弹层定位验收用例')
  await page.getByRole('button', { name: /保\s*存/i }).click()
  await expect(page).toHaveURL(/book\/list/)

  // 动画进行中取位置——若 keyframes 与 Tailwind 原生 translate 属性叠加，
  // 对话框中心会偏离视口中心 >200px
  const row = page.getByRole('row', { name: /弹层定位测试书/ })
  await row.getByRole('button', { name: '删除' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  if (!dialogBox) throw new Error('未能获取对话框位置')
  expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThan(60)
  expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThan(60)

  // Escape 取消（不动数据），再确认删除清理
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await row.getByRole('button', { name: '删除' }).click()
  await dialog.getByRole('button', { name: /^(删除|确认|确\s*定)$/ }).click()
  await expect(page.getByText('弹层定位测试书')).toHaveCount(0)

  // 命令面板水平居中
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await expect(palette).toBeVisible()
  const paletteBox = await palette.boundingBox()
  if (!paletteBox) throw new Error('未能获取命令面板位置')
  expect(Math.abs(paletteBox.x + paletteBox.width / 2 - viewport.width / 2)).toBeLessThan(60)
})

test('平板 768px：桌面侧栏与内联行操作生效，“更多”按钮隐藏', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await login(page)

  // md 断点（≥768px）：桌面侧栏渲染，折叠为图标宽度
  await expect(page.locator('aside')).toBeVisible()
  await page.getByRole('button', { name: '切换侧边栏' }).click()
  await expect
    .poll(async () =>
      page
        .locator('aside')
        .boundingBox()
        .then((box) => box?.width ?? 0),
    )
    .toBeLessThan(100)

  // 行操作保持内联按钮，“更多”菜单按钮隐藏
  await page.goto('/book/add')
  await page.getByLabel('书名').fill('平板断点测试书')
  await page.getByLabel('作者').fill('Playwright')
  await page.getByLabel('封面链接').fill('https://example.com/cover.jpg')
  await page.getByLabel('简介').fill('平板断点验收用例')
  await page.getByRole('button', { name: /保\s*存/i }).click()
  await expect(page).toHaveURL(/book\/list/)

  const row = page.getByRole('row', { name: /平板断点测试书/ })
  await expect(row.getByRole('button', { name: '编辑' })).toBeVisible()
  await expect(row.getByRole('button', { name: /更多图书操作/ })).toBeHidden()

  // 清理
  await row.getByRole('button', { name: '删除' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^(删除|确认|确\s*定)$/ }).click()
  await expect(page.getByText('平板断点测试书')).toHaveCount(0)
})

test('键盘完成登录：聚焦输入 + Enter 提交', async ({ page }) => {
  await page.goto('/login')
  const username = page.getByLabel(/用户名/i)
  const password = page.getByLabel(/密码/i)
  const submit = page.getByRole('button', { name: /登\s*录/i })

  await username.focus()
  await page.keyboard.type('root')
  await password.focus()
  await page.keyboard.type('123456')
  await submit.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/dashboard/)
})

test('桌面端：侧栏可折叠为图标宽度，命令面板 Ctrl+K 可导航', async ({ page }) => {
  await login(page)

  // 折叠至图标宽度（spring 0.42s，轮询等待宽度收敛）
  await page.getByRole('button', { name: '切换侧边栏' }).click()
  const sidebar = page.locator('aside')
  await expect
    .poll(async () => sidebar.boundingBox().then((box) => box?.width ?? 0))
    .toBeLessThan(100)

  // Ctrl/Cmd+K 命令面板：过滤后回车跳转
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox', { name: '搜索页面' }).fill('日志')
  await palette.getByRole('combobox', { name: '搜索页面' }).press('Enter')
  await expect(page).toHaveURL(/log/)
  await expect(palette).toBeHidden()
})
