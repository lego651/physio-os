import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { cn } from '@/lib/utils'
import './globals.css'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'V-Health Recovery Coach',
  description: 'AI-powered recovery coaching for physiotherapy patients',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={cn('h-full antialiased', inter.variable, jetbrainsMono.variable)}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
