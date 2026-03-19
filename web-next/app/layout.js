import './globals.css'
import RuntimeSanityGuard from '@/components/RuntimeSanityGuard'
import { Analytics } from '@vercel/analytics/next'

export const metadata = {
  title: 'MuhDikhai Next',
  description: 'SSR shell for MuhDikhai with client islands for realtime chat and calls',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <RuntimeSanityGuard />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
