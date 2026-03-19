'use client'

import { useEffect, useState } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

export default function SessionBootstrapProbe() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const raw = window.localStorage.getItem('muhdikhai_session')
        if (!raw) {
          if (!cancelled) setStatus('signed-out')
          return
        }
        const session = JSON.parse(raw)
        if (!session?.accessToken) {
          if (!cancelled) setStatus('signed-out')
          return
        }

        const res = await fetch(`${BACKEND_URL}/api/v1/auth/bootstrap`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          cache: 'no-store',
        })
        if (!cancelled) {
          setStatus(res.ok ? 'ok' : 'expired')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') return null
  if (status === 'ok') return null

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 12px',
      borderRadius: 999,
      fontSize: 12,
      background: 'rgba(8,12,30,0.9)',
      border: '1px solid rgba(115,246,213,0.45)',
      color: '#d6e4ff',
      zIndex: 10001,
    }}>
      Session status: {status}
    </div>
  )
}
