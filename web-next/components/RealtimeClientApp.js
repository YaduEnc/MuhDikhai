'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ExperienceBackground from '@/src/components/ExperienceBackground'
import { io } from 'socket.io-client'
import Home from '@/src/components/Home'
import Chat from '@/src/components/Chat'
import HaveliRoom from '@/src/components/HaveliRoom'
import Onboarding from '@/src/components/Onboarding'
import Landing from '@/src/components/Landing'
import AdminDashboard from '@/src/admin/AdminDashboard'
import FriendChat from '@/src/components/FriendChat'
import CallOverlay from '@/src/components/CallOverlay'
import VibeCheckModal from '@/src/components/VibeCheckModal'
import LegalPages from '@/src/components/LegalPages'
import PWAInstallPrompt from '@/src/components/PWAInstallPrompt'
import BugReporter from '@/src/components/BugReporter'
import { auth } from '@/src/firebaseClient'
import { onAuthStateChanged } from 'firebase/auth'

import {
  signInWithGoogle,
  refreshSession,
  saveSession,
  getStoredSession as getSession,
  clearSession,
  signInSilently,
} from '@/src/authClient'
import {
  initAudio,
  playMatchThump,
  playOutgoingTick,
  playQueueEnterChirp,
  playRadarPing,
  playReadAck,
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
  playCallConnectedChirp,
  playHangupTone,
  playPartnerLeftDissolve,
} from '@/src/utils/soundEngine'
import { openCashfreeCheckout } from '@/src/utils/cashfree'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
const BETA_WELCOME_NOTICE_VERSION = 'college-launch-v1'

function extractDownloadFileName(contentDisposition) {
  if (!contentDisposition) return null

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1] || null
}

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

function hasCompleteProfile(user) {
  if (!user) return false
  const hasGender = Boolean(user.gender)
  const hasBio = Boolean(user.bio && String(user.bio).trim().length > 0)
  return hasGender && hasBio
}

async function getValidSession(session) {
  if (!session?.accessToken) throw new Error('No session')
  if (!session.refreshToken) return session

  try {
    if (!session.accessExpiresAt) {
      const next = await refreshSession(session.refreshToken)
      saveSession(next)
      return next
    }

    const expiresAt = new Date(session.accessExpiresAt).getTime()
    const now = Date.now()
    if (expiresAt - now < 60_000) {
      const next = await refreshSession(session.refreshToken)
      saveSession(next)
      return next
    }
  } catch {
    // Ignore refresh errors
  }
  return session
}

