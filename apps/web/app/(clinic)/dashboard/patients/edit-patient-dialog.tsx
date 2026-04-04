'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PencilIcon } from 'lucide-react'

interface Patient {
  id: string
  name: string | null
  language: string
  practitioner_name: string | null
  profile: Record<string, unknown> | null
}

interface EditPatientDialogProps {
  patient: Patient
}

export function EditPatientDialog({ patient }: EditPatientDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const initialCondition =
    patient.profile && typeof patient.profile.diagnosis === 'string'
      ? patient.profile.diagnosis
      : ''

  const [name, setName] = useState(patient.name ?? '')
  const [language, setLanguage] = useState<'en' | 'zh'>(
    patient.language === 'zh' ? 'zh' : 'en'
  )
  const [practitionerName, setPractitionerName] = useState(
    patient.practitioner_name ?? ''
  )
  const [condition, setCondition] = useState(initialCondition)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetToPatient() {
    setName(patient.name ?? '')
    setLanguage(patient.language === 'zh' ? 'zh' : 'en')
    setPractitionerName(patient.practitioner_name ?? '')
    setCondition(initialCondition)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          language,
          practitioner_name: practitionerName || null,
          condition: condition || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetToPatient()
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            <PencilIcon />
            <span className="sr-only">Edit patient</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Patient</DialogTitle>
          <DialogDescription>
            Update patient details. Phone number cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ep-name">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="ep-name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              required
              disabled={submitting}
            />
          </div>

          {/* Language toggle */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Language</span>
            <div className="flex gap-2">
              {(['en', 'zh'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  disabled={submitting}
                  onClick={() => setLanguage(lang)}
                  className={cn(
                    'flex-1 rounded-lg border py-1.5 text-sm font-medium transition-colors',
                    language === lang
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                >
                  {lang === 'en' ? 'EN' : 'CN'}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ep-condition">
              Condition <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <Input
              id="ep-condition"
              placeholder="e.g. Lower back pain"
              value={condition}
              onChange={(e) => { setCondition(e.target.value); setError(null) }}
              disabled={submitting}
            />
          </div>

          {/* Practitioner */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ep-practitioner">
              Practitioner name <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <Input
              id="ep-practitioner"
              placeholder="Dr. Smith"
              value={practitionerName}
              onChange={(e) => { setPractitionerName(e.target.value); setError(null) }}
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
