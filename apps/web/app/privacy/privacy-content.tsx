'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Lang = 'en' | 'zh'

const EFFECTIVE_DATE = 'April 1, 2026'
const CONTACT_EMAIL = 'privacy@vhealth.ai'

const content = {
  en: {
    title: 'Privacy Policy',
    version: `Version 1.0 — Effective ${EFFECTIVE_DATE}`,
    sections: [
      {
        heading: '1. What We Collect',
        body: (
          <ul>
            <li>Your name and phone number (account identification)</li>
            <li>Recovery metrics you report (pain levels, discomfort, exercise completion)</li>
            <li>Conversation messages with the AI recovery coach</li>
            <li>Your stated condition or injury</li>
            <li>Language preference</li>
          </ul>
        ),
      },
      {
        heading: '2. Purpose of Collection',
        body: (
          <ul>
            <li>To provide personalized recovery coaching through AI conversation</li>
            <li>To track your recovery progress over time</li>
            <li>To generate weekly progress reports</li>
            <li>To share progress with your V-Health practitioner (only if you explicitly enable sharing)</li>
          </ul>
        ),
      },
      {
        heading: '3. Data Storage',
        body: (
          <p>
            Your data is stored using Supabase hosted on Amazon Web Services (AWS) with
            encryption at rest and in transit. Row-level security ensures your data is only
            accessible to you and authorized V-Health staff.
          </p>
        ),
      },
      {
        heading: '4. Who Can Access Your Data',
        body: (
          <ul>
            <li>
              <strong>You</strong> — you have full access to your own data at any time.
            </li>
            <li>
              <strong>V-Health practitioners</strong> — only if you explicitly enable sharing
              in your settings.
            </li>
            <li>
              <strong>V-Health administrators and platform operators</strong> — for service
              operation, maintenance, and security purposes.
            </li>
          </ul>
        ),
      },
      {
        heading: '5. Data Sharing with Third Parties',
        body: (
          <>
            <p>
              We do not sell your data. We share limited data with the following third-party
              service providers solely to operate the platform:
            </p>
            <ul>
              <li>
                <strong>Anthropic (Claude AI)</strong> — your conversation messages are sent to
                Anthropic to generate recovery coaching responses. Messages are not used to train
                AI models. Governed by Anthropic&apos;s data processing agreement.
              </li>
              <li>
                <strong>Twilio</strong> — delivers SMS messages to your phone number. Only your
                phone number and message content are shared.
              </li>
              <li>
                <strong>Vercel</strong> — hosts the V-Health web application. Standard request
                and log data may be processed.
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: '6. Data Retention',
        body: (
          <p>
            Your data is retained for as long as your account is active. You may request
            deletion at any time by emailing{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>
            . We will process deletion requests within 30 days.
          </p>
        ),
      },
      {
        heading: '7. Your Rights',
        body: (
          <>
            <p>
              Under applicable Canadian privacy law (PIPEDA), you have the right to:
            </p>
            <ul>
              <li>
                <strong>Access</strong> — request a copy of the personal information we hold
                about you.
              </li>
              <li>
                <strong>Correction</strong> — ask us to correct inaccurate or incomplete
                information.
              </li>
              <li>
                <strong>Deletion</strong> — request that we delete your data.
              </li>
              <li>
                <strong>Withdrawal of consent</strong> — you may withdraw consent at any time
                by replying <strong>STOP</strong> via SMS or emailing us. Withdrawal stops all
                AI interactions and notifications.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </>
        ),
      },
      {
        heading: '8. Consent',
        body: (
          <p>
            We collect your consent explicitly before processing any personal data. Consent is
            provided during the onboarding flow (web or SMS). You may withdraw it at any time
            as described above.
          </p>
        ),
      },
      {
        heading: '9. Contact',
        body: (
          <p>
            For any privacy questions or requests, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        ),
      },
      {
        heading: '10. PIPEDA Compliance Summary',
        body: (
          <ul>
            <li>Consent is explicit and informed before data collection begins.</li>
            <li>The purpose of collection is clearly stated at the time of consent.</li>
            <li>
              You may withdraw consent at any time by replying STOP via SMS or emailing us.
            </li>
            <li>
              We practice data minimization — only data necessary for recovery coaching is
              collected.
            </li>
            <li>
              Data is stored on AWS infrastructure with encryption at rest, in a jurisdiction
              with adequate privacy protections.
            </li>
          </ul>
        ),
      },
    ],
  },
  zh: {
    title: '隐私政策',
    version: `第 1.0 版 — 生效日期：${EFFECTIVE_DATE}`,
    sections: [
      {
        heading: '1. 我们收集的信息',
        body: (
          <ul>
            <li>您的姓名和电话号码（用于账户识别）</li>
            <li>您报告的康复指标（疼痛程度、不适感、锻炼完成情况）</li>
            <li>与 AI 康复助理的对话消息</li>
            <li>您的身体状况或受伤情况</li>
            <li>语言偏好</li>
          </ul>
        ),
      },
      {
        heading: '2. 收集目的',
        body: (
          <ul>
            <li>通过 AI 对话提供个性化康复指导</li>
            <li>持续跟踪您的康复进度</li>
            <li>生成每周进度报告</li>
            <li>在您明确授权的情况下，将进度分享给您的 V-Health 医疗人员</li>
          </ul>
        ),
      },
      {
        heading: '3. 数据存储',
        body: (
          <p>
            您的数据存储在亚马逊云服务（AWS）上托管的 Supabase 数据库中，静态数据和传输中的数据均已加密。行级安全机制确保您的数据只能由您本人及授权的
            V-Health 工作人员访问。
          </p>
        ),
      },
      {
        heading: '4. 数据访问权限',
        body: (
          <ul>
            <li>
              <strong>您</strong> — 您可以随时访问自己的全部数据。
            </li>
            <li>
              <strong>V-Health 医疗人员</strong> — 仅在您在设置中明确开启共享后才可访问。
            </li>
            <li>
              <strong>V-Health 管理员和平台运营人员</strong> — 用于服务运营、维护和安全目的。
            </li>
          </ul>
        ),
      },
      {
        heading: '5. 与第三方共享数据',
        body: (
          <>
            <p>我们不出售您的数据。我们仅与以下第三方服务提供商共享有限数据，用于平台运营：</p>
            <ul>
              <li>
                <strong>Anthropic（Claude AI）</strong> — 您的对话消息将发送至 Anthropic 以生成康复指导回复。消息不会用于训练
                AI 模型，受 Anthropic 数据处理协议约束。
              </li>
              <li>
                <strong>Twilio</strong> — 负责向您的手机号发送短信。仅共享您的手机号和消息内容。
              </li>
              <li>
                <strong>Vercel</strong> — 托管 V-Health 网页应用。可能处理标准请求和日志数据。
              </li>
            </ul>
          </>
        ),
      },
      {
        heading: '6. 数据保留',
        body: (
          <p>
            在您的账户有效期间，我们将保留您的数据。您可以随时发送邮件至{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>{' '}
            申请删除数据。我们将在 30 天内处理删除请求。
          </p>
        ),
      },
      {
        heading: '7. 您的权利',
        body: (
          <>
            <p>根据适用的加拿大隐私法（PIPEDA），您有权：</p>
            <ul>
              <li>
                <strong>访问</strong> — 申请获取我们持有的关于您的个人信息副本。
              </li>
              <li>
                <strong>更正</strong> — 要求我们更正不准确或不完整的信息。
              </li>
              <li>
                <strong>删除</strong> — 申请删除您的数据。
              </li>
              <li>
                <strong>撤回同意</strong> — 您可以随时通过短信回复 <strong>STOP</strong> 或发送邮件给我们来撤回同意。撤回同意后将停止所有
                AI 互动和通知。
              </li>
            </ul>
            <p>
              如需行使上述任何权利，请发送邮件至{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                {CONTACT_EMAIL}
              </a>
              。
            </p>
          </>
        ),
      },
      {
        heading: '8. 知情同意',
        body: (
          <p>
            在处理任何个人数据之前，我们会明确征得您的同意。同意在网页或短信入职流程中提供。您可以按上述方式随时撤回同意。
          </p>
        ),
      },
      {
        heading: '9. 联系我们',
        body: (
          <p>
            如有任何隐私问题或申请，请联系我们：{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>
            。
          </p>
        ),
      },
      {
        heading: '10. PIPEDA 合规摘要',
        body: (
          <ul>
            <li>在数据收集开始前，征得明确且知情的同意。</li>
            <li>在同意时明确说明收集目的。</li>
            <li>您可以随时通过短信回复 STOP 或发送邮件给我们来撤回同意。</li>
            <li>我们遵循数据最小化原则——仅收集康复指导所必需的数据。</li>
            <li>数据存储于 AWS 基础设施，静态数据已加密，存储在具有充分隐私保护的司法管辖区。</li>
          </ul>
        ),
      },
    ],
  },
} as const

export function PrivacyContent() {
  const [lang, setLang] = useState<Lang>('en')
  const c = content[lang]

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Language toggle */}
        <div className="flex gap-2 mb-8">
          <Button
            variant={lang === 'en' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLang('en')}
          >
            English
          </Button>
          <Button
            variant={lang === 'zh' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLang('zh')}
          >
            中文
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{c.version}</p>
        </div>

        {/* Sections */}
        <div className="space-y-8 text-sm leading-relaxed">
          {c.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold mb-2">{section.heading}</h2>
              <div className="text-foreground/80 space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:font-medium [&_strong]:text-foreground">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer back link */}
        <div className="mt-12 pt-6 border-t border-border">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {lang === 'en' ? '← Back to V-Health' : '← 返回 V-Health'}
          </a>
        </div>
      </div>
    </div>
  )
}
