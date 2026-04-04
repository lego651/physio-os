import type { Metadata } from 'next'
import { PrivacyContent } from './privacy-content'

export const metadata: Metadata = {
  title: 'Privacy Policy — V-Health',
  description: 'V-Health privacy policy — how we collect, store, and protect your health data.',
}

export default function PrivacyPage() {
  return <PrivacyContent />
}
