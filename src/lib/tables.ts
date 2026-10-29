/**
 * Every DynamoDB table the app talks to, named once.
 *
 * In AWS the stages are separated by region (see CLAUDE.md → Infrastructure),
 * so the names are the literal ones the CDK stack creates and `TABLE_PREFIX`
 * stays unset. The prefix exists for running a second, isolated set of tables
 * against the same endpoint (e.g. a throwaway local or test copy). It is not
 * provisioned by CDK: setting it in AWS would also need the tables, the
 * Amplify role's grants and the Lambdas' env vars renamed, or every call fails
 * with AccessDenied / ResourceNotFound.
 *
 * The per-table env overrides predate the prefix and replace the whole name.
 */
const PREFIX = process.env.TABLE_PREFIX || ''

const table = (name: string, override?: string) => override || `${PREFIX}${name}`

export const TABLES = {
  Clients: table('Clients'),
  Garages: table('Garages'),
  Vehicles: table('Vehicles'),
  ServiceRequests: table('ServiceRequests'),
  Offers: table('Offers'),
  ChatMessages: table('ChatMessages'),
  Reviews: table('Reviews', process.env.REVIEWS_TABLE),
  AdminUsers: table('AdminUsers', process.env.ADMIN_USERS_TABLE),
  ErrorResolutions: table('ErrorResolutions', process.env.ERROR_RESOLUTIONS_TABLE),
  EventLogs: table('EventLogs', process.env.EVENT_LOGS_TABLE),
  EmailLogs: table('EmailLogs', process.env.EMAIL_LOGS_TABLE),
  HotDeals: table('HotDeals', process.env.HOT_DEALS_TABLE),
  Payments: table('Payments', process.env.PAYMENTS_TABLE),
  WalletTransactions: table('WalletTransactions', process.env.WALLET_TRANSACTIONS_TABLE),
  PerformanceMetrics: table('PerformanceMetrics', process.env.PERFORMANCE_TABLE),
  SiteContent: table('SiteContent', process.env.SITE_CONTENT_TABLE),
} as const
