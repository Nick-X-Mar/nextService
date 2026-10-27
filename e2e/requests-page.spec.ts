import { test, expect } from '@playwright/test'
import { addRequest, createClientWithRequest } from './a-helpers'

/**
 * The client's request list is paged 20 at a time, newest first. The page used
 * to ignore `nextCursor`, so anything older than the first page simply never
 * appeared.
 */
test('Older requests appear after "Παλαιότερα αιτήματα"', async ({ browser }) => {
  test.setTimeout(180_000)
  const stamp = Date.now()
  const client = await createClientWithRequest(`e2e-reqpage-${stamp}@test.com`, 'TestPass123', {
    description: `Το παλαιότερο αίτημα ${stamp}`,
  })
  for (let i = 1; i <= 21; i++) {
    await addRequest(client.token, { description: `Αίτημα ${i} ${stamp}` })
  }

  const context = await browser.newContext()
  await context.addCookies([
    { name: 'auth-token', value: client.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
  const page = await context.newPage()
  await page.goto(`/requests/${client.clientId}/`)

  // 22 requests: the newest 20 load first, the very first one does not.
  // A page of 20 with offers and chat flags is a heavy first render in dev.
  await expect(page.getByText(`Αίτημα 21 ${stamp}`)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(`Το παλαιότερο αίτημα ${stamp}`)).toHaveCount(0)

  const more = page.getByRole('button', { name: 'Παλαιότερα αιτήματα' })
  await more.click()
  await expect(page.getByText(`Το παλαιότερο αίτημα ${stamp}`)).toBeVisible({ timeout: 45_000 })
  // Exhausted: the control goes away rather than offering an empty page.
  await expect(more).toHaveCount(0)
  await context.close()
})
