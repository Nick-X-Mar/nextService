/**
 * The AppSync Events channel of one chat thread (a request × a garage).
 *
 * AppSync allows at most four segments after the namespace, each at most 50
 * characters of letters, digits and dashes. The ids therefore get segments of
 * their own: the old single-segment `request-{requestId}-garage-{garageId}` ran
 * to ~100 characters, and AppSync refused every subscribe to it with "Invalid
 * Channel Format" before the authorizer was even asked.
 *
 * The authorizer (`infra/lambdas/appsync-authorizer`) and the local mock parse
 * this exact shape — change all three together.
 */
export function chatChannel(requestId: string, garageId: string): string {
  return `request/${requestId}/garage/${garageId}`
}
