import { Card, CardContent } from '@/components/ui/card'

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Patient Detail</h1>
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">Patient {id}</p>
          <p className="text-sm">Metrics, conversation history, and reports will appear here in Sprint 5.</p>
        </CardContent>
      </Card>
    </div>
  )
}
