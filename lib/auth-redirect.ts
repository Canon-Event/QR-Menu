// Return to our owner or staff workspace, retaining the origin allowlist.
export function dashboardReturnPath(value: string | null, origin: string) {
  if (!value) return '/dashboard'
  try {
    const url = new URL(value, origin)
    if (url.origin === origin && (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/') || url.pathname === '/staff' || url.pathname.startsWith('/staff/'))) return url.pathname + url.search
  } catch { /* Invalid return links go to the dashboard home. */ }
  return '/dashboard'
}
