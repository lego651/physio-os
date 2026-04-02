'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Check, ArrowRight, ArrowLeft } from 'lucide-react'

type Step = 'consent' | 'name' | 'condition' | 'language'
const STEPS: Step[] = ['consent', 'name', 'condition', 'language']

const CONSENT_TEXT = {
  en: 'V-Health collects your recovery data to help track your progress. Your information is stored securely and only shared with V-Health practitioners if you choose. You can opt out anytime by replying STOP.',
  zh: 'V-Health 收集您的恢复数据以帮助跟踪您的进度。您的信息将安全存储，只有在您选择的情况下才会与 V-Health 医疗人员共享。您可以随时回复 STOP 来退出。',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('consent')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)

  // Form state
  const [error, setError] = useState('')
  const [consentAgreed, setConsentAgreed] = useState(false)
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('')
  const [language, setLanguage] = useState<'en' | 'zh'>('en')

  // Check if onboarding is already complete or resume from last step
  useEffect(() => {
    async function checkStatus() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: patient } = await supabase
        .from('patients')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (patient) {
        setPatientId(patient.id)
        // Resume from last incomplete step
        if (patient.consent_at) {
          if (patient.name) {
            const profile = patient.profile as Record<string, unknown> | null
            if (profile?.injury) {
              // All done
              router.push('/chat')
              return
            }
            setName(patient.name)
            setCondition((profile?.injury as string) || '')
            setLanguage((patient.language as 'en' | 'zh') || 'en')
            setConsentAgreed(true)
            setCurrentStep('condition')
          } else {
            setConsentAgreed(true)
            setLanguage((patient.language as 'en' | 'zh') || 'en')
            setCurrentStep('name')
          }
        }
      }
      // If no patient record exists, it will be created during onboarding
      setLoading(false)
    }
    checkStatus()
  }, [router])

  const stepIndex = STEPS.indexOf(currentStep)
  const isLastStep = currentStep === 'language'

  async function handleNext() {
    if (currentStep === 'consent' && !consentAgreed) return
    if (currentStep === 'name' && !name.trim()) return

    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      if (currentStep === 'consent') {
        if (patientId) {
          await supabase
            .from('patients')
            .update({ consent_at: new Date().toISOString() })
            .eq('id', patientId)
        } else {
          // Create patient record if doesn't exist (phone-based auth)
          const { data: newPatient } = await supabase
            .from('patients')
            .insert({
              auth_user_id: user.id,
              phone: user.phone || '',
              consent_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (newPatient) setPatientId(newPatient.id)
        }
        setCurrentStep('name')
      } else if (currentStep === 'name') {
        await supabase
          .from('patients')
          .update({ name: name.trim() })
          .eq('auth_user_id', user.id)
        setCurrentStep('condition')
      } else if (currentStep === 'condition') {
        const { data: patient } = await supabase
          .from('patients')
          .select('profile')
          .eq('auth_user_id', user.id)
          .single()

        const existingProfile = (patient?.profile as Record<string, unknown>) || {}
        await supabase
          .from('patients')
          .update({
            profile: { ...existingProfile, injury: condition.trim() },
          })
          .eq('auth_user_id', user.id)
        setCurrentStep('language')
      } else if (currentStep === 'language') {
        await supabase
          .from('patients')
          .update({ language })
          .eq('auth_user_id', user.id)
        router.push('/chat')
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1])
    }
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-6 space-y-6">
        {/* Progress indicator */}
        <div className="flex gap-2">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {currentStep === 'consent' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Welcome to V-Health</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Before we begin, please review our privacy notice.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm leading-relaxed space-y-3">
              <p>{CONSENT_TEXT.en}</p>
              <p className="text-muted-foreground">{CONSENT_TEXT.zh}</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm">
                I agree to the privacy notice above.
                <a href="/privacy" className="text-primary underline ml-1" target="_blank">
                  Full privacy policy
                </a>
              </span>
            </label>
          </div>
        )}

        {currentStep === 'name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">What should we call you?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This helps your recovery coach personalize your experience.
              </p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-12 text-base"
              autoFocus
            />
          </div>
        )}

        {currentStep === 'condition' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">What brings you to V-Health?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tell us about your condition or injury so we can better support your recovery.
              </p>
            </div>
            <textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g., Lower back pain, recovering from ACL surgery..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px] resize-none"
              autoFocus
            />
          </div>
        )}

        {currentStep === 'language' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Preferred language</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose the language you&apos;d like your recovery coach to use.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLanguage('en')}
                className={`rounded-lg border-2 p-4 text-center transition-colors ${
                  language === 'en'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className="text-2xl block mb-1">🇬🇧</span>
                <span className="text-sm font-medium">English</span>
              </button>
              <button
                onClick={() => setLanguage('zh')}
                className={`rounded-lg border-2 p-4 text-center transition-colors ${
                  language === 'zh'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className="text-2xl block mb-1">🇨🇳</span>
                <span className="text-sm font-medium">中文</span>
              </button>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {stepIndex > 0 && (
            <Button variant="outline" onClick={handleBack} disabled={saving}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={handleNext}
            disabled={
              saving ||
              (currentStep === 'consent' && !consentAgreed) ||
              (currentStep === 'name' && !name.trim())
            }
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : isLastStep ? (
              <Check className="h-4 w-4 mr-1" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-1" />
            )}
            {isLastStep ? 'Start chatting' : 'Continue'}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  )
}
