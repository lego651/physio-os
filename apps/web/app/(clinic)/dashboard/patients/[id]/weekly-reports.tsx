import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, ExternalLink } from 'lucide-react'

interface Report {
  id: string
  week_start: string
  summary: string | null
  insights: string[] | null
  token: string
  created_at: string
}

export async function WeeklyReports({ patientId }: { patientId: string }) {
  const supabase = createAdminClient()

  const { data: reports } = await supabase
    .from('reports')
    .select('id, week_start, summary, insights, token, created_at')
    .eq('patient_id', patientId)
    .order('week_start', { ascending: false })

  const reportList = (reports ?? []) as Report[]

  if (reportList.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Weekly Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-muted-foreground">No weekly reports generated yet</p>
        </CardContent>
      </Card>
    )
  }

  const latest = reportList[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Weekly Reports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Latest insights */}
        {latest.insights && latest.insights.length > 0 && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Latest Insights</p>
            <ul className="space-y-1">
              {latest.insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Report list */}
        <div className="space-y-2">
          {reportList.map((report, i) => {
            const weekEnd = new Date(report.week_start)
            weekEnd.setDate(weekEnd.getDate() + 6)
            const start = new Date(report.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const end = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <a
                key={report.id}
                href={`/report/${report.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {start} – {end}
                      {i === 0 && (
                        <Badge className="ml-2 bg-primary/10 text-primary">Latest</Badge>
                      )}
                    </p>
                    {report.summary && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {report.summary}
                      </p>
                    )}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
