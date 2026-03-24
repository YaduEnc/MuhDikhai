import { useState, useEffect, useRef, useCallback } from 'react'
import { calculateAuraLevel } from '../utils/aura'
import { getAvatarUrl, getAvatarInitial, getAvatarStyle } from '../utils/avatar'
import './HaveliRoom.css'

const HAVELI_THEMES = [
  { id: 'midnight_terrace', name: 'Midnight Terrace', color: '#0f0c29', accent: '#8b5cf6', emoji: '🌙' },
  { id: 'monsoon_night', name: 'Monsoon Night', color: '#0a192f', accent: '#38bdf8', emoji: '🌧️' },
  { id: 'cyber_dhaba', name: 'Cyber Dhaba', color: '#1a0a2e', accent: '#f472b6', emoji: '🍵' },
  { id: 'ancient_library', name: 'Ancient Library', color: '#1c1410', accent: '#d97706', emoji: '📜' },
  { id: 'neon_bazaar', name: 'Neon Bazaar', color: '#0d0d0d', accent: '#22c55e', emoji: '💚' },
  { id: 'sunset_courtyard', name: 'Sunset Courtyard', color: '#1a0f0a', accent: '#fb923c', emoji: '🌅' },
  { id: 'ocean_deck', name: 'Ocean Deck', color: '#0a1628', accent: '#06b6d4', emoji: '🌊' },
  { id: 'royal_durbar', name: 'Royal Durbar', color: '#1a0a1e', accent: '#e879f9', emoji: '👑' },
]

function getTheme(id) {
  return HAVELI_THEMES.find(t => t.id === id) || HAVELI_THEMES[0]
}

