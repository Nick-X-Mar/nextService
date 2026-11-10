import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

/** Where the app's own structured log lines go — the Monitoring stack's group. */
export const APP_LOG_GROUP = '/nextservice/app'

let client: CloudWatchLogsClient | null = null

/**
 * One CloudWatch Logs client for the server: the logger writes through it and
 * the admin Errors page reads through it. Same credential order as
 * dynamoService — explicit keys, else the project `.aws/` locally, else the
 * Amplify compute role.
 */
export function cloudWatchLogs(): CloudWatchLogsClient {
  if (client) return client

  // No requestTimeout: the SDK only warns when one passes, and a log write left
  // in flight when Amplify freezes the function always "passes" it on thaw.
  const config: ConstructorParameters<typeof CloudWatchLogsClient>[0] = {
    region: process.env.REGION || 'eu-central-1',
  }

  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
    }
  } else if (!['production', 'staging'].includes(process.env.NODE_ENV || '')) {
    try {
      config.credentials = fromIni({
        filepath: path.join(process.cwd(), '.aws', 'credentials'),
        configFilepath: path.join(process.cwd(), '.aws', 'config'),
        profile: 'default',
      })
    } catch {
      // fall through to the default credential chain
    }
  }

  client = new CloudWatchLogsClient(config)
  return client
}
