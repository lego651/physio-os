import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'

export default function PatientsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Patients</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No patients yet</p>
          <p className="text-sm">Patients will appear here once they sign up.</p>
        </CardContent>
      </Card>
    </div>
  )
}
