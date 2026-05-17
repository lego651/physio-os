# Cron Jobs

## Weekly Report (`/api/cron/weekly-report`)
- Schedule: Every Sunday at 9:00 AM PST (17:00 UTC)
- Purpose: Generates weekly reports for all active patients with data and sends SMS notifications
- Auth: Requires `CRON_SECRET` via `Authorization: Bearer <token>` header

## Inactivity Nudge (`/api/cron/nudge`)
- Schedule: Daily at 10:00 AM PST (18:00 UTC)
- Purpose: Sends personalized nudge SMS to patients inactive for 3+ days
- Auth: Requires `CRON_SECRET` via `Authorization: Bearer <token>` header

## Manual Testing
```bash
# Test weekly report cron
curl -X GET https://your-app.vercel.app/api/cron/weekly-report \
  -H "Authorization: Bearer $CRON_SECRET"

# Test nudge cron
curl -X GET https://your-app.vercel.app/api/cron/nudge \
  -H "Authorization: Bearer $CRON_SECRET"

# Local testing
curl -X GET http://localhost:3000/api/cron/weekly-report \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Environment Variables
- `CRON_SECRET`: Auto-set by Vercel for cron routes. Set manually in `.env.local` for local testing.
