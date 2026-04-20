import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isWidgetEnabled } from '../kill-switch'

describe('isWidgetEnabled', () => {
  const original = process.env.WIDGET_ENABLED
  afterEach(() => { process.env.WIDGET_ENABLED = original })

  it('returns true when env is "true"', () => {
    process.env.WIDGET_ENABLED = 'true'
    expect(isWidgetEnabled()).toBe(true)
  })

  it('returns false when env is "false"', () => {
    process.env.WIDGET_ENABLED = 'false'
    expect(isWidgetEnabled()).toBe(false)
  })

  it('returns true by default (undefined)', () => {
    delete process.env.WIDGET_ENABLED
    expect(isWidgetEnabled()).toBe(true)
  })
})
