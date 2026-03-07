import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import Home from './components/Home'
import Chat from './components/Chat'
import Onboarding from './components/Onboarding'
import Landing from './components/Landing'
import AdminDashboard from './admin/AdminDashboard'
import FriendChat from './components/FriendChat'
import CallOverlay from './components/CallOverlay'
import VibeCheckModal from './components/VibeCheckModal'

import {
  signInWithGoogle,
  refreshSession,
  saveSession,
  getStoredSession as getSession,
  clearSession,
} from './authClient'
import { initAudio, playMatchThump, playIncomingDrop, playOutgoingTick } from './utils/soundEngine'
import './App.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

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

function App() {
  const [session, setSession] = useState(() => getSession())
  const [onlineCount, setOnlineCount] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [room, setRoom] = useState(null)
  const [socketState, setSocketState] = useState({
    status: 'disconnected',
    phase: 'idle', // 'idle' | 'matching' | 'matched' | 'partner-left' | 'friend-chat'
    partnerStatus: 'offline'
  })
  const [chatMessages, setChatMessages] = useState([])
  const [activeFriend, setActiveFriend] = useState(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [socketVersion, setSocketVersion] = useState(0)
  const [isAdminView, setIsAdminView] = useState(window.location.pathname === '/admin')
  const [unreadCounts, setUnreadCounts] = useState({})
  const [matchingStats, setMatchingStats] = useState({ online: 0, inQueue: 0, matched: 0 })
  const [matchPrefs, setMatchPrefs] = useState({ topics: [], preference: 'everyone' })

  const [callOverlayState, setCallOverlayState] = useState({
    type: 'random', // 'random' or 'friend'
    isInitiator: false
  })

  const [vibeCheckState, setVibeCheckState] = useState({
    show: false,
    partner: null,
    roomId: null
  })

  const socketRef = useRef(null)
  const sessionRef = useRef(session)
  const chatMessagesRef = useRef(chatMessages)
  const roomRef = useRef(room)
  const refreshingRef = useRef(false)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminView(window.location.pathname === '/admin')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
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
          sessionRef.current = validSession
          setSession(validSession)
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
              saveSession(next)
              sessionRef.current = next
              setSession(next)
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
        socket.on('random:waiting', () => setSocketState((prev) => ({ ...prev, phase: 'matching' })))
        socket.on('random:matched', (payload) => {
          setRoom(payload)
          setSocketState((prev) => ({ ...prev, phase: 'matched' }))
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
          setChatMessages((prev) => prev.map((m) => (m.id === payload.messageId ? { ...m, read: true } : m)))
        })
        socket.on('random:left', () => {
          const currentRoom = roomRef.current
          if (currentRoom?.partner) {
            setVibeCheckState({
              show: true,
              partner: currentRoom.partner,
              roomId: currentRoom.roomId || currentRoom.id
            })
          }
          setSocketState((prev) => ({ ...prev, phase: 'partner-left' }))
        })
        socket.on('typing:start', () => setPartnerTyping(true))
        socket.on('typing:stop', () => setPartnerTyping(false))

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
        // Track unread messages when NOT in that friend's chat
        socket.on('message:received', (payload) => {
          const senderId = payload.message?.senderId
          if (senderId) {
            setUnreadCounts(prev => {
              // Only increment if NOT viewing this friend's chat
              const currentFriend = sessionRef.current // we'll rely on component re-render
              return { ...prev, [senderId]: (prev[senderId] || 0) + 1 }
            })
          }
        })

        socket.on('disconnect', () => setSocketState((prev) => ({ ...prev, status: 'disconnected' })))

        // Global Call Signaling
        socket.on('webrtc:call-request', (data) => {
          // If we are already in a call or requesting, auto-decline or ignore?
          // For now, only show if idle
          setCallOverlayState(current => {
            if (current.status !== 'idle') return current

            // Use roomId from backend, fall back to current room
            const callRoomId = data.roomId || roomRef.current?.roomId
            return {
              status: 'incoming',
              partner: { ...(data.caller || roomRef.current?.partner), roomId: callRoomId },
              type: data.recipientId ? 'friend' : 'random',
              isInitiator: false
            }
          })
          playIncomingDrop()
        })

        socket.on('webrtc:call-response', (data) => {
          if (data.status === 'accepted') {
            setCallOverlayState(prev => ({ ...prev, status: 'active' }))
          } else {
            setCallOverlayState(prev => ({ ...prev, status: 'idle', partner: null }))
            if (data.status === 'declined') {
              // Optional: show a small toast or just reset
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
  }, [session?.accessToken, socketVersion])

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
    const currentRoom = roomRef.current
    if (socketRef.current) socketRef.current.emit('random:leave')

    // Trigger vibe check if we were in a match
    if (socketState.phase === 'matched' && currentRoom?.partner) {
      setVibeCheckState({
        show: true,
        partner: currentRoom.partner,
        roomId: currentRoom.roomId || currentRoom.id
      })
    }

    setShowChat(false)
    setIsTransitioning(false)
    setRoom(null)
    setSocketState((prev) => ({ ...prev, phase: 'idle' }))
  }

  const authedFetch = useCallback(async (url, opts = {}) => {
    const cur = sessionRef.current
    if (!cur?.accessToken) throw new Error('Not authenticated')
    const doFetch = (token) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } })
    let res = await doFetch(cur.accessToken)
    if (res.status === 401 && cur.refreshToken) {
      try {
        const next = await refreshSession(cur.refreshToken)
        setSession(next)
        saveSession(next)
        sessionRef.current = next
        res = await doFetch(next.accessToken)
      } catch (err) {
        console.error('Session refresh failed:', err)
        handleSignOut()
        throw err
      }
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
      const res = await authedFetch(`${BACKEND_URL}/api/v1/users/me/avatar`, { method: 'POST', body: formData })
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
    setActiveFriend(friend)
    setSocketState(prev => ({ ...prev, phase: 'friend-chat' }))
    // Clear unread count for this friend
    setUnreadCounts(prev => {
      const next = { ...prev }
      delete next[friend.user.id]
      return next
    })
  }

  const handleBackFromFriendChat = () => {
    setActiveFriend(null)
    setSocketState(prev => ({ ...prev, phase: 'idle' }))
  }

  const handleInitiateCall = (partner, type) => {
    if (!socketRef.current) return
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
    const roomId = roomRef.current?.roomId || roomRef.current?.id || callOverlayState.partner?.id
    socketRef.current.emit('webrtc:call-response', {
      roomId,
      recipientId: callOverlayState.type === 'friend' ? callOverlayState.partner.id : null,
      status: 'accepted'
    })
    setCallOverlayState(prev => ({ ...prev, status: 'active' }))
  }

  const handleEndCall = () => {
    if (!socketRef.current) return
    const roomId = roomRef.current?.roomId || roomRef.current?.id || callOverlayState.partner?.id
    socketRef.current.emit('webrtc:call-response', {
      roomId,
      recipientId: callOverlayState.type === 'friend' ? callOverlayState.partner.id : null,
      status: 'declined' // used for ending too
    })
    setCallOverlayState({ status: 'idle', partner: null, type: 'random', isInitiator: false })
  }

  const isSignedIn = Boolean(session?.user)
  const isHome = Boolean(isSignedIn && !showChat && session.user.gender)
  const isInChat = Boolean(showChat && isSignedIn && session.user.gender)
  const needsOnboarding = Boolean(isSignedIn && !session.user.gender)

  if (session && socketState.phase === 'friend-chat' && activeFriend) {
    return (
      <div className="app-shell">
        <FriendChat
          session={session}
          friend={activeFriend}
          socket={socketRef.current}
          authedFetch={authedFetch}
          onBack={handleBackFromFriendChat}
          onInitiateCall={() => handleInitiateCall(activeFriend, 'friend')}
        />
        {callOverlayState.status !== 'idle' && (
          <CallOverlay
            socket={socketRef.current}
            session={session}
            callState={callOverlayState}
            partner={callOverlayState.partner}
            onAccept={handleAcceptCall}
            onDecline={handleEndCall}
            onEnd={handleEndCall}
          />
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-left">
          <div className="nav-mark"><span className="nav-mark-dot" /></div>
          <div className="nav-title">
            <span className="brand-word">Muhdikhai</span>
            <span className="brand-sub">
              {isInChat ? 'You are in a room' : isHome ? 'Welcome back' : 'Anonymous, but unexpectedly tender.'}
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

      <main>
        {isAdminView && isSignedIn && session.user.isAdmin && <AdminDashboard session={session} />}
        {!isAdminView && isHome && (
          <Home
            session={session}
            onlineCount={onlineCount}
            isTransitioning={isTransitioning}
            onStartMatch={(topics, preference) => {
              initAudio()
              setIsTransitioning(true)
              setMatchPrefs({ topics, preference })
              setSocketState((prev) => ({ ...prev, phase: 'matching' }))
              setTimeout(() => { setShowChat(true); setIsTransitioning(false); }, 600)
              setTimeout(() => socketRef.current?.emit('random:join', { topics, preference }), 50)
            }}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
            onFetchMatches={handleFetchMatches}
            onAddFriend={handleAddFriend}
            onFetchFriendships={handleFetchFriendships}
            onRespondToFriendRequest={handleRespondToFriendRequest}
            onOpenChat={handleOpenFriendChat}
            unreadCounts={unreadCounts}
          />
        )}
        {needsOnboarding && (
          <Onboarding
            session={session}
            onComplete={(updatedUser) => {
              const next = { ...session, user: updatedUser }; setSession(next); saveSession(next);
            }}
          />
        )}
        {!isSignedIn && <Landing onStartMatch={handleAuth} authLoading={authLoading} authError={authError} onlineCount={onlineCount} />}
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
            onInitiateCall={() => handleInitiateCall(room, 'random')}
            callOverlayStatus={callOverlayState.status}
            onSearchAgain={() => {
              const currentRoom = roomRef.current;
              // Leave current first
              socketRef.current?.emit('random:leave');

              // Trigger vibe check if we were in a match
              if (socketState.phase === 'matched' && currentRoom?.partner) {
                setVibeCheckState({
                  show: true,
                  partner: currentRoom.partner,
                  roomId: currentRoom.roomId || currentRoom.id
                });
              }

              // Then join new with same prefs
              setSocketState((prev) => ({ ...prev, phase: 'matching' }));
              setRoom(null);
              setChatMessages([]);
              socketRef.current?.emit('random:join', matchPrefs);
            }}
            matchingStats={matchingStats}
            onAddFriend={handleAddFriend}
          />
        )}
      </main>

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
                  targetId: vibeCheckState.partner.id,
                  roomId: vibeCheckState.roomId,
                  vibe
                })
              })
              const json = await res.json()
              if (!json.success) throw new Error(json.error?.message)

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
        />
      )}

      {!isAdminView && (
        <footer className="footer">
          <div className="footer-main">
            <div className="footer-brand">
              <span className="footer-name">Muhdikhai</span>
              <p className="footer-tagline">A privacy‑first random chat experiment.</p>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-credit">Developed by Yaduraj Singh</div>
          </div>
        </footer>
      )}
    </div>
  )
}

export default App
