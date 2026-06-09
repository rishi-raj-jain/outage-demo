import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Recover from Postgres outages in milliseconds',
  description: 'A demo to simluate a corruption in a Postgres database causing application downtime and then restore it to back in time in milliseconds.',
  openGraph: {
    images: [
      {
        url: 'https://neon-demo-branching.vercel.app/og.png',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={cn(fontSans.variable, 'min-h-lvh w-full bg-black bg-cover px-2 font-sans')}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
