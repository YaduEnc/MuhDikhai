import './globals.css'
import RuntimeSanityGuard from '@/components/RuntimeSanityGuard'
import { Analytics } from '@vercel/analytics/next'

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://broyouok.vercel.app'

const marketingTitle = 'MuhDikhai | Real College Random Chat'
const marketingDescription =
  'Meet new people from campus in vibe-first random chat rooms. Fast login, clean profiles, instant matching, chat and calls.'

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
        alt: 'MuhDikhai - Real college random chat rooms',
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
