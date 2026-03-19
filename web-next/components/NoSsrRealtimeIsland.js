'use client'

import dynamic from 'next/dynamic'

const RealtimeIsland = dynamic(() => import('./RealtimeIsland'), {
  ssr: false,
  loading: () => null,
})

export default function NoSsrRealtimeIsland(props) {
  return <RealtimeIsland {...props} />
}
