// TEMPORARY mobile audit — not part of the suite; deleted after the audit.
import { test, devices, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { newClient, newGarage, newRequest, makeOffer, acceptOffer, ageAppointment, signInGarage, api, type Party } from './p-helpers'
import { setAuthCookie } from './helpers'

const OUT = process.env.AUDIT_OUT!
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13']
void _ignored
const VIEWPORTS = {
  iphone: iphone,
  android360: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent },
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const W = window.innerWidth
    const H = window.innerHeight
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
    }
    const desc = (el: Element) => {
      const h = el as HTMLElement
      const cls = typeof h.className === 'string' ? h.className.split(/\s+/).slice(0, 5).join('.') : ''
      const text = (h.innerText || h.getAttribute('aria-label') || h.getAttribute('placeholder') || (h as HTMLInputElement).name || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      return `${el.tagName.toLowerCase()}.${cls} «${text}»`
    }
    const clippedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (s.overflowX !== 'visible') return true
      }
      return false
    }
    const overflow: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if ((r.right > W + 1 || r.left < -1) && !clippedByAncestor(el)) {
        const parent = el.parentElement
        const pr = parent?.getBoundingClientRect()
        if (pr && (pr.right > W + 1 || pr.left < -1) && !clippedByAncestor(parent!)) continue
        const pos = getComputedStyle(el).position
        overflow.push(`${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}] ${pos}`)
      }
    }
    const smallInputs: string[] = []
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const t = (el as HTMLInputElement).type
      if (['checkbox', 'radio', 'hidden', 'file', 'range', 'submit', 'button'].includes(t)) continue
      if (!visible(el)) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 16) smallInputs.push(`${desc(el)} ${fs}px`)
    }
    const smallTargets: string[] = []
    for (const el of document.querySelectorAll('a, button, [role="button"], input[type="checkbox"], input[type="radio"], select')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 32 || r.height < 32) {
        // inline text links inside paragraphs are fine
        if (el.tagName === 'A' && el.closest('p, li') && r.height >= 16) continue
        smallTargets.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    // What a fixed bar covers once scrolled all the way down: unreachable.
    window.scrollTo(0, document.documentElement.scrollHeight)
    const covered: string[] = []
    for (const el of document.querySelectorAll('a, button, input, select, textarea, [role="button"]')) {
      if (!visible(el)) continue
      if (getComputedStyle(el).position === 'fixed' || el.closest('nav, header, [class*="fixed"]')) continue
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > H) continue
      const cx = r.left + r.width / 2
      const cy = Math.min(r.top + r.height / 2, H - 1)
      const hit = document.elementFromPoint(Math.max(0, Math.min(cx, W - 1)), cy)
      if (hit && !el.contains(hit) && !hit.contains(el)) {
        let fixed: Element | null = hit
        while (fixed && getComputedStyle(fixed).position !== 'fixed' && getComputedStyle(fixed).position !== 'sticky') fixed = fixed.parentElement
        if (fixed) covered.push(`${desc(el)} under ${desc(fixed).slice(0, 60)}`)
      }
    }
    window.scrollTo(0, 0)
    return {
      W,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflow: overflow.slice(0, 12),
      smallInputs: smallInputs.slice(0, 12),
      smallTargets: [...new Set(smallTargets)].slice(0, 20),
      covered: covered.slice(0, 10),
    }
  })
}

interface Ctx { client: Party; garage: Party; pending: Party; reqOpen: string; reqBooked: string; reqDue: string; reqNew: string }
let ctx: Ctx

test.describe.configure({ mode: 'serial' })

test('seed', async () => {
  test.setTimeout(120_000)
  const client = await newClient('mob', { firstName: 'Γιώργος', lastName: 'Παπαδόπουλος', phoneNumber: '6912345678', address: 'Λεωφόρος Κηφισίας 100, Μαρούσι' })
  const garage = await newGarage('mobile-garage-a')
  const garageB = await newGarage('mobile-garage-b')
  const pending = await newGarage('mobile-pending', { active: false })
  const ids = (n: number) => ({ licensePlate: `ΙΚΧ${1000 + n}`, vinNumber: `VF3ABCDEF1234567${n}`, engineNumber: `HN0${n}123` })
  const reqOpen = (await newRequest(client, ids(1), 'Θέλω αλλαγή λαδιών και φίλτρων, κάνει και ένα θόρυβο στο φρενάρισμα από μπροστά αριστερά.')).requestId
  const reqBooked = (await newRequest(client, ids(2), 'Service 60.000 χλμ')).requestId
  const reqDue = (await newRequest(client, ids(3), 'Αλλαγή λαδιών')).requestId
  const reqNew = (await newRequest(client, ids(4), 'Νέο αίτημα χωρίς προσφορά από το συνεργείο')).requestId
  await makeOffer(garage, reqOpen)
  await makeOffer(garageB, reqOpen)
  await api(`/api/chat/${reqOpen}/messages/`, { method: 'POST', token: garage.token, body: { message: 'Καλημέρα! Μπορείτε να φέρετε το αυτοκίνητο Τρίτη πρωί; Θα το ελέγξουμε και για τα φρένα χωρίς χρέωση.' } })
  await api(`/api/chat/${reqOpen}/messages/`, { method: 'POST', token: client.token, body: { message: 'Ναι, Τρίτη στις 9 είναι μια χαρά.', garageId: garage.id } })
  const offerBooked = await makeOffer(garage, reqBooked)
  await acceptOffer(client, reqBooked, offerBooked)
  const offerDue = await makeOffer(garage, reqDue)
  await acceptOffer(client, reqDue, offerDue)
  await ageAppointment(reqDue, offerDue)
  ctx = { client, garage, pending, reqOpen, reqBooked, reqDue, reqNew }
  fs.writeFileSync(path.join(OUT, 'ctx.json'), JSON.stringify({ clientId: client.id, garageId: garage.id, reqOpen, reqBooked, reqDue, reqNew }, null, 2))
})

