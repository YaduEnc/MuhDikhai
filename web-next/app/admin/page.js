import NoSsrRealtimeIsland from '@/components/NoSsrRealtimeIsland'
import SessionBootstrapProbe from '@/components/SessionBootstrapProbe'

export default function AdminPage() {
  return (
    <>
      <SessionBootstrapProbe />
      <NoSsrRealtimeIsland routeMode="admin" />
    </>
  )
}