function RealtimeClientApp({ autoMatchOnMount = false }) {
  const [session, setSession] = useState(null)
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [room, setRoom] = useState(null)
  const [socketState, setSocketState] = useState({
    status: 'connecting',
    phase: 'idle', // 'idle' | 'matching' | 'matched' | 'partner-left' | 'friend-chat'
    partnerStatus: 'offline'
  })
  const [chatMessages, setChatMessages] = useState([])
  const [activeFriend, setActiveFriend] = useState(null)
  const [activeHaveli, setActiveHaveli] = useState(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [premiumLoading, setPremiumLoading] = useState(false)
  const [socketVersion, setSocketVersion] = useState(0)
  const isAdminView = false
  const [unreadCounts, setUnreadCounts] = useState({})
  const [matchPrefs, setMatchPrefs] = useState({ topics: [], preference: 'everyone' })
  const [isInitializing, setIsInitializing] = useState(true)
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false)
  const [isServerDown, setIsServerDown] = useState(false)
  const [suppressOverlay, setSuppressOverlay] = useState(false)
  const [matchingStats, setMatchingStats] = useState(null)
  const [showBetaWelcomeModal, setShowBetaWelcomeModal] = useState(false)

  const [callOverlayState, setCallOverlayState] = useState({
    status: 'idle', // 'idle', 'requesting', 'incoming', 'active'
    partner: null,
    type: 'random', // 'random' or 'friend'
    isInitiator: false
  })

  const [vibeCheckState, setVibeCheckState] = useState({
    show: false,
    partner: null,
    roomId: null
  })

  const [legalView, setLegalView] = useState(null) // null | 'privacy' | 'terms' | 'safety'

  const socketRef = useRef(null)
  const sessionRef = useRef(session)
  const chatMessagesRef = useRef(chatMessages)
  const roomRef = useRef(room)
  const activeFriendRef = useRef(activeFriend)
  const socketPhaseRef = useRef(socketState.phase)
  const callOverlayStateRef = useRef(callOverlayState)
  const refreshingRef = useRef(false)
  const syncedOrderRef = useRef(null)
  const premiumReconcileKeyRef = useRef(null)
  const setSocketPhase = useCallback((phase) => {
    socketPhaseRef.current = phase
    setSocketState((prev) => ({ ...prev, phase }))
  }, [])

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
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    activeFriendRef.current = activeFriend
  }, [activeFriend])

  useEffect(() => {
    socketPhaseRef.current = socketState.phase
  }, [socketState.phase])

  useEffect(() => {
    callOverlayStateRef.current = callOverlayState
  }, [callOverlayState])

  // Silent Auto-Login Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // If we have a Firebase user but NO backend session, sync them silently
      if (user && !sessionRef.current?.accessToken) {
        setAuthLoading(true)
        const next = await signInSilently(user)
        if (next) setSession(normalizeSession(next))
        setAuthLoading(false)
      }
      setIsInitializing(false)
    })
    return () => unsubscribe()
  }, [])

  // Heartbeat: keep queue position alive while waiting for a match
  useEffect(() => {
    if (socketState.phase !== 'matching' || !socketRef.current) return
    const interval = setInterval(() => {
      socketRef.current?.emit('random:ping')
    }, 10_000)
    return () => clearInterval(interval)
  }, [socketState.phase])

  useEffect(() => {
    if (socketState.phase !== 'matching') return

    let timeoutId = null
    const schedulePing = () => {
      const delay = 6000 + Math.floor(Math.random() * 2001)
      timeoutId = window.setTimeout(() => {
        playRadarPing()
        schedulePing()
      }, delay)
    }

    schedulePing()
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [socketState.phase])

  useEffect(() => {
    if (callOverlayState.status !== 'incoming') {
      stopIncomingCallRingtone()
    }

    return () => {
      stopIncomingCallRingtone()
    }
  }, [callOverlayState.status])

  // ── Proactive Server Health Monitor ──────────────────────────
  // Pings /health every 15s to detect outages even before login
  useEffect(() => {
    let mounted = true
    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`${BACKEND_URL}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (mounted) setIsServerDown(!res.ok)
      } catch {
        if (mounted) setIsServerDown(true)
      }
    }

    checkHealth() // Check immediately on mount
    const interval = setInterval(checkHealth, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const emitBrowserGeoIfGranted = useCallback((socket) => {
    if (!socket || typeof window === 'undefined') return
    if (!window.isSecureContext || !('geolocation' in navigator)) return
    if (!navigator.permissions?.query) return

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((permissionStatus) => {
        if (permissionStatus.state !== 'granted') return
        navigator.geolocation.getCurrentPosition(
          (position) => {
            socket.emit('presence:geo:update', {
              lat: position.coords.latitude,
              long: position.coords.longitude,
            })
          },
          () => { },
          {
            enableHighAccuracy: false,
            maximumAge: 10 * 60 * 1000,
            timeout: 8000,
          }
        )
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (!session?.accessToken) return

    let socket = null
    let cancelled = false

    const connect = async () => {
      try {
        const validSession = await getValidSession(sessionRef.current)
        if (cancelled) return

        if (validSession.accessToken !== sessionRef.current?.accessToken) {
          const normalized = normalizeSession(validSession)
          sessionRef.current = normalized
          setSession(normalized)
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
          setHasConnectedOnce(true)
          emitBrowserGeoIfGranted(socket)
          // Fetch unread counts on connect
          authedFetch(`${BACKEND_URL}/api/v1/messages/unread-counts`)
            .then(r => r.json())
            .then(json => { if (json.success) setUnreadCounts(json.data.counts || {}) })
            .catch(() => { })
        })

        socket.on('connect_error', async (err) => {
          const msg = err.message || ''
          const isAuthErr = msg.includes('expired') || msg.includes('Authentication failed') || msg.includes('Invalid')
          if (isAuthErr && sessionRef.current?.refreshToken && !refreshingRef.current) {
            refreshingRef.current = true
            try {
              const next = await refreshSession(sessionRef.current.refreshToken)
              const normalized = normalizeSession(next)
              saveSession(normalized)
              sessionRef.current = normalized
              setSession(normalized)
              setSocketVersion((v) => v + 1)
            } catch {
              handleSignOut()
            }
            return
          }
          if (!isAuthErr) setSocketState((prev) => ({ ...prev, status: 'error' }))
        })

        socket.on('presence:count', (payload) => setOnlineCount(payload.count))
        socket.on('random:stats', (stats) => setMatchingStats(stats))
        socket.on('random:waiting', () => {
          if (socketPhaseRef.current !== 'matching') {
            playQueueEnterChirp()
          }
          setSocketPhase('matching')
        })
        socket.on('random:matched', (payload) => {
          setRoom(payload)
          setSocketPhase('matched')
          setChatMessages([])
          playMatchThump()
        })
        socket.on('random:message', (msg) => {
          setChatMessages((prev) => {
            let processedMsg = { ...msg, reactions: [] }
            if (msg.replyToMessageId) {
              const parent = prev.find((m) => m.id === msg.replyToMessageId)
              if (parent) processedMsg.replyTo = { fromName: parent.fromName, content: parent.content }
            }
            return [...prev, processedMsg]
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
        socket.on('random:edited', (data) => {
          setChatMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, content: data.content, isEdited: true } : m))
        })
        socket.on('random:deleted', (data) => {
          setChatMessages((prev) => prev.filter((m) => m.id !== data.messageId))
        })
        socket.on('random:read', (payload) => {
          const shouldPlayReadAck = chatMessagesRef.current.some(
            (m) => m.id === payload.messageId && m.fromUserId === sessionRef.current?.user?.id && !m.read
          )
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === payload.messageId && m.fromUserId === sessionRef.current?.user?.id
                ? { ...m, read: true }
                : m
            )
          )
          if (shouldPlayReadAck) {
            playReadAck()
          }
        })
        socket.on('random:left', (payload) => {
          const currentRoom = roomRef.current
          const activeRoomId = currentRoom?.roomId || currentRoom?.id
          // Ignore stale leave events from old rooms after a rematch.
          if (payload?.roomId && activeRoomId && payload.roomId !== activeRoomId) {
            return
          }
          const currentPhase = socketPhaseRef.current
          // Only show vibe check if we were actually matched and there is a partner to vote on
          if (currentPhase === 'matched' && currentRoom?.partner?.id) {
            setVibeCheckState({
              show: true,
              partner: currentRoom.partner,
              roomId: currentRoom.roomId || currentRoom.id
            })
            playPartnerLeftDissolve()
          }
          setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
          setSocketPhase('partner-left')
        })
        socket.on('typing:start', (payload) => {
          if (!payload?.userId || payload.userId === roomRef.current?.partner?.id) setPartnerTyping(true)
        })
        socket.on('typing:stop', (payload) => {
          if (!payload?.userId || payload.userId === roomRef.current?.partner?.id) setPartnerTyping(false)
        })

        socket.on('message:sent', (payload) => {
          // No-op if this is handled in component, but good to have sync
        })
        socket.on('message:edited', (data) => {
          // We need a way to update FriendChat's local state as well
          // This usually happens via a global store or passing down setMessages
        })
        socket.on('message:deleted', (data) => {
          // Same as above
        })
        socket.on('message:read', (payload) => {
          if (payload?.userId !== sessionRef.current?.user?.id) return
          const senderId = payload?.senderId
          if (!senderId) return
          setUnreadCounts((prev) => {
            if (!(senderId in prev)) return prev
            const next = { ...prev }
            delete next[senderId]
            return next
          })
        })
        socket.on('messages:read', (payload) => {
          if (payload?.userId !== sessionRef.current?.user?.id) return
          const senderId = payload?.senderId
          if (!senderId) return
          setUnreadCounts((prev) => {
            if (!(senderId in prev)) return prev
            const next = { ...prev }
            delete next[senderId]
            return next
          })
        })
        // Track unread messages when NOT in that friend's chat
        socket.on('message:received', (payload) => {
          const senderId = payload?.message?.senderId || payload?.senderId
          if (!senderId) return

          const currentFriendId = activeFriendRef.current?.user?.id
          const isViewingSenderChat = socketPhaseRef.current === 'friend-chat' && currentFriendId === senderId
          if (isViewingSenderChat) return

          setUnreadCounts(prev => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }))
        })

        socket.on('disconnect', () => {
          setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
          setSocketState((prev) => ({ ...prev, status: 'disconnected' }))
        })

        // Global Call Signaling
        socket.on('webrtc:call-request', (data) => {
          if (callOverlayStateRef.current.status !== 'idle') return

          const callRoomId = data.roomId || roomRef.current?.roomId
          setCallOverlayState({
            status: 'incoming',
            partner: { ...(data.caller || roomRef.current?.partner), roomId: callRoomId },
            type: data.recipientId ? 'friend' : 'random',
            isInitiator: false
          })
          startIncomingCallRingtone()
        })

        socket.on('webrtc:call-response', (data) => {
          const wasInCallFlow = callOverlayStateRef.current.status !== 'idle'
          stopIncomingCallRingtone()
          if (data.status === 'accepted') {
            setCallOverlayState(prev => ({ ...prev, status: 'active' }))
            if (wasInCallFlow) {
              playCallConnectedChirp()
            }
          } else {
            setCallOverlayState(prev => ({ ...prev, status: 'idle', partner: null }))
            if (data.status === 'declined' && wasInCallFlow) {
              playHangupTone()
            }
          }
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
  }, [session?.accessToken, socketVersion, emitBrowserGeoIfGranted])

  const handleSendMessage = (content, replyToMessageId, isVanish = false) => {
    if (socketState.phase === 'friend-chat' && activeFriend) {
      socketRef.current?.emit('message:send', {
        recipientId: activeFriend.user.id,
        encryptedContent: btoa(content),
        encryptedKey: btoa('placeholder-key'),
        messageType: 'text',
        replyToId: replyToMessageId,
        isVanish
      })
      return
    }
    const targetRoomId = room?.roomId || room?.id
    if (!targetRoomId) return
    socketRef.current?.emit('random:message', { roomId: targetRoomId, content, replyToMessageId, isVanish })
  }

  const handleEditRandomMessage = (messageId, content) => {
    const targetRoomId = room?.roomId || room?.id
    if (!socketRef.current || !targetRoomId) return
    socketRef.current.emit('random:edit', {
      roomId: targetRoomId,
      messageId,
      content
    })
  }

  const handleDeleteRandomMessage = (messageId) => {
    const targetRoomId = room?.roomId || room?.id
    if (!socketRef.current || !targetRoomId) return
    socketRef.current.emit('random:delete', {
      roomId: targetRoomId,
      messageId
    })
  }

  const handleTyping = (isTyping) => {
    if (socketState.phase === 'friend-chat' && activeFriend) {
      socketRef.current?.emit(isTyping ? 'typing:start' : 'typing:stop', { recipientId: activeFriend.user.id })
      return
    }
    const targetRoomId = room?.roomId || room?.id
    if (!targetRoomId) return
    socketRef.current?.emit(isTyping ? 'typing:start' : 'typing:stop', { roomId: targetRoomId })
  }

  const handleAuth = async () => {
    setAuthError('')
    setAuthLoading(true)
    try {
      const next = await signInWithGoogle()
      setSession(normalizeSession(next))
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = () => {
    refreshingRef.current = false
    stopIncomingCallRingtone()
    if (socketRef.current) {
      const currentRoom = roomRef.current
      const roomId = currentRoom?.roomId || currentRoom?.id
      socketRef.current.emit('random:leave', roomId ? { roomId } : undefined)
      socketRef.current.disconnect()
      socketRef.current = null
    }
    clearSession()
    setSession(null)
    setShowChat(false)
    setIsTransitioning(false)
    setRoom(null)
    setActiveHaveli(null)
    setChatMessages([])
    setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
    socketPhaseRef.current = 'idle'
    setSocketState({ status: 'disconnected', phase: 'idle', socket: null })
  }

  const handleLeaveChat = () => {
    const currentRoom = roomRef.current
    const roomId = currentRoom?.roomId || currentRoom?.id
    if (socketRef.current) socketRef.current.emit('random:leave', roomId ? { roomId } : undefined)

    // Trigger vibe check if we were in a match
    if (socketPhaseRef.current === 'matched' && currentRoom?.partner) {
      setVibeCheckState({
        show: true,
        partner: currentRoom.partner,
        roomId: currentRoom.roomId || currentRoom.id
      })
    }

    setShowChat(false)
    setIsTransitioning(false)
    setRoom(null)
    setChatMessages([])
    setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
    setSocketPhase('idle')
  }

  const authedFetch = useCallback(async (url, opts = {}) => {
    const cur = sessionRef.current
    if (!cur?.accessToken) throw new Error('Not authenticated')
    const doFetch = (token) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } })
    let res = await doFetch(cur.accessToken)
    if (res.status === 401 && cur.refreshToken) {
      try {
        const next = await refreshSession(cur.refreshToken)
        const normalized = normalizeSession(next)
        setSession(normalized)
        saveSession(normalized)
        sessionRef.current = normalized
        res = await doFetch(normalized.accessToken)
      } catch (err) {
        console.error('Session refresh failed:', err)
        handleSignOut()
      }
    }
    return res
  }, [])

  const refreshCurrentUser = useCallback(async () => {
    const res = await authedFetch(`${BACKEND_URL}/api/v1/users/me`)
    const json = await res.json()
    if (!json?.success || !json?.data?.user) {
      throw new Error(json?.error?.message || 'Failed to refresh user')
    }
    const nextSession = normalizeSession({
      ...sessionRef.current,
      user: {
        ...sessionRef.current?.user,
        ...json.data.user,
        profilePictureUrl: Object.prototype.hasOwnProperty.call(json.data.user, 'profilePictureUrl')
          ? (json.data.user.profilePictureUrl || null)
          : (sessionRef.current?.user?.profilePictureUrl || null),
        photoURL: Object.prototype.hasOwnProperty.call(json.data.user, 'profilePictureUrl')
          ? (json.data.user.profilePictureUrl || null)
          : (sessionRef.current?.user?.photoURL || null),
      },
    })
    sessionRef.current = nextSession
    setSession(nextSession)
    saveSession(nextSession)
    return nextSession
  }, [authedFetch])

  const handleUpgradeToPlus = async () => {
    const cur = sessionRef.current
    if (!cur?.accessToken) {
      await handleAuth()
      return
    }

    setPremiumLoading(true)
    try {
      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/app`
        : undefined

      const createRes = await authedFetch(`${BACKEND_URL}/api/v1/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: 'plus_monthly',
          returnUrl,
        }),
      })
      const createJson = await createRes.json()
      if (!createJson?.success || !createJson?.data?.paymentSessionId) {
        throw new Error(createJson?.error?.message || 'Could not create payment order')
      }

      const orderId = createJson.data.orderId
      await openCashfreeCheckout({
        paymentSessionId: createJson.data.paymentSessionId,
        returnUrl: returnUrl ? `${returnUrl}?payment_order_id=${encodeURIComponent(orderId)}` : undefined,
      })

      if (orderId) {
        const syncRes = await authedFetch(`${BACKEND_URL}/api/v1/payments/sync-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        })
        const syncJson = await syncRes.json()
        if (!syncJson?.success) {
          throw new Error(syncJson?.error?.message || 'Payment sync failed')
        }
      }

      await refreshCurrentUser()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed'
      alert(message)
    } finally {
      setPremiumLoading(false)
    }
  }

  const handleExportLatestInvoice = async () => {
    const cur = sessionRef.current
    if (!cur?.accessToken) {
      await handleAuth()
      return
    }

    const res = await authedFetch(`${BACKEND_URL}/api/v1/payments/invoice/latest/pdf`, {
      method: 'GET',
    })

    if (!res.ok) {
      let message = `Could not export invoice (${res.status})`
      const responseType = res.headers.get('content-type') || ''

      if (responseType.includes('application/json')) {
        try {
          const payload = await res.json()
          message = payload?.error?.message || message
        } catch {
          // Keep fallback message if body parsing fails.
        }
      }

      throw new Error(message)
    }

    const blob = await res.blob()
    if (!blob || blob.size === 0) {
      throw new Error('Received an empty PDF file from server')
    }

    const suggestedName =
      extractDownloadFileName(res.headers.get('content-disposition')) || 'muhdikhai-invoice.pdf'

    const downloadUrl = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = suggestedName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(downloadUrl)
  }

  useEffect(() => {
    if (!session?.accessToken || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get('payment_order_id') || params.get('order_id')
    if (!orderId || syncedOrderRef.current === orderId) return

    syncedOrderRef.current = orderId
    ;(async () => {
      try {
        await authedFetch(`${BACKEND_URL}/api/v1/payments/sync-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        })
        await refreshCurrentUser()
      } catch (error) {
        console.warn('Payment sync after redirect failed', error)
      } finally {
        params.delete('payment_order_id')
        params.delete('order_id')
        const next = params.toString()
        const basePath = window.location.pathname
        window.history.replaceState({}, '', next ? `${basePath}?${next}` : basePath)
      }
    })()
  }, [session?.accessToken, authedFetch, refreshCurrentUser])

  useEffect(() => {
    if (!session?.accessToken || !session?.user?.id) return

    const reconcileKey = `${session.user.id}:${session.user.premiumTier || 'free'}:${session.user.premiumStatus || 'inactive'}`
    if (premiumReconcileKeyRef.current === reconcileKey) return
    premiumReconcileKeyRef.current = reconcileKey

    ;(async () => {
      try {
        const summaryRes = await authedFetch(`${BACKEND_URL}/api/v1/payments/me`)
        const summaryJson = await summaryRes.json()
        if (!summaryJson?.success) return

        const recentOrders = Array.isArray(summaryJson?.data?.recentOrders) ? summaryJson.data.recentOrders : []
        const latestPendingOrder = recentOrders.find((order) => order?.paymentStatus !== 'SUCCESS' && order?.orderId)

        if (latestPendingOrder?.orderId) {
          await authedFetch(`${BACKEND_URL}/api/v1/payments/sync-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: latestPendingOrder.orderId }),
          })
          await refreshCurrentUser()
          return
        }

        const premiumSummary = summaryJson?.data?.premium
        const localUser = sessionRef.current?.user
        const isServerActive = premiumSummary?.tier === 'plus' && premiumSummary?.status === 'active'
        const isLocalActive = localUser?.premiumTier === 'plus' && localUser?.premiumStatus === 'active'

        if (isServerActive && !isLocalActive) {
          await refreshCurrentUser()
        }
      } catch (error) {
        console.warn('Premium reconciliation failed', error)
      }
    })()
  }, [session?.accessToken, session?.user?.id, session?.user?.premiumTier, session?.user?.premiumStatus, authedFetch, refreshCurrentUser])

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
          profilePictureUrl: Object.prototype.hasOwnProperty.call(json.data.user, 'profilePictureUrl')
            ? (json.data.user.profilePictureUrl || null)
            : (sessionRef.current.user.profilePictureUrl || null),
          photoURL: Object.prototype.hasOwnProperty.call(json.data.user, 'profilePictureUrl')
            ? (json.data.user.profilePictureUrl || null)
            : (sessionRef.current.user.photoURL || null),
        },
      }
      const normalized = normalizeSession(nextSession)
      setSession(normalized)
      sessionRef.current = normalized
      saveSession(normalized)
    } catch (error) {
      console.error('Profile update failed:', error)
      throw error
    }
  }

  const handleCheckUsernameAvailability = useCallback(async (username) => {
    const normalized = String(username || '').trim().toLowerCase()
    if (!normalized) return { available: false }
    const res = await authedFetch(`${BACKEND_URL}/api/v1/users/username-availability?username=${encodeURIComponent(normalized)}`)
    const json = await res.json()
    if (!json?.success) {
      throw new Error(json?.error?.message || 'Could not check username')
    }
    return json.data
  }, [authedFetch])

  const uploadAvatarWithToken = (token, file, onProgress) => new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('avatar', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BACKEND_URL}/api/v1/users/me/avatar`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)))
        onProgress(percent)
      }
    }

    xhr.onerror = () => reject(new Error('Avatar upload failed due to a network error'))
    xhr.onabort = () => reject(new Error('Avatar upload was cancelled'))
    xhr.onload = () => {
      const isSuccess = xhr.status >= 200 && xhr.status < 300
      let payload = null
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        // Fallback message handled below.
      }

      if (!isSuccess || !payload?.success || !payload?.data?.url) {
        const error = new Error(payload?.error?.message || `Failed to upload avatar (status ${xhr.status})`)
        error.status = xhr.status
        reject(error)
        return
      }
      resolve(payload.data.url)
    }

    xhr.send(formData)
  })

  const handleUploadAvatar = async (file, options = {}) => {
    const cur = sessionRef.current
    if (!cur?.accessToken) throw new Error('Not authenticated')

    const onProgress = options?.onProgress

    try {
      const validSession = await getValidSession(cur)
      if (validSession.accessToken !== cur.accessToken) {
        const normalized = normalizeSession(validSession)
        sessionRef.current = normalized
        setSession(normalized)
        saveSession(normalized)
      }

      const token = validSession.accessToken || cur.accessToken
      return await uploadAvatarWithToken(token, file, onProgress)
    } catch (error) {
      const shouldRetry = error?.status === 401 && cur?.refreshToken
      if (!shouldRetry) {
        console.error('Avatar upload failed:', error)
        throw error
      }

      try {
        const next = await refreshSession(cur.refreshToken)
        const normalized = normalizeSession(next)
        sessionRef.current = normalized
        setSession(normalized)
        saveSession(normalized)
        return await uploadAvatarWithToken(normalized.accessToken, file, onProgress)
      } catch (retryError) {
        console.error('Avatar upload failed:', retryError)
        throw retryError
      }
    }
  }

  const handleFetchMatches = useCallback(async () => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/matches/recent`)
      const json = await res.json()
      return json.success ? json.data.matches : []
    } catch (error) {
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
      throw error
    }
  }, [authedFetch])

  const handleFetchFriendships = useCallback(async (status) => {
    try {
      const url = status ? `${BACKEND_URL}/api/v1/friends?status=${status}` : `${BACKEND_URL}/api/v1/friends`
      const res = await authedFetch(url)
      const json = await res.json()
      return json.success ? json.data.friendships : []
    } catch (error) {
      return []
    }
  }, [authedFetch])

  const handleRespondToFriendRequest = useCallback(async (friendshipId, action) => {
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/v1/friends/${friendshipId}/${action}`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || `Failed to ${action} friend request`)
      return true
    } catch (error) {
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
      throw error
    }
  }

  const handleOpenFriendChat = (friend) => {
    activeFriendRef.current = friend
    setActiveFriend(friend)
    setSocketPhase('friend-chat')
    // Clear unread count for this friend
    setUnreadCounts(prev => {
      const next = { ...prev }
      delete next[friend.user.id]
      return next
    })
  }

  const handleBackFromFriendChat = () => {
    activeFriendRef.current = null
    setActiveFriend(null)
    setSocketPhase('idle')
  }

  const handleInitiateCall = (partner, type) => {
    if (!socketRef.current) return
    initAudio()
    const roomId = partner.roomId || partner.id
    const recipientId = type === 'friend' ? (partner.user?.id || partner.id) : null

    // For random chats, partner is the room object — extract the actual partner
    const partnerInfo = type === 'random' && partner.partner
      ? { ...partner.partner, roomId: partner.roomId }
      : partner.user
        ? { ...partner.user, id: partner.user.id }
        : partner

    setCallOverlayState({
      status: 'requesting',
      partner: partnerInfo,
      type,
      isInitiator: true
    })

    socketRef.current.emit('webrtc:call-request', {
      roomId,
      recipientId
    })
    playOutgoingTick()
  }

  const handleAcceptCall = () => {
    if (!socketRef.current) return
    initAudio()
    const roomId = roomRef.current?.roomId || roomRef.current?.id || callOverlayState.partner?.id
    stopIncomingCallRingtone()
    socketRef.current.emit('webrtc:call-response', {
      roomId,
      recipientId: callOverlayState.type === 'friend' ? callOverlayState.partner.id : null,
      status: 'accepted'
    })
    setCallOverlayState(prev => ({ ...prev, status: 'active' }))
    playCallConnectedChirp()
  }

  const handleEndCall = () => {
    if (!socketRef.current) return
    initAudio()
    const roomId = roomRef.current?.roomId || roomRef.current?.id || callOverlayState.partner?.id
    stopIncomingCallRingtone()
    socketRef.current.emit('webrtc:call-response', {
      roomId,
      recipientId: callOverlayState.type === 'friend' ? callOverlayState.partner.id : null,
      status: 'declined' // used for ending too
    })
    setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
    playHangupTone()
  }

  const handleReportUserFromCall = async ({ reportedId, reason, details }) => {
    if (!reportedId) throw new Error('No user selected for report')

    const roomId = roomRef.current?.roomId || roomRef.current?.id || null
    const payload = {
      reportedId,
      reason,
      details: [
        details?.trim() || '',
        roomId ? `roomId=${roomId}` : '',
        `callType=${callOverlayStateRef.current.type || 'unknown'}`,
      ].filter(Boolean).join('\n'),
    }

    const res = await authedFetch(`${BACKEND_URL}/api/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.error || json?.message || 'Failed to submit report')
    }

    return json
  }

  const isSignedIn = Boolean(session?.user)
  const isProfileComplete = hasCompleteProfile(session?.user)
  const isAnyChat = Boolean(showChat || socketState.phase === 'friend-chat' || socketState.phase === 'haveli-room' || activeHaveli)
  const appBooting = isInitializing || !sessionBootstrapped
  const isHome = Boolean(isSignedIn && !isAnyChat && isProfileComplete)
  const isInChat = Boolean(showChat && isSignedIn && isProfileComplete)
  const needsOnboarding = Boolean(isSignedIn && !isProfileComplete)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isHome || !session?.user?.id) return

    const storageKey = `muhdikhai:beta-welcome:${BETA_WELCOME_NOTICE_VERSION}:${session.user.id}`
    const alreadySeen = window.localStorage.getItem(storageKey) === '1'
    if (!alreadySeen) {
      setShowBetaWelcomeModal(true)
    }
  }, [isHome, session?.user?.id])

  const handleAcknowledgeBetaWelcome = useCallback(() => {
    if (typeof window !== 'undefined' && session?.user?.id) {
      const storageKey = `muhdikhai:beta-welcome:${BETA_WELCOME_NOTICE_VERSION}:${session.user.id}`
      window.localStorage.setItem(storageKey, '1')
    }
    setShowBetaWelcomeModal(false)
  }, [session?.user?.id])

  const handleOpenBugReporterFromWelcome = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.openBugReporter === 'function') {
      window.openBugReporter()
    }
    handleAcknowledgeBetaWelcome()
  }, [handleAcknowledgeBetaWelcome])

  useEffect(() => {
    if (!autoMatchOnMount) return
    if (!isSignedIn || !isProfileComplete) return
    if (showChat || socketState.phase !== 'idle') return

    initAudio()
    const defaultPrefs = { topics: [], preference: 'everyone' }
    setIsTransitioning(true)
    setMatchPrefs(defaultPrefs)
    setChatMessages([])
    setSocketPhase('matching')
    const t1 = setTimeout(() => {
      setShowChat(true)
      setIsTransitioning(false)
    }, 350)
    const t2 = setTimeout(() => {
      socketRef.current?.emit('random:join', defaultPrefs)
    }, 450)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [autoMatchOnMount, isSignedIn, isProfileComplete, showChat, socketState.phase, setSocketPhase])


  return (
    <div className={`page ${isAnyChat ? 'is-chat-page' : ''}`}>
      <ExperienceBackground phase={socketState.phase} isTyping={partnerTyping} />
      {!isAnyChat && (
        <header className="nav">
          <div className="nav-left">
            <div className="nav-mark">
              <img src="/logo.png" alt="Muhdikhai Mascot" className="nav-logo-img" />
            </div>
            <div className="nav-title">
              <span className="brand-word">Muhdikhai</span>
              <span className="brand-sub">
                {socketState.phase === 'friend-chat' ? 'Friend Room' : isInChat ? 'Inside the madness' : isHome ? 'Vibe Check' : 'Real people. Pure chaos.'}
              </span>
            </div>
          </div>
          <div className="nav-right">
            {isSignedIn && (
              <div className="nav-user">
                <div className="online-pill"><span className="online-dot" /><span>{onlineCount} present</span></div>
                <button className="nav-signout" onClick={handleSignOut}>Leave</button>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={(isInChat || socketState.phase === 'friend-chat') ? 'main-full' : ''}>
        {isAdminView && isSignedIn && session.user.isAdmin && (
          <AdminDashboard 
            session={session} 
            authedFetch={authedFetch}
          />
        )}
        {!isAdminView && isHome && (
          <Home
            session={session}
            onlineCount={onlineCount}
            isTransitioning={isTransitioning}
            onStartMatch={(topics, preference) => {
              if (!hasCompleteProfile(sessionRef.current?.user)) {
                return
              }
              initAudio()
              setIsTransitioning(true)
              setMatchPrefs({ topics, preference })
              setChatMessages([])
              setSocketPhase('matching')
              setTimeout(() => { setShowChat(true); setIsTransitioning(false); }, 600)
              setTimeout(() => socketRef.current?.emit('random:join', { topics, preference }), 50)
            }}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
            onCheckUsernameAvailability={handleCheckUsernameAvailability}
            onFetchMatches={handleFetchMatches}
            onAddFriend={handleAddFriend}
            onFetchFriendships={handleFetchFriendships}
            onRespondToFriendRequest={handleRespondToFriendRequest}
            onOpenChat={handleOpenFriendChat}
            unreadCounts={unreadCounts}
            authedFetch={authedFetch}
            onOpenHaveli={(haveli) => {
              setActiveHaveli(haveli)
              setShowChat(false)
              setSocketPhase('haveli-room')
            }}
            onUpgradeToPlus={handleUpgradeToPlus}
            onExportLatestInvoice={handleExportLatestInvoice}
          />
        )}
        {socketState.phase === 'haveli-room' && activeHaveli && (
          <HaveliRoom
            haveli={activeHaveli}
            session={session}
            socket={socketRef.current}
            authedFetch={authedFetch}
            onBack={() => {
              setActiveHaveli(null)
              setSocketPhase('idle')
            }}
          />
        )}
        {needsOnboarding && (
          <Onboarding
            session={session}
            onComplete={(updatedUser) => {
              const next = normalizeSession({ ...session, user: updatedUser })
              setSession(next)
              saveSession(next)
            }}
          />
        )}
        {!isSignedIn && !appBooting && (
          <Landing
            onStartMatch={handleAuth}
            onUpgradeToPlus={handleUpgradeToPlus}
            authLoading={authLoading}
            premiumLoading={premiumLoading}
            authError={authError}
            onlineCount={onlineCount}
          />
        )}
        {appBooting && (
          <div className="auth-initializer">
            <div className="auth-spinner" />
            <p>Restoring session...</p>
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
            onEditMessage={handleEditRandomMessage}
            onDeleteMessage={handleDeleteRandomMessage}
            onTyping={handleTyping}
            onLeave={handleLeaveChat}
            authedFetch={authedFetch}
            onInitiateCall={() => handleInitiateCall(room, 'random')}
            callOverlayStatus={callOverlayState.status}
            onSearchAgain={() => {
              const currentRoom = roomRef.current;
              const currentPhase = socketPhaseRef.current;
              const roomId = currentRoom?.roomId || currentRoom?.id;
              // Leave current first
              socketRef.current?.emit('random:leave', roomId ? { roomId } : undefined);

              // Trigger vibe check if we were in a match
              if (currentPhase === 'matched' && currentRoom?.partner) {
                setVibeCheckState({
                  show: true,
                  partner: currentRoom.partner,
                  roomId: currentRoom.roomId || currentRoom.id
                });
              }

              // Reset local state immediately
              setSocketPhase('matching');
              setRoom(null);
              setChatMessages([]);
              // Delay re-join to let the backend finish cleaning up the leave
              // Without this, random:join can arrive before random:leave completes,
              // causing the user to get stuck (heartbeat exists but not in any queue)
              setTimeout(() => socketRef.current?.emit('random:join', matchPrefs), 300);
            }}
            matchingStats={matchingStats}
            onAddFriend={handleAddFriend}
          />
        )}
        {socketState.phase === 'friend-chat' && activeFriend && (
          <FriendChat
            session={session}
            friend={activeFriend}
            socket={socketRef.current}
            authedFetch={authedFetch}
            onBack={handleBackFromFriendChat}
            onInitiateCall={() => handleInitiateCall(activeFriend, 'friend')}
          />
        )}
      </main>

      {showBetaWelcomeModal && isHome && (
        <div className="beta-welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="beta-welcome-title">
          <div className="beta-welcome-card">
            <span className="beta-welcome-chip">Early Access Beta</span>
            <h2 id="beta-welcome-title">You are one of our first users</h2>
            <p className="beta-welcome-copy">
              Thanks for joining early. Please follow the community rules, respect others in chats and calls, and share feedback so we can improve fast.
            </p>
            <ul className="beta-welcome-points">
              <li>Read and follow Terms, Safety, and Privacy.</li>
              <li>Be respectful and avoid abusive behavior.</li>
              <li>Report issues quickly through bug report.</li>
            </ul>
            <div className="beta-welcome-links">
              <a href="/terms">Terms</a>
              <a href="/safety">Safety</a>
              <a href="/privacy">Privacy</a>
            </div>
            <div className="beta-welcome-actions">
              <button type="button" className="btn-ghost beta-welcome-btn" onClick={handleOpenBugReporterFromWelcome}>
                Feedback / Bug Report
              </button>
              <button type="button" className="btn-primary beta-welcome-btn" onClick={handleAcknowledgeBetaWelcome}>
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {vibeCheckState.show && (
        <VibeCheckModal
          partner={vibeCheckState.partner}
          roomId={vibeCheckState.roomId}
          onVote={async (vibe) => {
            try {
              const res = await authedFetch(`${BACKEND_URL}/api/v1/users/aura/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  targetId: vibeCheckState.partner?.id || vibeCheckState.partner?.uid,
                  roomId: vibeCheckState.roomId,
                  vibe
                })
              })
              const json = await res.json()
              if (!json.success) throw new Error(json.error?.message || 'Vote failed')

              // Optionally update own level if feedback affects us? 
              // No, it affects the target. But we might want to refresh our own aura points later.
            } catch (err) {
              console.error('Vote failed:', err)
              throw err
            }
          }
          }
          onSkip={() => setVibeCheckState({ show: false, partner: null, roomId: null })}
        />
      )}


      {callOverlayState.status !== 'idle' && (
        <CallOverlay
          socket={socketRef.current}
          session={session}
          callState={callOverlayState}
          partner={callOverlayState.partner}
          onAccept={handleAcceptCall}
          onDecline={handleEndCall}
          onEnd={handleEndCall}
          onReport={handleReportUserFromCall}
        />
      )}

      {!isAdminView && !isInChat && socketState.phase !== 'friend-chat' && (
        <footer className="footer">
          <div className="footer-main">
            <div className="footer-brand">
              <span className="footer-name">Muhdikhai</span>
              <p className="footer-tagline">The loudness you needed. Unfiltered random chat.</p>
            </div>
            <div className="footer-links">
              <button className="footer-link" onClick={() => setLegalView('terms')}>Terms</button>
              <button className="footer-link" onClick={() => setLegalView('privacy')}>Privacy</button>
              <button className="footer-link" onClick={() => setLegalView('safety')}>Safety</button>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-credit">Developed by Yaduraj Singh</div>
            <div className="footer-copyright">© 2026 MUHDIKHAI. Built for the chaos.</div>
          </div>
        </footer>
      )}

      {legalView && (
        <LegalPages
          initialTab={legalView}
          onClose={() => setLegalView(null)}
        />
      )}

      {/* Premium Server Down Overlay (Proactive & Reactive Cyberpunk Theme) */}
      {!isInitializing && !suppressOverlay && (isServerDown || ((socketState.status === 'disconnected' || socketState.status === 'error') && hasConnectedOnce && session)) && (
        <div className="server-down-overlay">
          <div className="perspective-grid"></div>
          <div className="grid-overlay"></div>

          <div className="terminal-window">
             <div className="terminal-header">
                <div className="dot dot-red"></div>
                <div className="dot dot-yellow"></div>
                <div className="dot dot-green"></div>
             </div>
             <div className="terminal-content">
                <p>&gt; RECOVERY_MODE_ACTIVE</p>
                <p>&gt; OPTIMIZING_DATABASES...</p>
                <p>&gt; REROUTING_TRAFFIC...</p>
                <p>&gt; COMPILING_ASSETS...</p>
                <p>&gt; ESTABLISHING_SECURE_NODE...</p>
                <p>&gt; SYNCING_REDIS_CLUSTERS...</p>
                <p>&gt; HEARTBEAT_MISSING_REROUTING...</p>
                <p>&gt; CLEANING_GHOST_ENTRIES...</p>
                <p>&gt; RECOVERY_PROGRESS_98_PERCENT</p>
             </div>
          </div>

          <div className="cyber-orb-container">
            <div className="orb-glow"></div>
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTitDRCngRu8Xl3EjpGTqWIDfQlLybZHUtXLXH7N-vrV1jqlBwN7ikFOoX12hvDHBfU4uDFG5jtU-pjCAHpcMT24INkhJ1Odng6WgyKSfcx8PbldrhQja-Bw0SxOZ5PRSNwq4IdUnl_PdYWeuba7d58Cc6OFm6y79RM_R5HwF5QyECvLEyk6SKOX2yBIARWhslT47eFKkW7MX_Wh0wdVu6EhjZaQ8fZ-UWb9EetHGha97-BSm1TGCRzzzP2iKzvAyL--TfwnYFXb76" 
              alt="Server Orb" 
              className="cyber-orb"
            />
          </div>

          <h1 className="cyber-glitch-title" data-text="CHAOS IS PAUSED">
            CHAOS IS PAUSED
          </h1>
          <p className="cyber-subtext">
            Our server is taking a quick nap (probably upgrading the madness). 
            We'll be back online in just a few minutes.
          </p>

          <div className="cyber-btn-group">
            <a 
              href="https://chat.whatsapp.com/IhbRhUPtxC5FlHJyUlPEDB" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="cyber-btn-wa"
            >
              <svg className="wa-icon" viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.55 4.197 1.592 6.02L0 24l6.149-1.613a11.758 11.758 0 005.9 1.594h.005c6.634 0 12.05-5.414 12.05-12.05 0-3.217-1.252-6.242-3.525-8.514z"/>
              </svg>
              Join Status Group
            </a>
            <button className="cyber-btn-secondary" onClick={() => window.location.reload()}>
              RETRY CONNECTION
            </button>
            <button className="cyber-btn-preview" onClick={() => setSuppressOverlay(true)}>
              VIEW LANDING PREVIEW
            </button>
          </div>

          <div className="neon-progress-container">
            <div className="progress-header">
              <span>RECONNECTING...</span>
              <span>98% COMPLETE</span>
            </div>
            <div className="progress-track">
              <div className="progress-bar-fill"></div>
            </div>
          </div>
        </div>
      )}
      <PWAInstallPrompt />
      <BugReporter />
    </div>
  )
}

export default RealtimeClientApp
