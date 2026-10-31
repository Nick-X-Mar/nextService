import { test, expect, type APIRequestContext } from '@playwright/test'
import { freshClient, mechanicalRequest } from './b-helpers'
import { emailsTo } from './E-helpers'

/**
 * The email editor: every email the platform sends is listed, an admin can
 * rewrite its copy, the next real email goes out with it, and reset brings
 * the shipped copy back. Local mail is logged as `skipped`, with its subject.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nextservice.gr'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

let adminCookie = ''

async function loginAdmin(request: APIRequestContext) {
  const resp = await request.post('/api/admin/auth/login/', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  const match = (resp.headers()['set-cookie'] || '').match(/ns-admin-session=([^;]+)/)
  return match ? `ns-admin-session=${match[1]}` : ''
}

const TEMPLATE = 'request_confirmation'

test.describe.serial('Admin email editor', () => {
  test('Setup: admin login', async ({ request }) => {
    adminCookie = await loginAdmin(request)
    expect(adminCookie).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    if (adminCookie) {
      await request.delete(`/api/admin/emails/templates/${TEMPLATE}/`, { headers: { Cookie: adminCookie } })
    }
  })

  test('Lists every email, including the two the Lambdas send', async ({ request }) => {
    const resp = await request.get('/api/admin/emails/templates/?preview=1', { headers: { Cookie: adminCookie } })
    expect(resp.status()).toBe(200)
    const { emails } = await resp.json()
    const names = emails.map((e: { name: string }) => e.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'request_confirmation',
        'new_offer_received',
        'new_chat_message',
        'new_request_for_garages',
        'completion_prompt_garage',
      ])
    )
    for (const email of emails) {
      expect(email.preview.subject).toBeTruthy()
      // Every example fills every token: nothing is left as a literal `{…}`.
      expect(email.preview.html).not.toMatch(/\{[^{}\s]+\}/)
    }
  })

  test('Unauthenticated callers are rejected', async ({ request }) => {
    expect((await request.get('/api/admin/emails/templates/')).status()).toBe(401)
    const write = await request.put(`/api/admin/emails/templates/${TEMPLATE}/`, {
      data: { subject: 'x', heading: '', body: 'x', ctaLabel: 'x', note: '' },
    })
    expect(write.status()).toBe(401)
  })

  test('Refuses unknown fields, HTML and a missing button', async ({ request }) => {
    const base = { subject: 'Θέμα', heading: '', body: 'Κείμενο', ctaLabel: 'Δες', note: '' }
    const put = (data: Record<string, string>) =>
      request.put(`/api/admin/emails/templates/${TEMPLATE}/`, { headers: { Cookie: adminCookie }, data })

    const unknown = await put({ ...base, body: 'Γεια σου {όνομα_που_δεν_υπάρχει}' })
    expect(unknown.status()).toBe(400)
    expect((await unknown.json()).error).toContain('Άγνωστο πεδίο')

    expect((await put({ ...base, body: '<a href="https://evil.example">x</a>' })).status()).toBe(400)
    expect((await put({ ...base, ctaLabel: '' })).status()).toBe(400)
  })

  test('Bold and fields render, and an email without a link gets no button', async ({ request }) => {
    const resp = await request.post('/api/admin/emails/templates/cancellation_confirmation_client/preview/', {
      headers: { Cookie: adminCookie },
      data: {
        subject: 'Ακύρωση',
        heading: 'Ακυρώθηκε',
        body: 'Πρώτη παράγραφος με **{συνεργείο}**.\n\nΔεύτερη με {πόντοι} πόντους.',
        ctaLabel: '',
        note: '',
      },
    })
    expect(resp.status()).toBe(200)
    const { preview } = await resp.json()
    expect(preview.html).toContain('<strong>Auto Fix Παπαδόπουλος</strong>')
    expect(preview.html).toContain('Δεύτερη με 27 πόντους')
    // No CTA URL on this email, so no button.
    expect(preview.html).not.toContain('<a href=')
  })

  test('The next real email goes out with the edited copy; reset restores it', async ({ request, playwright }) => {
    const marker = `E2E θέμα ${Date.now()}`
    const save = await request.put(`/api/admin/emails/templates/${TEMPLATE}/`, {
      headers: { Cookie: adminCookie },
      data: {
        subject: `${marker} — {αυτοκίνητο}`,
        heading: 'Ευχαριστούμε!',
        body: 'Το αίτημα για **{κατηγορία}** καταχωρήθηκε.',
        ctaLabel: 'Δες το αίτημά σου',
        note: '',
      },
    })
    expect(save.status()).toBe(200)
    expect((await save.json()).email.customized).toBe(true)

    // A signed-in client filing a request gets the confirmation too.
    const client = await freshClient(playwright, 'email-copy')
    const filed = await client.api.post('/api/service-request/', { data: mechanicalRequest() })
    expect(filed.ok()).toBeTruthy()

    await expect
      .poll(async () => (await emailsTo(client.email, TEMPLATE)).map((r) => r.subject))
      .toContain(`${marker} — Peugeot 206`)

    const reset = await request.delete(`/api/admin/emails/templates/${TEMPLATE}/`, { headers: { Cookie: adminCookie } })
    expect(reset.status()).toBe(200)
    const after = await (await request.get(`/api/admin/emails/templates/${TEMPLATE}/`, { headers: { Cookie: adminCookie } })).json()
    expect(after.email.customized).toBe(false)
    expect(after.email.copy.subject).toBe('Λάβαμε το αίτημά σου')
    await client.api.dispose()
  })

  test('The editor page shows the live preview and saves', async ({ page, context }) => {
    const [name, value] = adminCookie.split('=')
    await context.addCookies([{ name, value, url: 'http://localhost:3000' }])
    await page.goto(`/admin/emails/templates/${TEMPLATE}/`)
    await expect(page.getByRole('heading', { name: 'Επιβεβαίωση αιτήματος' })).toBeVisible()

    const subject = page.locator('input').first()
    await subject.fill('Νέο θέμα από E2E')
    await expect(page.getByText('Θέμα: Νέο θέμα από E2E')).toBeVisible()
    await page.getByRole('button', { name: 'Αποθήκευση' }).click()
    await expect(page.getByText(/Αποθηκεύτηκε/)).toBeVisible()
  })
})
