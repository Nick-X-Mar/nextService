import { test, expect } from '@playwright/test'
import { freshClient, getRow } from './b-helpers'
import { TABLES } from '../src/lib/tables'

/**
 * The estimate only answers for a car we have already quoted: same brand/model, model
 * year within one, and — outside bodywork — same fuel, cc and turbo/4x4. Everything else
 * comes back as `estimation: null` so the UI shows no price at all. The fixtures below
 * are real rows of src/data/price-examples.json (Peugeot 206 1.4 βενζίνη, συμπλέκτης).
 */
const PEUGEOT_206 = {
  category: 'symplektis',
  brand: 'Peugeot',
  model: '206',
  modelYear: '2006',
  engineCC: '1400',
  fuelType: 'petrol',
  is4x4: false,
  isTurbo: false,
}

test.describe('Price Estimation API', () => {

  test('Car we have quoted before gets a price', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', { data: PEUGEOT_206 })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.estimation.estimatedCost).toBeGreaterThan(0)
    expect(data.estimation.currency).toBe('EUR')
    expect(data.estimation.basedOnPastJobs).toBeGreaterThan(0)
    // The jobs it drew on are within a year of what was asked.
    expect(data.estimation.yearFrom).toBeGreaterThanOrEqual(2005)
    expect(data.estimation.yearTo).toBeLessThanOrEqual(2007)
  })

  test('Same car with a different engine gets no price', async ({ request }) => {
    for (const variant of [
      { ...PEUGEOT_206, fuelType: 'diesel' },
      { ...PEUGEOT_206, engineCC: '2000' },
      { ...PEUGEOT_206, isTurbo: true },
      { ...PEUGEOT_206, modelYear: '2015' },
    ]) {
      const resp = await request.post('/api/price-estimation', { data: variant })
      expect(resp.status()).toBe(200)
      expect((await resp.json()).estimation).toBeNull()
    }
  })

  test('Car we have never quoted gets no price', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', {
      data: { ...PEUGEOT_206, brand: 'Ferrari', model: 'F40' },
    })
    expect(resp.status()).toBe(200)
    expect((await resp.json()).estimation).toBeNull()
  })

  test('Category with no history gets no price', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', {
      data: { ...PEUGEOT_206, category: 'kteo' },
    })
    expect(resp.status()).toBe(200)
    expect((await resp.json()).estimation).toBeNull()
  })

  test('No auth required (public endpoint)', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', { data: PEUGEOT_206 })
    expect(resp.status()).toBe(200)
  })
})

test.describe('Estimate on bodywork and on the stored request', () => {
  // A real meriki-vafi row of price-examples.json; bodywork skips the engine gate.
  const PUNTO_BODYWORK = { category: 'meriki-vafi', brand: 'Fiat', model: 'Punto', modelYear: '1997' }

  test('Bodywork is priced without any engine details', async ({ request }) => {
    const resp = await request.post('/api/price-estimation/', { data: PUNTO_BODYWORK })
    const data = await resp.json()
    expect(data.estimation?.estimatedCost).toBeGreaterThan(0)
  })

  test('The request stores the server\'s estimate, not the one the browser sends', async ({ playwright, request }) => {
    const { api } = await freshClient(playwright, 'estimate')
    const expected = (await (await request.post('/api/price-estimation/', { data: PEUGEOT_206 })).json()).estimation

    const priced = await (await api.post('/api/service-request/', {
      data: { ...PEUGEOT_206, estimatedCost: 1 },
    })).json()
    expect((await getRow(TABLES.ServiceRequests, priced.serviceRequestId))?.estimatedCost).toBe(expected.estimatedCost)

    const bodywork = await (await api.post('/api/service-request/', { data: PUNTO_BODYWORK })).json()
    const bodyworkExpected = (await (await request.post('/api/price-estimation/', { data: PUNTO_BODYWORK })).json()).estimation
    expect((await getRow(TABLES.ServiceRequests, bodywork.serviceRequestId))?.estimatedCost).toBe(bodyworkExpected.estimatedCost)

    // A car we have never quoted carries no estimate at all, whatever was sent.
    const unpriced = await (await api.post('/api/service-request/', {
      data: { ...PEUGEOT_206, brand: 'Ferrari', model: 'F40', estimatedCost: 999 },
    })).json()
    expect((await getRow(TABLES.ServiceRequests, unpriced.serviceRequestId))?.estimatedCost).toBeUndefined()
  })
})

test('An unreadable or empty body is a 400, not a 500', async ({ request }) => {
  // The form's request is aborted mid-body whenever the user navigates away;
  // reading that as a 500 filled the admin error log with noise.
  for (const data of ['', 'null', '{not json', '[]']) {
    const resp = await request.post('/api/price-estimation/', {
      headers: { 'Content-Type': 'application/json' },
      data,
    })
    expect(resp.status(), JSON.stringify(data)).toBe(400)
  }
})
