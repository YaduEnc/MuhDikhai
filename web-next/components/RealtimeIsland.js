'use client'

import LegacyApp from '@/legacy/src/App'

export default function RealtimeIsland({ routeMode = 'app' }) {
  return <LegacyApp routeMode={routeMode} />
}
