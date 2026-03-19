import NoSsrRealtimeIsland from '@/components/NoSsrRealtimeIsland'
import SessionBootstrapProbe from '@/components/SessionBootstrapProbe'

export default function ChatPage() {
  return (
    <>
      <SessionBootstrapProbe />
      <NoSsrRealtimeIsland routeMode="chat" />
    </>
  )
}
