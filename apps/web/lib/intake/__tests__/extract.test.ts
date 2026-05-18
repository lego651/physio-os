import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '../extract.ts'), 'utf-8')

describe('extractIntakeFields — D16-8 English output instruction', () => {
  it('prompt contains English-output instruction', () => {
    expect(SRC).toContain('Output all fields in English')
  })
})

describe('extractTreatmentStep — D18-1 prompt rules', () => {
  it('exports extractTreatmentStep', () => {
    expect(SRC).toMatch(/export\s+async\s+function\s+extractTreatmentStep/)
  })

  it('schema enumerates all five session types', () => {
    for (const t of ['massage', 'physio', 'acupuncture', 'chiropractor', 'other']) {
      expect(SRC).toContain(`'${t}'`)
    }
  })

  it('prompt lists massage classification keywords', () => {
    expect(SRC).toMatch(/massage.*RMT|deep tissue|Swedish/i)
  })

  it('prompt lists physio classification keywords', () => {
    expect(SRC).toMatch(/physio|physiotherapy|rehabilitation|stretching|mobility/i)
  })

  it('prompt lists acupuncture classification keywords', () => {
    expect(SRC).toMatch(/acupuncture|TCM|needles|cupping/i)
  })

  it('prompt lists chiropractor classification keywords', () => {
    expect(SRC).toMatch(/chiro|chiropractic|adjustment|manipulation/i)
  })

  it('prompt classifies ambiguous → other', () => {
    expect(SRC).toMatch(/[Aa]mbiguous.*other|unrecognized.*other/)
  })

  it('returns treatment_area as a short phrase', () => {
    expect(SRC).toMatch(/treatment_area.*short phrase|short phrase.*treatment_area/i)
  })
})
