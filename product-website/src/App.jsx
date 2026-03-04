import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import Home from './Home'
import Chat from './Chat'
import Onboarding from './Onboarding'
import {
  signInWithGoogle,
  refreshSession,
  saveSession,
  getStoredSession as getSession,
  clearSession,
} from './authClient'
import './App.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

/**
 * Proactively refresh the access token if it is about to expire (within 60 s)
 * or if accessExpiresAt is missing (old session format — always try refresh).
 */
async function getValidSession(session) {
  if (!session?.accessToken) throw new Error('No session')
  if (!session.refreshToken) return session // can't refresh, return as-is

  try {
    if (!session.accessExpiresAt) {
      // Old session format – always refresh to be safe
      const next = await refreshSession(session.refreshToken)
      saveSession(next)
      return next
    }

    const expiresAt = new Date(session.accessExpiresAt).getTime()
    const now = Date.now()
    if (expiresAt - now < 60_000) {
      // Token expires in less than 60 seconds – refresh now
      const next = await refreshSession(session.refreshToken)
      saveSession(next)
      return next
    }
  } catch {
    // Refresh failed; return existing session so the socket can try.
    // connect_error will handle the case if the token is truly dead.
  }

  return session
}

function App() {
  const [session, setSession] = useState(() => getSession())
  const [onlineCount, setOnlineCount] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [room, setRoom] = useState(null)
  const [socketState, setSocketState] = useState({ status: 'disconnected', phase: 'idle' })
  const [chatMessages, setChatMessages] = useState([])
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  // Increment this to force a socket reconnect (e.g. after token refresh)
  const [socketVersion, setSocketVersion] = useState(0)

  const socketRef = useRef(null)
  const sessionRef = useRef(session)
  const chatMessagesRef = useRef(chatMessages)
  const refreshingRef = useRef(false) // prevent concurrent refresh attempts

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  // ─── Socket lifecycle ──────────────────────────────────────────────────────
  // Re-runs whenever the access token OR socketVersion changes.
  // socketVersion is bumped after a token refresh so we always get a
  // fresh socket even if the new token string happened to be identical.
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.accessToken) return

    let socket = null
    let cancelled = false

    const connect = async () => {
      try {
        // Refresh token proactively (handles old session format too)
        const validSession = await getValidSession(sessionRef.current)
        if (cancelled) return

        if (validSession.accessToken !== sessionRef.current?.accessToken) {
          // Token was refreshed – update state but don't re-trigger this
          // effect yet; we'll do that by bumping socketVersion below.
          sessionRef.current = validSession
          setSession(validSession)
          // socketVersion bump will re-trigger via dependency change
          setSocketVersion((v) => v + 1)
          return
        }

        socket = io(BACKEND_URL, {
          auth: { token: validSession.accessToken },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 3,
          reconnectionDelay: 2000,
        })
        socketRef.current = socket

        socket.on('connect', () => {
          refreshingRef.current = false
          setSocketState((prev) => ({ ...prev, status: 'connected' }))
        })

        socket.on('connect_error', async (err) => {
          const msg = err.message || ''
          const isAuthErr =
            msg.includes('expired') ||
            msg.includes('Authentication failed') ||
            msg.includes('Invalid') ||
            msg.includes('inactive')

          if (isAuthErr && sessionRef.current?.refreshToken && !refreshingRef.current) {
            refreshingRef.current = true
            try {
              const next = await refreshSession(sessionRef.current.refreshToken)
              saveSession(next)
              sessionRef.current = next
              setSession(next)
              // Bump version → useEffect cleanup disconnects old socket,
              // new socket is created with fresh token. No socket.connect() needed.
              setSocketVersion((v) => v + 1)
            } catch {
              // Refresh failed → force sign-out
              handleSignOut()
            }
            return
          }

          if (!isAuthErr) {
            setSocketState((prev) => ({ ...prev, status: 'error' }))
          }
        })

        socket.on('presence:count', (payload) => {
          setOnlineCount(payload.count)
        })

        socket.on('random:waiting', () => {
          setSocketState((prev) => ({ ...prev, phase: 'matching' }))
        })

        socket.on('random:matched', (payload) => {
          setRoom(payload)
          setSocketState((prev) => ({ ...prev, phase: 'matched' }))
          setChatMessages([])
        })

        socket.on('random:message', (msg) => {
          let processedMsg = { ...msg, reactions: [] }
          if (msg.replyToMessageId) {
            const parent = chatMessagesRef.current.find((m) => m.id === msg.replyToMessageId)
            if (parent) {
              processedMsg.replyTo = { fromName: parent.fromName, content: parent.content }
            }
          }
          setChatMessages((prev) => [...prev, processedMsg])
        })

        socket.on('random:reaction', (data) => {
          setChatMessages((prev) =>
            prev.map((m) => {
              if (m.id !== data.messageId) return m
              const reactions = m.reactions || []
              const exists = reactions.find((r) => r.userId === data.userId && r.emoji === data.emoji)
              return exists
                ? { ...m, reactions: reactions.filter((r) => r !== exists) }
                : { ...m, reactions: [...reactions, { userId: data.userId, emoji: data.emoji }] }
            })
          )
        })

        socket.on('random:read', (payload) => {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === payload.messageId ? { ...m, read: true } : m))
          )
        })

        socket.on('random:left', () => {
          setSocketState((prev) => ({ ...prev, phase: 'partner-left' }))
        })

        socket.on('random:error', (payload) => {
          console.error('Socket error:', payload.message)
        })

        socket.on('typing:start', () => setPartnerTyping(true))
        socket.on('typing:stop', () => setPartnerTyping(false))

        socket.on('disconnect', () => {
          setSocketState((prev) => ({ ...prev, status: 'disconnected' }))
        })
      } catch (err) {
        console.error('Socket connect setup failed:', err)
        handleSignOut()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (socket) socket.disconnect()
    }
  }, [session?.accessToken, socketVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const handleSendMessage = (content, replyToMessageId) => {
    if (!room?.roomId || !socketRef.current) return
    socketRef.current.emit('random:message', { roomId: room.roomId, content, replyToMessageId })
  }

  const handleTyping = (isTyping) => {
    if (!room?.roomId || !socketRef.current) return
    socketRef.current.emit(isTyping ? 'typing:start' : 'typing:stop', { roomId: room.roomId })
  }

  const handleAuth = async () => {
    setAuthError('')
    setAuthLoading(true)
    try {
      const next = await signInWithGoogle()
      setSession(next)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = () => {
    refreshingRef.current = false
    if (socketRef.current) {
      socketRef.current.emit('random:leave')
      socketRef.current.disconnect()
      socketRef.current = null
    }
    clearSession()
    setSession(null)
    setShowChat(false)
    setRoom(null)
    setSocketState({ status: 'disconnected', phase: 'idle' })
  }

  const handleLeaveChat = () => {
    if (socketRef.current) {
      socketRef.current.emit('random:leave')
    }
    setShowChat(false)
    setRoom(null)
    setSocketState((prev) => ({ ...prev, phase: 'idle' }))
  }

  // Reusable authed fetch with auto-refresh on 401
  const authedFetch = useCallback(async (url, opts = {}) => {
    const cur = sessionRef.current
    if (!cur?.accessToken) throw new Error('Not authenticated')

    const doFetch = (token) =>
      fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } })

    let res = await doFetch(cur.accessToken)
    if (res.status === 401 && cur.refreshToken) {
      const next = await refreshSession(cur.refreshToken)
      setSession(next)
      saveSession(next)
      sessionRef.current = next
      res = await doFetch(next.accessToken)
    }
    return res
  }, [])

  const handleUpdateProfile = async (data) => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed to update profile')
      const nextSession = {
        ...sessionRef.current,
        user: {
          ...sessionRef.current.user,
          ...json.data.user,
          photoURL: json.data.user.profilePictureUrl || sessionRef.current.user.photoURL,
        },
      }
      setSession(nextSession)
      saveSession(nextSession)
    } catch (error) {
      console.error('Profile update failed:', error)
      throw error
    }
  }

  const handleUploadAvatar = async (file) => {
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/me/avatar`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed to upload avatar')
      return json.data.url
    } catch (error) {
      console.error('Avatar upload failed:', error)
      throw error
    }
  }

  const handleDeleteAccount = async () => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/me`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete account')
      handleSignOut()
    } catch (error) {
      console.error('Account deletion failed:', error)
      throw error
    }
  }

  // ─── View logic ────────────────────────────────────────────────────────────
  const isSignedIn = Boolean(session?.user)
  const isHome = Boolean(isSignedIn && !showChat && session.user.gender)
  const isInChat = Boolean(showChat && isSignedIn && session.user.gender)
  const needsOnboarding = Boolean(isSignedIn && !session.user.gender)

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-left">
          <div className="nav-mark">
            <span className="nav-mark-dot" />
          </div>
          <div className="nav-title">
            <span className="brand-word">Muhdikhai</span>
            <span className="brand-sub">
              {isInChat
                ? 'You are in a gentle room'
                : isHome
                  ? 'Your quiet room key is ready'
                  : 'A softer way to meet strangers'}
            </span>
          </div>
        </div>
        <div className="nav-right">
          {isSignedIn && (
            <div className="nav-user">
              <span className="online-pill">
                <span className="online-dot" />
                {onlineCount} present
              </span>
              <button className="nav-signout" onClick={handleSignOut}>Leave</button>
            </div>
          )}
        </div>
      </header>

      <main>
        {isHome && (
          <Home
            session={session}
            onlineCount={onlineCount}
            onStartMatch={() => setShowChat(true)}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
          />
        )}

        {needsOnboarding && (
          <Onboarding
            session={session}
            onComplete={(updatedUser) => {
              const nextSession = { ...session, user: updatedUser }
              setSession(nextSession)
              saveSession(nextSession)
            }}
          />
        )}

        {!isSignedIn && (
          <div className="landing">
            <section className="hero">
              <h1>Anonymous, but unexpectedly tender.</h1>
              {authError && <p className="auth-error">{authError}</p>}
              <button onClick={handleAuth} disabled={authLoading}>
                {authLoading ? 'Signing in…' : 'Start a gentle match'}
              </button>
            </section>
          </div>
        )}

        {isInChat && (
          <Chat
            session={session}
            room={room}
            socketState={socketState}
            chatMessages={chatMessages}
            partnerTyping={partnerTyping}
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
            onLeave={handleLeaveChat}
            onSearchAgain={() => {
              setSocketState((prev) => ({ ...prev, phase: 'matching' }))
              setRoom(null)
              setChatMessages([])
              socketRef.current?.emit('random:join')
            }}
          />
        )}
      </main>

      <footer className="footer">
        <div className="footer-credit">
          Developed &amp; Maintained by <span className="dev-name">Yaduraj Singh</span>
        </div>
      </footer>
    </div>
  )
}

export default App
