import NoSsrRealtimeIsland from '@/components/NoSsrRealtimeIsland'
import SessionBootstrapProbe from '@/components/SessionBootstrapProbe'

export default function AppPage() {
  return (
    <>
      <SessionBootstrapProbe />
      <NoSsrRealtimeIsland routeMode="app" />
    </>
  )
}
