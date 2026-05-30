import { describe, it, expect } from 'vitest'
import {
  isPreviewEnvironment,
  successUrlFromStatuses,
  pollForPreviewUrl,
} from './await-preview-url.mjs'

describe('isPreviewEnvironment', () => {
  it('matches Vercel Preview environments case-insensitively', () => {
    expect(isPreviewEnvironment('Preview')).toBe(true)
    expect(isPreviewEnvironment('preview')).toBe(true)
    expect(isPreviewEnvironment('Preview – physio-os-web')).toBe(true)
  })

  it('rejects Production and junk', () => {
    expect(isPreviewEnvironment('Production')).toBe(false)
    expect(isPreviewEnvironment('')).toBe(false)
    expect(isPreviewEnvironment(undefined)).toBe(false)
    expect(isPreviewEnvironment(null)).toBe(false)
  })
})

describe('successUrlFromStatuses', () => {
  it('returns environment_url of the most recent success (GitHub returns newest first)', () => {
    const statuses = [
      {
        state: 'success',
        environment_url: 'https://pr-2.vercel.app',
        target_url: 'https://dash/2',
      },
      {
        state: 'success',
        environment_url: 'https://pr-1.vercel.app',
        target_url: 'https://dash/1',
      },
    ]
    expect(successUrlFromStatuses(statuses)).toBe('https://pr-2.vercel.app')
  })

  it('falls back to target_url when environment_url is absent', () => {
    expect(successUrlFromStatuses([{ state: 'success', target_url: 'https://fallback.app' }])).toBe(
      'https://fallback.app',
    )
  })

  it('ignores non-success states', () => {
    const statuses = [
      { state: 'failure', environment_url: 'https://bad.app' },
      { state: 'pending', environment_url: 'https://building.app' },
    ]
    expect(successUrlFromStatuses(statuses)).toBeNull()
  })

  it('returns null for empty or invalid input', () => {
    expect(successUrlFromStatuses([])).toBeNull()
    expect(successUrlFromStatuses(undefined)).toBeNull()
    expect(successUrlFromStatuses(null)).toBeNull()
  })
})

describe('pollForPreviewUrl', () => {
  const makeClock = () => {
    let t = 0
    return {
      now: () => t,
      // sleep advances the fake clock instead of waiting on a real timer
      sleep: async (ms) => {
        t += ms
      },
    }
  }

  it('returns the Preview URL as soon as a success appears (first pass)', async () => {
    const clock = makeClock()
    const result = await pollForPreviewUrl({
      sha: 'abc',
      timeoutMs: 600_000,
      intervalMs: 15_000,
      deps: {
        ...clock,
        listDeployments: async () => [
          { id: 9, environment: 'Production' },
          { id: 10, environment: 'Preview' },
        ],
        listDeploymentStatuses: async (id) =>
          id === 10 ? [{ state: 'success', environment_url: 'https://pr.vercel.app' }] : [],
      },
    })
    expect(result.url).toBe('https://pr.vercel.app')
    expect(result.deploymentId).toBe(10)
  })

  it('keeps polling past the deploy-registration race, then succeeds', async () => {
    const clock = makeClock()
    let calls = 0
    const result = await pollForPreviewUrl({
      sha: 'abc',
      timeoutMs: 600_000,
      intervalMs: 15_000,
      deps: {
        ...clock,
        // Empty for the first two passes (Vercel hasn't registered the deploy yet)
        listDeployments: async () => {
          calls++
          return calls < 3 ? [] : [{ id: 10, environment: 'Preview' }]
        },
        listDeploymentStatuses: async () => [
          { state: 'success', environment_url: 'https://pr.vercel.app' },
        ],
      },
    })
    expect(result.url).toBe('https://pr.vercel.app')
    expect(calls).toBe(3)
  })

  it('times out loudly (url=null, timedOut=true) when no Preview success ever appears', async () => {
    const clock = makeClock()
    const result = await pollForPreviewUrl({
      sha: 'abc',
      timeoutMs: 45_000,
      intervalMs: 15_000,
      deps: {
        ...clock,
        listDeployments: async () => [{ id: 10, environment: 'Preview' }],
        listDeploymentStatuses: async () => [{ state: 'pending' }],
      },
    })
    expect(result.url).toBeNull()
    expect(result.timedOut).toBe(true)
  })
})
