import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * The content CMS: an admin edits a public page's copy and the change is live
 * without a deploy, while the SEO surface (metadata, JSON-LD) keeps tracking
 * what the page actually renders.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nextservice.gr'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

let adminCookie = ''

async function loginAdmin(request: APIRequestContext) {
  const resp = await request.post('/api/admin/auth/login/', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  const setCookie = resp.headers()['set-cookie'] || ''
  const match = setCookie.match(/ns-admin-session=([^;]+)/)
  return { status: resp.status(), token: match ? match[1] : '' }
}

test.describe.serial('Admin content CMS', () => {
  test('Setup: admin login', async ({ request }) => {
    const { status, token } = await loginAdmin(request)
    expect(status).toBe(200)
    expect(token).toBeTruthy()
    adminCookie = `ns-admin-session=${token}`
  })

  test('The content index lists every editable page and area', async ({ request }) => {
    const resp = await request.get('/api/admin/content/', { headers: { Cookie: adminCookie } })
    expect(resp.status()).toBe(200)
    const data = await resp.json()

    const keys = data.pages.map((p: { pageKey: string }) => p.pageKey)
    expect(keys).toEqual(
      expect.arrayContaining(['about', 'faq', 'locations', 'terms', 'privacy', 'contact', 'home-faq'])
    )
    expect(data.areas.length).toBeGreaterThan(0)
    expect(data.areas[0]).toHaveProperty('slug')
  })

  test('Unauthenticated callers are rejected', async ({ request }) => {
    const resp = await request.get('/api/admin/content/')
    expect(resp.status()).toBe(401)

    const write = await request.put('/api/admin/content/pages/about/', {
      data: { meta: { title: 'x' }, hero: { title: 'x' }, blocks: [] },
    })
    expect(write.status()).toBe(401)
  })

  test('Editing a page changes the public page', async ({ request, page: browserPage }) => {
    const stamp = Date.now()
    const marker = `E2E CMS ${stamp}`

    // Start from the shipped copy so the suite is re-runnable — block ids must
    // be unique within a document, and a previous run's blocks would collide.
    await request.delete('/api/admin/content/pages/about/', { headers: { Cookie: adminCookie } })

    const current = await request.get('/api/admin/content/pages/about/', {
      headers: { Cookie: adminCookie },
    })
    expect(current.status()).toBe(200)
    const { page } = await current.json()

    page.blocks = [
      { id: `e2e-heading-${stamp}`, type: 'heading', text: marker },
      { id: `e2e-paragraph-${stamp}`, type: 'paragraph', text: 'Δοκιμαστικό **κείμενο** με [σύνδεσμο](/faq/).' },
      ...page.blocks,
    ]

    const save = await request.put('/api/admin/content/pages/about/', {
      headers: { Cookie: adminCookie },
      data: page,
    })
    expect(save.status()).toBe(200)

    // Assert against the rendered DOM, not the HTML source: React Server
    // Components also serialise the raw props into the flight payload, so the
    // unparsed `**...**` legitimately appears in the source either way.
    await browserPage.goto('/about/')
    await expect(browserPage.getByRole('heading', { name: marker })).toBeVisible()
    await expect(browserPage.locator('strong', { hasText: 'κείμενο' })).toBeVisible()
    await expect(browserPage.getByRole('link', { name: 'σύνδεσμο' })).toHaveAttribute('href', '/faq/')
    // The markup characters must not survive into the text the reader sees.
    const rendered = await browserPage.locator('main, body').first().innerText()
    expect(rendered).not.toContain('**κείμενο**')
  })

  test('Resetting restores the copy compiled into the build', async ({ request }) => {
    const reset = await request.delete('/api/admin/content/pages/about/', {
      headers: { Cookie: adminCookie },
    })
    expect(reset.status()).toBe(200)

    const publicPage = await request.get('/about/')
    const html = await publicPage.text()
    expect(html).toContain('Το πρόβλημα που λύνουμε')
    expect(html).not.toContain('E2E CMS')
  })


  test('A javascript: link is refused rather than stored', async ({ request }) => {
    const current = await request.get('/api/admin/content/pages/contact/', {
      headers: { Cookie: adminCookie },
    })
    const { page } = await current.json()
    page.blocks = [
      { id: 'evil-cta', type: 'cta', label: 'Κλικ', href: 'javascript:alert(1)', variant: 'primary' },
    ]

    const save = await request.put('/api/admin/content/pages/contact/', {
      headers: { Cookie: adminCookie },
      data: page,
    })
    expect(save.status()).toBe(400)
    const body = await save.json()
    expect(body.error).toContain('δεν επιτρέπεται')
  })

  test('Duplicate block ids are refused', async ({ request }) => {
    const current = await request.get('/api/admin/content/pages/contact/', {
      headers: { Cookie: adminCookie },
    })
    const { page } = await current.json()
    page.blocks = [
      { id: 'same-id', type: 'heading', text: 'Ένα' },
      { id: 'same-id', type: 'heading', text: 'Δύο' },
    ]
    const save = await request.put('/api/admin/content/pages/contact/', {
      headers: { Cookie: adminCookie },
      data: page,
    })
    expect(save.status()).toBe(400)
    expect((await save.json()).error).toContain('Διπλό id')
  })

  test('An unknown page key is a 404, not a new document', async ({ request }) => {
    const resp = await request.put('/api/admin/content/pages/not-a-page/', {
      headers: { Cookie: adminCookie },
      data: { meta: { title: 'x' }, hero: { title: 'x' }, blocks: [] },
    })
    expect(resp.status()).toBe(404)
  })

  test('Area copy is editable and the slug cannot be changed', async ({ request }) => {
    const index = await request.get('/api/admin/content/', { headers: { Cookie: adminCookie } })
    const { areas } = await index.json()
    const slug: string = areas[0].slug

    const current = await request.get(`/api/admin/content/areas/${slug}/`, {
      headers: { Cookie: adminCookie },
    })
    expect(current.status()).toBe(200)
    const { area } = await current.json()

    const marker = `E2E περιοχή ${Date.now()}`
    const save = await request.put(`/api/admin/content/areas/${slug}/`, {
      headers: { Cookie: adminCookie },
      // A renamed slug in the body must be ignored: these slugs are the
      // targets of the legacy WordPress 301 map.
      data: { ...area, slug: 'hijacked-slug', intro: marker },
    })
    expect(save.status()).toBe(200)
    const saved = await save.json()
    expect(saved.area.slug).toBe(slug)

    const publicPage = await request.get(`/location/${slug}/`)
    expect(publicPage.status()).toBe(200)
    expect(await publicPage.text()).toContain(marker)

    // Put the original copy back so the suite stays re-runnable.
    const restore = await request.put(`/api/admin/content/areas/${slug}/`, {
      headers: { Cookie: adminCookie },
      data: area,
    })
    expect(restore.status()).toBe(200)
  })

  test('The FAQ page keeps its JSON-LD in step with what it renders', async ({ request }) => {
    const resp = await request.get('/faq/')
    const html = await resp.text()
    expect(html).toContain('FAQPage')
    // The repo allows exactly one ld+json script per page — see src/lib/seo.ts.
    // Count real tags: the string also occurs in the RSC flight payload, where
    // it is inert data rather than a second block of structured data.
    const scripts = html.match(/<script[^>]+type="application\/ld\+json"/g) || []
    expect(scripts.length).toBe(1)
  })
})
