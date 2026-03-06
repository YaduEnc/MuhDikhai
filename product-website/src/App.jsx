import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import Home from './Home'
import Chat from './Chat'
import Onboarding from './Onboarding'
import Landing from './Landing'
import AdminDashboard from './admin/AdminDashboard'

import {
  signInWithGoogle,
  refreshSession,
  saveSession,
  getStoredSession as getSession,
  clearSession,
} from './authClient'
import { initAudio, playMatchThump } from './utils/soundEngine'
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
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [room, setRoom] = useState(null)
  const [socketState, setSocketState] = useState({ status: 'disconnected', phase: 'idle' })
  const [chatMessages, setChatMessages] = useState([])
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  // Increment this to force a socket reconnect (e.g. after token refresh)
  const [socketVersion, setSocketVersion] = useState(0)
  const [isAdminView, setIsAdminView] = useState(window.location.pathname === '/admin')

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminView(window.location.pathname === '/admin')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])




  const socketRef = useRef(null)
  const sessionRef = useRef(session)
  const chatMessagesRef = useRef(chatMessages)
  const roomRef = useRef(room)
  const refreshingRef = useRef(false) // prevent concurrent refresh attempts

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  useEffect(() => {
    roomRef.current = room
  }, [room])


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
        setSocketState((prev) => ({ ...prev, socket }))

        socket.on('connect', () => {
          refreshingRef.current = false
          setSocketState((prev) => ({ ...prev, socket, status: 'connected' }))
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
          playMatchThump()
        })


        socket.on('random:message', (msg) => {
          setChatMessages((prev) => {
            let processedMsg = { ...msg, reactions: [] }
            // Content is already plain text, no decoding needed

            if (msg.replyToMessageId) {
              const parent = prev.find((m) => m.id === msg.replyToMessageId)
              if (parent) {
                processedMsg.replyTo = { fromName: parent.fromName, content: parent.content }
              }
            }
            return [...prev, processedMsg];
          })
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
    if (!room?.roomId && !room?.partner?.id) return
    if (!socketRef.current) return

    socketRef.current.emit('random:message', { roomId: room.roomId, content, replyToMessageId })

  }

  const handleTyping = (isTyping) => {
    if (!room?.roomId && !room?.partner?.id) return
    if (!socketRef.current) return
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
    setIsTransitioning(false)
    setRoom(null)
    setSocketState({ status: 'disconnected', phase: 'idle', socket: null })
  }

  const handleLeaveChat = () => {
    if (socketRef.current) {
      socketRef.current.emit('random:leave')
    }
    setShowChat(false)
    setIsTransitioning(false)
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

  const handleFetchMatches = useCallback(async () => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/matches/recent`)
      const json = await res.json()
      return json.success ? json.data.matches : []
    } catch (error) {
      console.error('Failed to fetch recent matches:', error)
      return []
    }
  }, [authedFetch])

  const handleAddFriend = useCallback(async (userId) => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Failed to send friend request')
      return true
    } catch (error) {
      console.error('Failed to add friend:', error)
      throw error
    }
  }, [authedFetch])

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
                  ? `Welcome back to the quiet place`
                  : needsOnboarding
                    ? 'Take a moment to define yourself'
                    : 'Anonymous, but unexpectedly tender.'}
            </span>
          </div>
        </div>
        <div className="nav-right">
          {isSignedIn && (
            <div className="nav-user">
              <div className="online-pill">
                <span className="online-dot" />
                <span className="online-text">{onlineCount} present</span>
              </div>
              <button className="nav-signout" onClick={handleSignOut}>Leave</button>
            </div>
          )}
        </div>
      </header>

      <main>
        {isAdminView && isSignedIn && session.user.isAdmin && (
          <AdminDashboard session={session} />
        )}

        {isAdminView && (!isSignedIn || !session.user.isAdmin) && (
          <div className="admin-access-denied">
            <h2>Access Denied</h2>
            <p>You don't have permission to access this terminal.</p>
            <button onClick={() => { setIsAdminView(false); window.history.pushState({}, '', '/'); }}>Return Home</button>
          </div>
        )}

        {!isAdminView && isHome && (
          <Home
            session={session}
            onlineCount={onlineCount}
            isTransitioning={isTransitioning}
            onStartMatch={(topics) => {
              // Browsers require a gesture to start audio
              initAudio()

              setIsTransitioning(true)
              setSocketState((prev) => ({ ...prev, phase: 'matching' }))

              // Delay chat render to allow CSS transition to play
              setTimeout(() => {
                setShowChat(true)
                setIsTransitioning(false)
              }, 600) // Match CSS animation duration

              // Give React one tick, then join queue
              setTimeout(() => socketRef.current?.emit('random:join', { topics }), 50)
            }}

            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
            onFetchMatches={handleFetchMatches}
            onAddFriend={handleAddFriend}
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
          <Landing
            onStartMatch={handleAuth}
            authLoading={authLoading}
            authError={authError}
            onlineCount={onlineCount}
          />
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

      {!isAdminView && (
        <footer className="footer">
          <div className="footer-main">
            <div className="footer-brand">
              <div className="footer-brand-row">
                <span className="footer-mark" />
                <span className="footer-name">Muhdikhai</span>
              </div>
              <p className="footer-tagline">
                A privacy‑first random chat experiment. No infinite scroll.
                Just one stranger and a softer interface.
              </p>
            </div>

            <div className="footer-groups">
              <div className="footer-group">
                <span className="footer-group-title">Experiment</span>
                <div className="footer-links-v2">
                  <span className="footer-link-v2">Changelog</span>
                  <span className="footer-link-v2">Principles</span>
                  <span className="footer-link-v2">Status</span>
                </div>
              </div>
              <div className="footer-group">
                <span className="footer-group-title">Social</span>
                <div className="footer-links-v2">
                  <span className="footer-link-v2">Twitter</span>
                  <span className="footer-link-v2">GitHub</span>
                  <span className="footer-link-v2">Contact</span>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-credit">
              Developed &amp; Maintained by <span className="dev-name">Yaduraj Singh</span>
            </div>
            <div className="footer-meta-row">
              <span className="footer-pill-v2">Built on PlasticWorld</span>
              <span className="footer-pill-v2">© 2026 Muhdikhai</span>
            </div>
          </div>
        </footer>
      )}


    </div>
  )
}

export default App
