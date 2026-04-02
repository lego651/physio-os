import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — V-Health',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 prose prose-sm dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: April 2026</p>

      <h2>What We Collect</h2>
      <p>
        V-Health collects the following data to support your recovery journey:
      </p>
      <ul>
        <li>Your name and phone number (for account identification)</li>
        <li>Recovery metrics you report (pain levels, discomfort, exercise completion)</li>
        <li>Conversation messages with the AI recovery coach</li>
        <li>Your stated condition or injury</li>
        <li>Language preference</li>
      </ul>

      <h2>How We Use Your Data</h2>
      <ul>
        <li>To provide personalized recovery coaching through AI conversation</li>
        <li>To track your recovery progress over time</li>
        <li>To generate weekly progress reports</li>
        <li>To share progress with your practitioner (only if you enable sharing)</li>
      </ul>

      <h2>Data Storage</h2>
      <p>
        Your data is stored securely using industry-standard encryption. We use Supabase
        (hosted on AWS) for data storage with row-level security to ensure your data is
        only accessible to you and authorized clinic staff.
      </p>

      <h2>Data Sharing</h2>
      <p>
        Your data is only shared with V-Health practitioners if you explicitly enable
        sharing in your account settings. We do not sell or share your data with third
        parties.
      </p>

      <h2>AI Processing</h2>
      <p>
        Your messages are processed by Anthropic&apos;s Claude AI to provide recovery coaching.
        Messages are not used to train AI models. Anthropic&apos;s data handling is governed by
        their privacy policy and data processing agreement.
      </p>

      <h2>Opting Out</h2>
      <p>
        You can opt out of V-Health at any time by replying STOP via SMS or contacting
        your clinic directly. Opting out will stop all AI interactions and notifications.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, contact your V-Health clinic directly or email
        privacy@vhealth.ai.
      </p>
    </div>
  )
}
