import { describe, it, expect } from 'vitest'
import { isNonEnglishScript } from '../whisper-language-guard'

// ─── M1: Latin / ASCII — must pass through (isNonEnglishScript = false) ───────

describe('isNonEnglishScript — Latin/ASCII inputs (allowed)', () => {
  it('pure ASCII name "Cathy Liu"', () => {
    expect(isNonEnglishScript('Cathy Liu')).toBe(false)
  })

  it('pure ASCII name "John Smith"', () => {
    expect(isNonEnglishScript('John Smith')).toBe(false)
  })

  it('Latin-1 accented name "José García"', () => {
    expect(isNonEnglishScript('José García')).toBe(false)
  })

  it('Latin-1 accented name "François Müller"', () => {
    expect(isNonEnglishScript('François Müller')).toBe(false)
  })

  it('Latin Extended-A name "Łukasz Kowalski"', () => {
    expect(isNonEnglishScript('Łukasz Kowalski')).toBe(false)
  })

  it('English sentence with punctuation', () => {
    expect(isNonEnglishScript('Deep tissue massage on the lower back.')).toBe(false)
  })

  it('name with apostrophe "O\'Brien"', () => {
    expect(isNonEnglishScript("O'Brien")).toBe(false)
  })

  it('name with curly apostrophe "O’Brien"', () => {
    expect(isNonEnglishScript('O’Brien')).toBe(false)
  })

  it('empty string (passes — no non-Latin chars)', () => {
    expect(isNonEnglishScript('')).toBe(false)
  })

  it('whitespace only (passes)', () => {
    expect(isNonEnglishScript('   ')).toBe(false)
  })

  it('numbers and symbols "Room 101 — check-in"', () => {
    expect(isNonEnglishScript('Room 101 — check-in')).toBe(false)
  })
})

// ─── M1: Non-Latin scripts — must be blocked (isNonEnglishScript = true) ─────

describe('isNonEnglishScript — non-Latin script inputs (blocked)', () => {
  it('CJK Simplified "开肺瘤" (Whisper hallucination for "Cathy Liu")', () => {
    expect(isNonEnglishScript('开肺瘤')).toBe(true)
  })

  it('CJK Traditional "開肺瘤"', () => {
    expect(isNonEnglishScript('開肺瘤')).toBe(true)
  })

  it('CJK Japanese hiragana "こんにちは"', () => {
    expect(isNonEnglishScript('こんにちは')).toBe(true)
  })

  it('CJK Japanese katakana "カタカナ"', () => {
    expect(isNonEnglishScript('カタカナ')).toBe(true)
  })

  it('Cyrillic "Привет"', () => {
    expect(isNonEnglishScript('Привет')).toBe(true)
  })

  it('Arabic "مرحبا"', () => {
    expect(isNonEnglishScript('مرحبا')).toBe(true)
  })

  it('Hebrew "שלום"', () => {
    expect(isNonEnglishScript('שלום')).toBe(true)
  })

  it('Devanagari (Hindi) "नमस्ते"', () => {
    expect(isNonEnglishScript('नमस्ते')).toBe(true)
  })

  it('Korean Hangul "안녕하세요"', () => {
    expect(isNonEnglishScript('안녕하세요')).toBe(true)
  })

  it('mixed ASCII + CJK "Cathy 开肺瘤" is blocked (any non-Latin char = fail)', () => {
    expect(isNonEnglishScript('Cathy 开肺瘤')).toBe(true)
  })
})
