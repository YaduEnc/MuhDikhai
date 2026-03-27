'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import AdminDashboard from '@/src/admin/AdminDashboard'
import { auth } from '@/src/firebaseClient'
import {
  clearSession,
  getStoredSession as getSession,
  refreshSession,
  saveSession,
  signInSilently,
  signInWithGoogle,
} from '@/src/authClient'

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

export default function AdminClientApp() {
  const [session, setSession] = useState(null)
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    const stored = normalizeSession(getSession())
    if (stored) {
      setSession(stored)
      sessionRef.current = stored
    }
    setSessionBootstrapped(true)
  }, [])

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

  const handleSignOut = () => {
    clearSession()
    setSession(null)
    sessionRef.current = null
  }

  const authedFetch = useCallback(async (url, opts = {}) => {
    const cur = sessionRef.current
    if (!cur?.accessToken) throw new Error('Not authenticated')

    const doFetch = (token) =>
      fetch(url, {
        ...opts,
        headers: {
          ...(opts.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      })

    let res = await doFetch(cur.accessToken)
    if (res.status === 401 && cur.refreshToken) {
      try {
        const next = await refreshSession(cur.refreshToken)
        const normalized = normalizeSession(next)
        setSession(normalized)
        saveSession(normalized)
        sessionRef.current = normalized
        res = await doFetch(normalized.accessToken)
      } catch (error) {
        handleSignOut()
        throw error
      }
    }

    return res
  }, [])

  if (isInitializing || !sessionBootstrapped) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner" />
        <p>Booting admin control plane...</p>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="ssr-shell" style={{ maxWidth: 680, paddingTop: 96 }}>
        <h1>Admin Login</h1>
        <p style={{ color: '#bfd0ea' }}>
          Sign in with your admin account to access reports, matchmaking telemetry, and live system diagnostics.
        </p>
        {authError ? <p className="auth-error">{authError}</p> : null}
        <div className="hero-actions">
          <button className="btn-primary" onClick={handleAuth} disabled={authLoading}>
            {authLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    )
  }

  if (!session.user.isAdmin) {
    return (
      <div className="ssr-shell" style={{ maxWidth: 680, paddingTop: 96 }}>
        <h1>Access Denied</h1>
        <p style={{ color: '#bfd0ea' }}>
          This account does not have admin permissions.
        </p>
        <div className="hero-actions">
          <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    )
  }

  return <AdminDashboard session={session} authedFetch={authedFetch} />
}