function SettingsPanel({ haveli, onClose, onUpdateSettings, onDeleteHaveli, isAdmin }) {
  const [name, setName] = useState(haveli.name || '')
  const [description, setDescription] = useState(haveli.description || '')
  const [themeId, setThemeId] = useState(haveli.themeId || 'midnight_terrace')
  const [privacyType, setPrivacyType] = useState(haveli.privacyType || 'public')
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdateSettings({ name, description, themeId, privacyType })
      onClose()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="haveli-settings-panel">
        <div className="haveli-settings-header">
          <h3>Room Info</h3>
          <button className="haveli-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="haveli-settings-body">
          <div className="haveli-settings-info-row"><span>Name</span><strong>{haveli.name}</strong></div>
          <div className="haveli-settings-info-row"><span>Privacy</span><strong>{haveli.privacyType === 'public' ? '🌐 Public' : '🔑 Invite Only'}</strong></div>
          <div className="haveli-settings-info-row"><span>Theme</span><strong>{getTheme(haveli.themeId).name}</strong></div>
          <div className="haveli-settings-info-row"><span>Invite Code</span><strong className="haveli-code">{haveli.inviteCode}</strong></div>
          {haveli.description && <div className="haveli-settings-info-row"><span>About</span><strong>{haveli.description}</strong></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="haveli-settings-panel">
      <div className="haveli-settings-header">
        <h3>⚙️ Admin Settings</h3>
        <button className="haveli-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="haveli-settings-body">
        <div className="haveli-field">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} />
        </div>
        <div className="haveli-field">
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={2} />
        </div>
        <div className="haveli-field">
          <label>Theme</label>
          <div className="haveli-theme-grid haveli-theme-grid--sm">
            {HAVELI_THEMES.map(theme => (
              <button
                key={theme.id}
                className={`haveli-theme-option ${themeId === theme.id ? 'active' : ''}`}
                style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}
                onClick={() => setThemeId(theme.id)}
                title={theme.name}
              >
                <span className="haveli-theme-emoji">{theme.emoji}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="haveli-field">
          <label>Privacy</label>
          <div className="haveli-privacy-options">
            <button className={`haveli-privacy-btn haveli-privacy-btn--sm ${privacyType === 'public' ? 'active' : ''}`} onClick={() => setPrivacyType('public')}>🌐 Public</button>
            <button className={`haveli-privacy-btn haveli-privacy-btn--sm ${privacyType === 'invite' ? 'active' : ''}`} onClick={() => setPrivacyType('invite')}>🔑 Invite</button>
          </div>
        </div>
        <div className="haveli-settings-info-row">
          <span>Invite Code</span>
          <strong className="haveli-code">{haveli.inviteCode}</strong>
          <button className="haveli-copy-btn" onClick={() => { navigator.clipboard.writeText(haveli.inviteCode); }} title="Copy code">📋</button>
        </div>

        <button className="haveli-btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: '1rem' }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <div className="haveli-danger-zone">
          {!showDeleteConfirm ? (
            <button className="haveli-btn-danger" onClick={() => setShowDeleteConfirm(true)}>🗑️ Delete Haveli</button>
          ) : (
            <div className="haveli-delete-confirm">
              <p>Are you sure? This will delete the Haveli permanently.</p>
              <div className="haveli-delete-actions">
                <button className="haveli-btn-danger" onClick={onDeleteHaveli}>Yes, delete</button>
                <button className="haveli-btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HaveliRoom({ haveli: initialHaveli, session, socket, authedFetch, onBack }) {
  const [haveli, setHaveli] = useState(initialHaveli)
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [kicked, setKicked] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

  const userId = session?.user?.id
  const isAdmin = haveli.creatorId === userId

  const theme = getTheme(haveli.themeId)

  // Fetch room data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [roomRes, msgRes] = await Promise.all([
          authedFetch(`${BACKEND_URL}/api/v1/havelis/${haveli.id}`),
          authedFetch(`${BACKEND_URL}/api/v1/havelis/${haveli.id}/messages?limit=50`),
        ])
        const [roomJson, msgJson] = await Promise.all([roomRes.json(), msgRes.json()])

        if (roomJson.success) {
          setHaveli(prev => ({ ...prev, ...roomJson.data.haveli }))
          setMembers(roomJson.data.members || [])
        }
        if (msgJson.success) setMessages(msgJson.data.messages || [])
      } catch {}
      setLoading(false)
    }
    fetchData()
  }, [haveli.id, authedFetch, BACKEND_URL])

  // Join socket room on mount
  useEffect(() => {
    if (!socket || !haveli.id) return
    socket.emit('haveli:join', { haveliId: haveli.id })
    return () => {
      socket.emit('haveli:leave', { haveliId: haveli.id })
    }
  }, [socket, haveli.id])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    const handleMessage = (msg) => {
      if (msg.haveliId !== haveli.id) return
      setMessages(prev => [...prev, msg])
    }

    const handleTypingStart = (data) => {
      if (data.haveliId !== haveli.id || data.userId === userId) return
      setTypingUsers(prev => {
        if (prev.find(u => u.userId === data.userId)) return prev
        return [...prev, { userId: data.userId, name: data.name }]
      })
    }

    const handleTypingStop = (data) => {
      if (data.haveliId !== haveli.id) return
      setTypingUsers(prev => prev.filter(u => u.userId !== data.userId))
    }

    const handleMemberKicked = (data) => {
      if (data.haveliId !== haveli.id) return
      setMembers(prev => prev.filter(m => m.userId !== data.targetUserId))
    }

    const handleKicked = (data) => {
      if (data.haveliId !== haveli.id) return
      setKicked(true)
    }

    const handleDeleted = (data) => {
      if (data.haveliId !== haveli.id) return
      setDeleted(true)
    }

    const handleSettingsUpdated = (data) => {
      if (data.haveliId !== haveli.id) return
      setHaveli(prev => ({ ...prev, ...data.haveli }))
    }

    const handleMemberOnline = (data) => {
      if (data.haveliId !== haveli.id) return
      setMembers(prev => prev.map(m =>
        m.userId === data.userId ? { ...m, user: { ...m.user, status: 'online' } } : m
      ))
    }

    const handleMemberOffline = (data) => {
      if (data.haveliId !== haveli.id) return
      setMembers(prev => prev.map(m =>
        m.userId === data.userId ? { ...m, user: { ...m.user, status: 'offline' } } : m
      ))
    }

    socket.on('haveli:message', handleMessage)
    socket.on('haveli:typing:start', handleTypingStart)
    socket.on('haveli:typing:stop', handleTypingStop)
    socket.on('haveli:member:kicked', handleMemberKicked)
    socket.on('haveli:kicked', handleKicked)
    socket.on('haveli:deleted', handleDeleted)
    socket.on('haveli:settings:updated', handleSettingsUpdated)
    socket.on('haveli:member:online', handleMemberOnline)
    socket.on('haveli:member:offline', handleMemberOffline)

    return () => {
      socket.off('haveli:message', handleMessage)
      socket.off('haveli:typing:start', handleTypingStart)
      socket.off('haveli:typing:stop', handleTypingStop)
      socket.off('haveli:member:kicked', handleMemberKicked)
      socket.off('haveli:kicked', handleKicked)
      socket.off('haveli:deleted', handleDeleted)
      socket.off('haveli:settings:updated', handleSettingsUpdated)
      socket.off('haveli:member:online', handleMemberOnline)
      socket.off('haveli:member:offline', handleMemberOffline)
    }
  }, [socket, haveli.id, userId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Typing handler
  const handleTyping = useCallback(() => {
    if (!socket || !haveli.id) return
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('haveli:typing:start', { haveliId: haveli.id })
    }
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('haveli:typing:stop', { haveliId: haveli.id })
    }, 2000)
  }, [socket, haveli.id])

  const handleSend = () => {
    if (!inputValue.trim() || !socket) return
    socket.emit('haveli:message', { haveliId: haveli.id, content: inputValue.trim() })
    setInputValue('')
    isTypingRef.current = false
    clearTimeout(typingTimeoutRef.current)
    socket.emit('haveli:typing:stop', { haveliId: haveli.id })
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleKickMember = (targetId) => {
    if (!socket || !isAdmin) return
    socket.emit('haveli:kick', { haveliId: haveli.id, targetUserId: targetId })
  }

  const handleUpdateSettings = async (updates) => {
    if (!socket) return
    socket.emit('haveli:settings:update', { haveliId: haveli.id, updates })
  }

  const handleToggleLock = () => {
    if (!socket || !isAdmin) return
    socket.emit('haveli:settings:update', {
      haveliId: haveli.id,
      updates: { isLocked: !haveli.isLocked }
    })
  }

  const handleDeleteHaveli = () => {
    if (!socket || !isAdmin) return
    socket.emit('haveli:delete', { haveliId: haveli.id })
  }

  const handleLeave = async () => {
    try {
      await authedFetch(`${BACKEND_URL}/api/v1/havelis/${haveli.id}/leave`, { method: 'POST' })
    } catch {}
    onBack()
  }

  // If kicked or deleted, show overlay
  if (kicked) {
    return (
      <div className="haveli-room" style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}>
        <div className="haveli-room-bg" />
        <div className="haveli-overlay-msg">
          <span className="haveli-overlay-icon">🚫</span>
          <h2>You were removed</h2>
          <p>The admin removed you from this Haveli.</p>
          <button className="haveli-btn-primary" onClick={onBack}>Back to Bazaar</button>
        </div>
      </div>
    )
  }

  if (deleted) {
    return (
      <div className="haveli-room" style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}>
        <div className="haveli-room-bg" />
        <div className="haveli-overlay-msg">
          <span className="haveli-overlay-icon">🏚️</span>
          <h2>Haveli Demolished</h2>
          <p>The admin deleted this Haveli.</p>
          <button className="haveli-btn-primary" onClick={onBack}>Back to Bazaar</button>
        </div>
      </div>
    )
  }

  const onlineMembers = members.filter(m => m.user?.status === 'online')

  return (
    <div className="haveli-room" style={{ '--theme-color': theme.color, '--theme-accent': theme.accent }}>
      <div className="haveli-room-bg" />

      {/* Header */}
      <div className="haveli-room-header">
        <button className="haveli-room-back" onClick={onBack}>←</button>
        <div className="haveli-room-header-info" onClick={() => setShowSettings(true)}>
          <span className="haveli-room-header-emoji">{theme.emoji}</span>
          <div>
            <h2 className="haveli-room-header-name">
              {haveli.name}
              {haveli.isLocked && <span className="haveli-lock-badge">🔒</span>}
            </h2>
            <span className="haveli-room-header-meta">
              {members.length} members • {onlineMembers.length} online
            </span>
          </div>
        </div>
        <div className="haveli-room-header-actions">
          {isAdmin && (
            <button
              className={`haveli-room-action-btn ${haveli.isLocked ? 'active' : ''}`}
              onClick={handleToggleLock}
              title={haveli.isLocked ? 'Unlock room' : 'Lock room'}
            >
              {haveli.isLocked ? '🔓' : '🔒'}
            </button>
          )}
          <button
            className={`haveli-room-action-btn ${showMembers ? 'active' : ''}`}
            onClick={() => setShowMembers(!showMembers)}
            title="Members"
          >
            👥
          </button>
          <button
            className="haveli-room-action-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Pinned Message */}
      {haveli.pinnedMessage && (
        <div className="haveli-pinned">
          <span className="haveli-pinned-icon">📌</span>
          <span className="haveli-pinned-text">{haveli.pinnedMessage}</span>
        </div>
      )}

      {/* Messages */}
      <div className="haveli-room-messages">
        {loading ? (
          <div className="haveli-loading" style={{ padding: '2rem' }}>
            <div className="haveli-loading-spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div className="haveli-room-empty">
            <span>{theme.emoji}</span>
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMine = msg.senderId === userId
            const prevMsg = messages[i - 1]
            const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId || msg.isSystem
            const senderUrl = getAvatarUrl(msg.sender)
            const senderInitial = getAvatarInitial(msg.sender)
            const senderStyle = getAvatarStyle(msg.sender)
            const aura = calculateAuraLevel(msg.sender?.auraPoints || 0)

            if (msg.isSystem) {
              return (
                <div key={msg.id} className="haveli-msg-system">
                  <span>{msg.content}</span>
                </div>
              )
            }

            return (
              <div key={msg.id} className={`haveli-msg ${isMine ? 'haveli-msg--mine' : ''} ${showAvatar ? 'haveli-msg--head' : ''}`}>
                {showAvatar && !isMine && (
                  <div className="haveli-msg-avatar">
                    {senderUrl ? (
                      <img src={senderUrl} alt="" />
                    ) : (
                      <span style={senderStyle}>{senderInitial}</span>
                    )}
                  </div>
                )}
                <div className="haveli-msg-body">
                  {showAvatar && !isMine && (
                    <div className="haveli-msg-sender">
                      <span className="haveli-msg-name">{msg.sender?.name || 'Unknown'}</span>
                      <span className="haveli-msg-aura" style={{ color: aura.color }}>✧</span>
                    </div>
                  )}
                  <div className="haveli-msg-content">
                    {msg.messageType === 'image' ? (
                      <img src={msg.content} alt="Shared" className="haveli-msg-image" />
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    <span className="haveli-msg-time">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="haveli-typing-bar">
          <div className="haveli-typing-dots"><span /><span /><span /></div>
          <span>
            {typingUsers.length === 1
              ? `${typingUsers[0].name} is typing...`
              : `${typingUsers.length} people are typing...`}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="haveli-room-input-bar">
        <textarea
          ref={inputRef}
          className="haveli-room-input"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); handleTyping() }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
        />
        <button className="haveli-send-btn" onClick={handleSend} disabled={!inputValue.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>

      {/* Members Sidebar */}
      {showMembers && (
        <div className="haveli-sidebar">
          <div className="haveli-sidebar-header">
            <h3>Members ({members.length})</h3>
            <button className="haveli-modal-close" onClick={() => setShowMembers(false)}>✕</button>
          </div>
          <div className="haveli-sidebar-list">
            {members.map(m => {
              const avatarUrl = getAvatarUrl(m.user)
              const avatarInitial = getAvatarInitial(m.user)
              const avatarStyle = getAvatarStyle(m.user)
              const memberAura = calculateAuraLevel(m.user?.auraPoints || 0)
              const isOnline = m.user?.status === 'online'

              return (
                <div key={m.id} className="haveli-member-row">
                  <div className={`haveli-member-avatar ${isOnline ? 'online' : ''}`}>
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : <span style={avatarStyle}>{avatarInitial}</span>}
                  </div>
                  <div className="haveli-member-info">
                    <span className="haveli-member-name">
                      {m.user?.name || 'Unknown'}
                      {m.role === 'admin' && <span className="haveli-admin-badge">Admin</span>}
                    </span>
                    <span className="haveli-member-aura" style={{ color: memberAura.color }}>
                      ✧ {memberAura.name}
                    </span>
                  </div>
                  {isAdmin && m.userId !== userId && (
                    <button className="haveli-kick-btn" onClick={() => handleKickMember(m.userId)} title="Remove from Haveli">
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {!isAdmin && (
            <button className="haveli-btn-danger" onClick={handleLeave} style={{ margin: '1rem' }}>
              Leave Haveli
            </button>
          )}
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="haveli-sidebar">
          <SettingsPanel
            haveli={haveli}
            isAdmin={isAdmin}
            onClose={() => setShowSettings(false)}
            onUpdateSettings={handleUpdateSettings}
            onDeleteHaveli={handleDeleteHaveli}
          />
        </div>
      )}
    </div>
  )
}
