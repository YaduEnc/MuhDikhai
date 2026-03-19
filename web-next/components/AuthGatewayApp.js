'use client'

import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import Landing from '@/src/components/Landing'
import Onboarding from '@/src/components/Onboarding'
import { auth } from '@/src/firebaseClient'
import {
  getStoredSession as getSession,
  saveSession,
  signInSilently,
  signInWithGoogle,
} from '@/src/authClient'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

function normalizeUser(user) {
  if (!user) return user
  const avatarUrl = user.profilePictureUrl || user.photoURL || null
  return {
    ...user,
    profilePictureUrl: avatarUrl,
    photoURL: avatarUrl,
  }
}

function normalizeSession(rawSession) {
  if (!rawSession) return rawSession
  return {
    ...rawSession,
    user: normalizeUser(rawSession.user),
  }
}

export default function AuthGatewayApp() {
  const router = useRouter()
  const [session, setSession] = useState(() => normalizeSession(getSession()))
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isInitializing, setIsInitializing] = useState(true)
  const [onlineCount, setOnlineCount] = useState(0)
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !sessionRef.current?.accessToken) {
        setAuthLoading(true)
        const next = await signInSilently(user)
        if (next) {
          const normalized = normalizeSession(next)
          setSession(normalized)
          saveSession(normalized)
        }
        setAuthLoading(false)
      }
      setIsInitializing(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadPresence = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/admin/stats/live`, { cache: 'no-store' })
        const json = await res.json()
        const payload = json?.data || json
        if (!cancelled) setOnlineCount(Number(payload?.onlineUsers) || 0)
      } catch {
        if (!cancelled) setOnlineCount(0)
      }
    }
    loadPresence()
    const timer = setInterval(loadPresence, 20000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const handleAuth = async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const next = await signInWithGoogle()
      const normalized = normalizeSession(next)
      setSession(normalized)
      saveSession(normalized)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  if (isInitializing) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner" />
        <p>Warming up authentication systems...</p>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <Landing
        onStartMatch={handleAuth}
        authLoading={authLoading}
        authError={authError}
        onlineCount={onlineCount}
      />
    )
  }

  if (!session.user.gender) {
    return (
      <Onboarding
        session={session}
        onComplete={(updatedUser) => {
          const next = normalizeSession({ ...sessionRef.current, user: updatedUser })
          setSession(next)
          saveSession(next)
        }}
      />
    )
  }

  router.replace('/app')
  return (
    <div className="admin-loading">
      <div className="loading-spinner" />
      <p>Entering your room...</p>
    </div>
  )
}