type Who = 'anon' | 'client' | 'garage' | 'pending'
const pages = (): [Who, string, string][] => {
  const c = ctx.client.id
  const g = ctx.garage.id
  return [
    ['anon', 'home', '/'],
    ['anon', 'car-details', '/car-details/?new=1'],
    ['anon', 'login', '/login/'],
    ['anon', 'forgot', '/forgot-password/'],
    ['anon', 'register-pro', '/register-professional/'],
    ['anon', 'about', '/about/'],
    ['anon', 'faq', '/faq/'],
    ['anon', 'locations', '/locations/'],
    ['anon', 'location', '/location/peiraias/'],
    ['anon', 'offer-deal', '/offer/set_disk_all_cars/'],
    ['anon', 'offers-list', '/offer/'],
    ['anon', 'terms', '/terms/'],
    ['anon', 'privacy', '/privacy/'],
    ['anon', 'contact', '/contact/'],
    ['anon', '404', '/does-not-exist/'],
    ['client', 'c-home', '/'],
    ['client', 'c-requests', `/requests/${c}/`],
    ['client', 'c-appointments', `/requests/${c}/?tab=appointment`],
    ['client', 'c-details-open', `/requests/${c}/details/${ctx.reqOpen}/`],
    ['client', 'c-details-booked', `/requests/${c}/details/${ctx.reqBooked}/`],
    ['client', 'c-details-due', `/requests/${c}/details/${ctx.reqDue}/`],
    ['client', 'c-chats', `/requests/${c}/chats/`],
    ['client', 'c-chat', `/requests/${c}/chats/${ctx.reqOpen}/?garageId=${g}`],
    ['client', 'c-profile', `/profile/${c}/`],
    ['client', 'c-car-details', '/car-details/?new=1'],
    ['garage', 'g-requests', `/garage-dashboard/${g}/?tab=requests`],
    ['garage', 'g-offers', `/garage-dashboard/${g}/?tab=offers`],
    ['garage', 'g-appointments', `/garage-dashboard/${g}/?tab=appointments`],
    ['garage', 'g-settings', `/garage-dashboard/${g}/?tab=settings`],
    ['garage', 'g-offer-new', `/garage-dashboard/${g}/offers/${ctx.reqNew}/`],
    ['garage', 'g-offer-edit', `/garage-dashboard/${g}/offers/${ctx.reqOpen}/`],
    ['garage', 'g-chats', `/garage-dashboard/${g}/chats/`],
    ['garage', 'g-chats-appts', `/garage-dashboard/${g}/chats/appointments/`],
    ['garage', 'g-chat', `/garage-dashboard/${g}/chat/${ctx.reqOpen}/`],
    ['pending', 'p-dashboard', `/garage-dashboard/${ctx.pending.id}/`],
    ['pending', 'p-register', '/register-professional/'],
  ]
}

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  test(`audit ${vpName}`, async ({ browser, browserName }) => {
    test.setTimeout(900_000)
    const report: Record<string, unknown> = {}
    const contexts: Partial<Record<Who, Page>> = {}
    const pageFor = async (who: Who) => {
      if (contexts[who]) return contexts[who]!
      const context = await browser.newContext({ ...vp, baseURL: 'http://localhost:3000' })
      const page = await context.newPage()
      if (who === 'client') {
        await setAuthCookie(page, ctx.client.token)
        await page.goto('/')
        const me = await api('/api/auth/me/', { token: ctx.client.token })
        await page.evaluate((u) => {
          localStorage.setItem('clientUser', JSON.stringify(u))
          localStorage.setItem('userType', 'client')
        }, me.data.user ?? me.data.client ?? { id: ctx.client.id })
      } else if (who === 'garage') {
        await signInGarage(page, ctx.garage)
      } else if (who === 'pending') {
        await signInGarage(page, ctx.pending)
      }
      contexts[who] = page
      return page
    }
    for (const [who, name, url] of pages()) {
      const page = await pageFor(who)
      const errors: string[] = []
      const onErr = (e: Error) => errors.push(`pageerror: ${e.message.slice(0, 150)}`)
      const onConsole = (m: { type: () => string; text: () => string }) => {
        if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 150)}`)
      }
      page.on('pageerror', onErr)
      page.on('console', onConsole)
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(800)
        const m = await metrics(page)
        const file = `${browserName}-${vpName}-${name}`
        await page.screenshot({ path: path.join(OUT, `${file}.png`) })
        await page.screenshot({ path: path.join(OUT, `${file}-full.png`), fullPage: true })
        report[name] = { url, finalUrl: page.url().replace('http://localhost:3000', ''), ...m, errors }
      } catch (e) {
        report[name] = { url, failed: String(e).slice(0, 200), errors }
      }
      page.off('pageerror', onErr)
      page.off('console', onConsole)
    }
    fs.writeFileSync(path.join(OUT, `report-${browserName}-${vpName}.json`), JSON.stringify(report, null, 2))
  })
}
