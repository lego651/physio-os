'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface ToggleActiveButtonProps {
  patientId: string
  active: boolean
}

export function ToggleActiveButton({ patientId, active }: ToggleActiveButtonProps) {
  const router = useRouter()
  // Optimistic local state
  const [optimisticActive, setOptimisticActive] = useState(active)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle() {
    setError(null)
    // Apply optimistic update immediately
    setOptimisticActive((prev) => !prev)
    setPending(true)

    try {
      const res = await fetch(`/api/admin/patients/${patientId}/toggle-active`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update')
      }

      router.refresh()
    } catch (err) {
      // Revert optimistic update on failure
      setOptimisticActive((prev) => !prev)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={optimisticActive ? 'destructive' : 'outline'}
        size="sm"
        disabled={pending}
        onClick={handleToggle}
      >
        {pending
          ? 'Updating…'
          : optimisticActive
            ? 'Deactivate Patient'
            : 'Activate Patient'}
      </Button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
