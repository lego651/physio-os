import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('extractIntakeFields — D16-8 English output instruction', () => {
  it('prompt contains English-output instruction', () => {
    // Read the source file and assert the instruction is present in the prompt string.
    // This is a static check — no AI call needed.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../extract.ts'),
      'utf-8',
    )
    expect(src).toContain('Output all fields in English')
  })
})
