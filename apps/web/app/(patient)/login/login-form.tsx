'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@physio-os/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export function PatientLoginForm() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const normalized = normalizePhone(phone)
      const { error } = await supabase.auth.signInWithOtp({ phone: normalized })
      if (error) throw error
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const normalized = normalizePhone(phone)
      const { error } = await supabase.auth.verifyOtp({
        phone: normalized,
        token: otp,
        type: 'sms',
      })
      if (error) throw error
      router.push('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-primary">V-Health</CardTitle>
          <CardDescription>
            {step === 'phone'
              ? 'Enter your phone number to sign in'
              : 'Enter the 6-digit code sent to your phone'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              <Input
                type="tel"
                placeholder="+1 (604) 555-0123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                className="h-12 text-lg"
              />
              <Button type="submit" disabled={loading || !phone} className="h-12">
                {loading ? 'Sending...' : 'Send Code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                autoFocus
                maxLength={6}
                className="h-12 text-lg text-center tracking-widest"
              />
              <Button type="submit" disabled={loading || otp.length !== 6} className="h-12">
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep('phone')}>
                Use a different number
              </Button>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  )
}
