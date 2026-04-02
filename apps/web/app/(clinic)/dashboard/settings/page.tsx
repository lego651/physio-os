import { Card, CardContent } from '@/components/ui/card'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Settings className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Settings</p>
          <p className="text-sm">Clinic settings will be available in a future release.</p>
        </CardContent>
      </Card>
    </div>
  )
}
