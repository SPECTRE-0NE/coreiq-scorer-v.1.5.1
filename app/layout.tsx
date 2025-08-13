import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CoreIQ by Curiata',
  description: 'CoreIQ Scorer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
