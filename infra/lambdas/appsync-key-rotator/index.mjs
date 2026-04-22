/**
 * NextService — AppSync API Key Rotator
 *
 * Triggered by an EventBridge monthly cron. For each `APPSYNC_API_ID` passed
 * in via env, we:
 *   1. List existing API keys.
 *   2. For each, call UpdateApiKey to push `Expires` to (now + 365 days) —
 *      the AWS hard limit for AppSync API keys.
 *
 * Why UpdateApiKey, not CreateApiKey + DeleteApiKey:
 *   UpdateApiKey *extends* the existing key — the key VALUE doesn't change.
 *   The Next.js client holds the same string it was serving, so live chat
 *   sessions never break. No redeploy needed, no user refresh.
 *
 * Self-contained — uses the AWS SDK v3 bundled with Node.js 20.
 */

import {
  AppSyncClient,
  ListApiKeysCommand,
  UpdateApiKeyCommand
} from '@aws-sdk/client-appsync'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const API_ID = process.env.APPSYNC_API_ID || ''
// 365 days is the AWS hard maximum for AppSync API key expiration.
const MAX_DAYS = 365

const client = new AppSyncClient({ region: REGION })

export const handler = async () => {
  if (!API_ID) {
    throw new Error('APPSYNC_API_ID env var not set')
  }

  const newExpires = Math.floor(Date.now() / 1000) + MAX_DAYS * 24 * 60 * 60

  const list = await client.send(new ListApiKeysCommand({ apiId: API_ID }))
  const keys = list.apiKeys || []
  if (keys.length === 0) {
    console.warn(`[rotator] No API keys found on ${API_ID} — nothing to rotate`)
    return { statusCode: 200, rotated: 0 }
  }

  const results = []
  for (const key of keys) {
    if (!key.id) continue
    try {
      await client.send(new UpdateApiKeyCommand({
        apiId: API_ID,
        id: key.id,
        description: key.description || 'NextService API key',
        expires: newExpires
      }))
      results.push({ id: key.id, status: 'rotated', newExpires })
      console.log(
        `[rotator] Extended key ${key.id} to ${new Date(newExpires * 1000).toISOString()}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results.push({ id: key.id, status: 'failed', error: msg })
      console.error(`[rotator] Failed to rotate key ${key.id}:`, msg)
    }
  }

  const failed = results.filter((r) => r.status === 'failed')
  if (failed.length > 0) {
    // Throw so the Lambda registers as errored → CW alarm fires.
    throw new Error(
      `[rotator] ${failed.length}/${results.length} keys failed to rotate`
    )
  }

  return { statusCode: 200, rotated: results.length, results }
}
