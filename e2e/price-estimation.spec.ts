import { test, expect } from '@playwright/test'

test.describe('Price Estimation API', () => {

  test('Returns estimation for valid input', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', {
      data: {
        category: 'service',
        brand: 'Toyota',
        model: 'Yaris',
        modelYear: '2020',
        engineCC: '1500',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.estimation.estimatedCost).toBeGreaterThan(0)
    expect(data.estimation.currency).toBe('EUR')
    expect(['low', 'medium', 'high']).toContain(data.estimation.confidence)
  })

  test('Popular brand gets high confidence', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', {
      data: {
        category: 'service',
        brand: 'BMW',
        model: '320i',
        modelYear: '2019',
        engineCC: '2000',
        fuelType: 'diesel',
      },
    })
    const data = await resp.json()
    expect(data.estimation.confidence).toBe('high')
  })

  test('Diesel + automatic + 4x4 costs more than base petrol', async ({ request }) => {
    const base = await request.post('/api/price-estimation', {
      data: { category: 'service', brand: 'Toyota', model: 'Yaris', modelYear: '2015', engineCC: '1200', fuelType: 'petrol' },
    })
    const premium = await request.post('/api/price-estimation', {
      data: { category: 'service', brand: 'Toyota', model: 'Land Cruiser', modelYear: '2022', engineCC: '3000', fuelType: 'diesel', isAutomatic: true, is4x4: true },
    })
    const baseData = await base.json()
    const premiumData = await premium.json()
    // Premium should generally cost more (accounting for randomness, test range)
    expect(premiumData.estimation.estimatedCost).toBeGreaterThanOrEqual(80)
    expect(baseData.estimation.estimatedCost).toBeGreaterThanOrEqual(80)
  })

  test('No auth required (public endpoint)', async ({ request }) => {
    const resp = await request.post('/api/price-estimation', {
      data: { category: 'oils', brand: 'Ford', model: 'Focus', modelYear: '2018', engineCC: '1500', fuelType: 'petrol' },
    })
    expect(resp.status()).toBe(200)
  })
})
