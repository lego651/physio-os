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
import { PlusIcon } from 'lucide-react'

const COUNTRY_CODES = [
  { code: '+1', label: '+1 (NA)', digits: 10 },
  { code: '+86', label: '+86 (CN)', digits: 11 },
] as const

interface FormState {
  name: string
  phoneLocal: string
  countryCode: string
  language: 'en' | 'zh'
  condition: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  phoneLocal: '',
  countryCode: '+1',
  language: 'en',
  condition: '',
}

export function AddPatientDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  function buildPhone(local: string, code: string) {
    const digits = local.replace(/\D/g, '')
    const expected = COUNTRY_CODES.find((c) => c.code === code)
    if (expected && digits.length !== expected.digits) {
      return null // Invalid digit count
    }
    return `${code}${digits}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const phone = buildPhone(form.phoneLocal, form.countryCode)
    if (!phone) {
      const expected = COUNTRY_CODES.find((c) => c.code === form.countryCode)
      setError(`Please enter ${expected?.digits ?? 10} digits for ${form.countryCode} numbers`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone,
          language: form.language,
          condition: form.condition || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setOpen(false)
      setForm(DEFAULT_FORM)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Add Patient
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Patient</DialogTitle>
          <DialogDescription>
            Enter the patient details below. A welcome SMS will be sent automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ap-name">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="ap-name"
              placeholder="Jane Doe"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ap-phone">
              Phone <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={form.countryCode}
                onChange={(e) => handleChange('countryCode', e.target.value)}
                disabled={submitting}
                className="flex h-8 items-center rounded-lg border border-input bg-muted px-2 text-sm"
                aria-label="Country code"
              >
                {COUNTRY_CODES.map((cc) => (
                  <option key={cc.code} value={cc.code}>{cc.label}</option>
                ))}
              </select>
              <Input
                id="ap-phone"
                type="tel"
                placeholder={form.countryCode === '+86' ? '138 0000 0000' : '604 555 1234'}
                value={form.phoneLocal}
                onChange={(e) => handleChange('phoneLocal', e.target.value)}
                required
                disabled={submitting}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter {COUNTRY_CODES.find((c) => c.code === form.countryCode)?.digits ?? 10} digits.
            </p>
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
                  onClick={() => handleChange('language', lang)}
                  className={cn(
                    'flex-1 rounded-lg border py-1.5 text-sm font-medium transition-colors',
                    form.language === lang
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                >
                  {lang === 'en' ? 'EN' : 'CN'}
                </button>
              ))}
            </div>
          </div>

          {/* Condition (optional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ap-condition">
              Condition <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <Input
              id="ap-condition"
              placeholder="e.g. Lower back pain"
              value={form.condition}
              onChange={(e) => handleChange('condition', e.target.value)}
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
              {submitting ? 'Adding…' : 'Add Patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
