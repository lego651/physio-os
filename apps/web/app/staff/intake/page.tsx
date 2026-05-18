import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntakeForm } from './intake-form'
import { VoiceIntakeChat } from './voice-intake-chat'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

export default async function StaffIntakePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/dashboard/login?next=/staff/intake')
  }

  if (user.email !== process.env.ADMIN_EMAIL) {
    redirect('/dashboard/login?error=unauthorized')
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold">New Session Record</h1>
        <Tabs defaultValue="voice">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="voice" className="flex-1">
              Voice
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Manual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="voice">
            <VoiceIntakeChat />
          </TabsContent>
          <TabsContent value="manual">
            <IntakeForm />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
