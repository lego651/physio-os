import { getCurrentMonthUsage } from '@/lib/sms/cost-tracker'
import { verifyBearerToken } from '@/lib/auth/verify-bearer'

/**
 * GET /api/admin/sms-usage
 *
 * Returns SMS segment count and cost estimate for the current calendar month.
 * Protected by a static ADMIN_API_KEY environment variable (Bearer token).
 */
export async function GET(req: Request) {
  const adminKey = process.env.ADMIN_API_KEY
  if (!adminKey) {
    console.error('[admin/sms-usage] ADMIN_API_KEY environment variable is not set')
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (!verifyBearerToken(req, adminKey)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const usage = await getCurrentMonthUsage()
    return Response.json(usage)
  } catch (err) {
    console.error('[admin/sms-usage] Failed to fetch usage:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
