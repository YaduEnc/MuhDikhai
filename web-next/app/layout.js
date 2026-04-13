import './globals.css'
import RuntimeSanityGuard from '@/components/RuntimeSanityGuard'
import { Analytics } from '@vercel/analytics/next'

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://broyouok.vercel.app'

const marketingTitle = 'MuhDikhai | The Anonymous Vibe Registry'
const marketingDescription =
  'Instant matches. Real people. Filtered by vibe. Experience the unfiltered mayhem of human randomness with end-to-end security.'

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: marketingTitle,
  description: marketingDescription,
  applicationName: 'MuhDikhai',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: marketingTitle,
    description: marketingDescription,
    url: siteUrl,
    siteName: 'MuhDikhai',
    locale: 'en_IN',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'MuhDikhai - The Anonymous Vibe Registry',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: marketingTitle,
    description: marketingDescription,
    images: ['/opengraph-image'],
  },
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
