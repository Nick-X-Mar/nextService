/**
 * The marketplace routes answer a garage that an admin has not approved (or has
 * since deactivated) with 403 `{ code: 'GARAGE_INACTIVE' }`. The cached session
 * can still say "active" when that happens — deactivation does not reach an
 * open tab — so every dashboard fetch checks for it and hands the dashboard
 * back to the pending screen instead of showing an error or an empty list.
 */
export function isGarageInactive(response: Response, body: unknown): boolean {
  return (
    response.status === 403 &&
    !!body &&
    typeof body === 'object' &&
    (body as { code?: unknown }).code === 'GARAGE_INACTIVE'
  )
}
