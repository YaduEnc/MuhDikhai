import { useState, useEffect, useRef, useCallback, memo } from 'react'
import './FriendChat.css'

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC'

// ─── Typing Indicator ─────────────────────────────────────────────────────────
const TypingDots = memo(function TypingDots({ name }) {
    return (
        <div className="fc-typing-indicator">
            <div className="fc-typing-dots">
                <span /><span /><span />
            </div>
            <span className="fc-typing-label">{name} is typing</span>
        </div>
    )
})

// ─── GIF Picker ───────────────────────────────────────────────────────────────
const GifPicker = memo(function GifPicker({ onSelect, onClose }) {
    const [query, setQuery] = useState('')
    const [gifs, setGifs] = useState([])
    const [loading, setLoading] = useState(false)
    const debounceRef = useRef(null)

    const fetchGifs = useCallback(async (q) => {
        setLoading(true)
        try {
            const endpoint = q
                ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=20&rating=pg`
            const res = await fetch(endpoint)
            const json = await res.json()
            setGifs(json.data || [])
        } catch {
            setGifs([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchGifs('')
    }, [fetchGifs])

    const handleSearch = (e) => {
        const val = e.target.value
        setQuery(val)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchGifs(val), 400)
    }

    return (
        <div className="fc-gif-picker">
            <div className="fc-gif-header">
                <input
                    className="fc-gif-search"
                    placeholder="Search GIFs…"
                    value={query}
                    onChange={handleSearch}
                    autoFocus
                />
                <button className="fc-gif-close" type="button" onClick={onClose}>✕</button>
            </div>
            <div className="fc-gif-grid">
                {loading && <div className="fc-gif-status">Loading…</div>}
                {!loading && gifs.length === 0 && <div className="fc-gif-status">No results</div>}
                {gifs.map((g) => (
                    <button
                        key={g.id}
                        className="fc-gif-item"
                        type="button"
                        onClick={() => onSelect(g.images.fixed_height_small.url)}
                    >
                        <img src={g.images.fixed_height_small.url} alt={g.title} loading="lazy" />
                    </button>
                ))}
            </div>
            <div className="fc-gif-powered">Powered by GIPHY</div>
        </div>
    )
})

// ─── Helper: detect if content is an image URL ───────────────────────────────
function isImageUrl(text) {
    if (!text) return false
    return /^https?:\/\/.+\.(jpeg|jpg|gif|png|webp|svg)/i.test(text) || text.includes('giphy.com')
}

const MessageMenu = memo(function MessageMenu({ m, isMine, onEdit, onDelete, onClose }) {
    return (
        <div className="fc-menu">
            <div className="fc-menu-reactions">
                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                    <button key={emoji} className="reaction-option" onClick={() => onClose()}>{emoji}</button>
                ))}
            </div>
            {isMine && (
                <>
                    <button className="fc-menu-btn" onClick={() => { onEdit(); onClose(); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit Message
                    </button>
                    <button className="fc-menu-btn delete" onClick={() => { onDelete(m.id); onClose(); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 0 0 1-2-2V6m3 0V4a2 0 0 1 2-2h4a2 0 0 1 2 2v2" />
                        </svg>
                        Unsend
                    </button>
                </>
            )}
        </div>
    )
})

const FriendBubble = memo(function FriendBubble({ m, isMine, showAvatar, friend, decodeContent, handleDelete, handleEdit, formatTime }) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState('')

    return (
        <div className={`fc-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
            {showAvatar && (
                <div className="fc-bubble-avatar">
                    {friend.user.profilePictureUrl ? (
                        <img src={friend.user.profilePictureUrl} alt={friend.user.name} />
                    ) : (
                        friend.user.name[0].toUpperCase()
                    )}
                </div>
            )}
            <div
                className={`fc-bubble ${isMine ? 'mine' : 'theirs'} ${m.isVanish ? 'vanish' : ''}`}
                onContextMenu={(e) => { e.preventDefault(); setMenuOpen(!menuOpen); }}
            >
                <div className="fc-bubble-content">
                    <MessageContent
                        m={m}
                        isMine={isMine}
                        decodeContent={decodeContent}
                        onTimeUp={handleDelete}
                        isEditing={isEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        onEditSubmit={(id, val) => {
                            if (id) handleEdit(id, val);
                            setIsEditing(false);
                        }}
                    />
                </div>
                <div className="fc-bubble-meta">
                    <span className="fc-bubble-time">{formatTime(m.sentAt)}</span>
                    {isMine && m.status === 'read' && (
                        <span className="fc-bubble-read">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                        </span>
                    )}
                </div>
                {menuOpen && (
                    <MessageMenu
                        m={m}
                        isMine={isMine}
                        onEdit={() => { setIsEditing(true); setEditValue(decodeContent(m.encryptedContent || m.content)); }}
                        onDelete={handleDelete}
                        onClose={() => setMenuOpen(false)}
                    />
                )}
            </div>
        </div>
    )
})

// ─── Message Content Renderer ────────────────────────────────────────────────
const MessageContent = memo(function MessageContent({ m, isMine, decodeContent, onTimeUp, isEditing, editValue, setEditValue, onEditSubmit }) {
    const content = decodeContent(m.encryptedContent || m.content)
    const [revealed, setRevealed] = useState(isMine || !m.isVanish)
    const [timeLeft, setTimeLeft] = useState(m.isVanish ? 10 : null)

    useEffect(() => {
        if (m.isVanish && revealed && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000)
            return () => clearInterval(timer)
        }
        if (timeLeft === 0) onTimeUp(m.id)
    }, [m.isVanish, revealed, timeLeft, m.id, onTimeUp])

    if (!content) return <span className="fc-msg-hidden">Message unavailable</span>

    const isGif = content.startsWith('__GIF__')
    const isImage = m.messageType === 'image' || isGif || /^https?:\/\/.+\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(content) || content.includes('giphy.com')
    const isVideo = m.messageType === 'video' || content?.match(/\.(mp4|webm|mov)(\?.*)?$/i)

    if (isEditing) {
        return (
            <textarea
                className="fc-edit-area"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        onEditSubmit(m.id, editValue)
                    }
                    if (e.key === 'Escape') onEditSubmit(null)
                }}
                autoFocus
            />
        )
    }

    if (!isImage && !isVideo) return (
        <span className="fc-text-wrap">
            {content}
            {m.isEdited && <span className="msg-edited-tag">(edited)</span>}
            {timeLeft !== null && <div className="fc-vanish-timer">{timeLeft}</div>}
        </span>
    )

    const mediaUrl = isGif ? content.replace('__GIF__', '') : content

    return (
        <div className={`media-privacy-wrap ${revealed ? 'revealed' : ''}`} onClick={(e) => {
            if (!revealed) {
                e.stopPropagation()
                setRevealed(true)
            }
        }}>
            {isVideo ? (
                <video className="fc-msg-image blur-media" src={mediaUrl} controls={revealed} autoPlay={revealed} loop muted playsInline />
            ) : (
                <img src={mediaUrl} alt="shared" className="fc-msg-image blur-media" loading="lazy" />
            )}

            {!revealed && (
                <div className="blur-overlay">
                    <span className="blur-icon">{isVideo ? '🎬' : '📷'}</span>
                    <span className="blur-text">Click to reveal</span>
                </div>
            )}
            {timeLeft !== null && revealed && <div className="fc-vanish-timer">{timeLeft}</div>}
        </div>
    )
})

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FriendChat({ session, friend, onBack, socket, authedFetch, onInitiateCall }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [partnerTyping, setPartnerTyping] = useState(false)
    const [showGifPicker, setShowGifPicker] = useState(false)
    const [vanishMode, setVanishMode] = useState(false)
    const scrollRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

    const fetchHistory = useCallback(async () => {
        try {
            const response = await authedFetch(`${BACKEND_URL}/api/v1/messages/${friend.user.id}`)
            const json = await response.json()
            if (json.success) {
                setMessages(json.data.messages.reverse())
            }
        } catch (error) {
            console.error('Failed to fetch chat history:', error)
        } finally {
            setLoading(false)
        }
    }, [BACKEND_URL, friend.user.id, authedFetch])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory])

    useEffect(() => {
        if (!socket) return

        const handleMessage = (payload) => {
            const msg = payload.message
            if (msg.senderId === friend.user.id || msg.recipientId === friend.user.id) {
                setMessages((prev) => [...prev, msg])
            }
        }

        const handleTypingStart = (payload) => {
            if (payload.userId === friend.user.id) setPartnerTyping(true)
        }

        const handleTypingStop = (payload) => {
            if (payload.userId === friend.user.id) setPartnerTyping(false)
        }

        const handleEdited = (data) => {
            setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, encryptedContent: btoa(data.content), isEdited: true } : m))
        }

        const handleDeleted = (data) => {
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId))
        }

        socket.on('message:received', handleMessage)
        socket.on('message:sent', handleMessage)
        socket.on('message:edited', handleEdited)
        socket.on('message:deleted', handleDeleted)
        socket.on('typing:start', handleTypingStart)
        socket.on('typing:stop', handleTypingStop)

        return () => {
            socket.off('message:received', handleMessage)
            socket.off('message:sent', handleMessage)
            socket.off('message:edited', handleEdited)
            socket.off('message:deleted', handleDeleted)
            socket.off('typing:start', handleTypingStart)
            socket.off('typing:stop', handleTypingStop)
        }
    }, [socket, friend.user.id])

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, partnerTyping])

    const decodeContent = (content) => {
        if (!content) return ''
        if (typeof content !== 'string') return ''
        try {
            return atob(content)
        } catch {
            return content
        }
    }

    const handleSend = (e) => {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || !socket) return

        socket.emit('message:send', {
            recipientId: friend.user.id,
            encryptedContent: btoa(trimmed),
            encryptedKey: btoa('placeholder-key'),
            messageType: 'text',
            isVanish: vanishMode
        })

        setInput('')
        clearTimeout(typingTimeoutRef.current)
        socket.emit('typing:stop', { recipientId: friend.user.id })
    }

    const handleEdit = (messageId, newContent) => {
        if (!socket) return
        socket.emit('message:edit', {
            messageId,
            content: newContent,
            recipientId: friend.user.id
        })
    }

    const handleDelete = (messageId) => {
        if (!socket) return
        socket.emit('message:delete', {
            messageId,
            recipientId: friend.user.id
        })
    }

    const handleGifSelect = (gifUrl) => {
        if (!socket) return
        socket.emit('message:send', {
            recipientId: friend.user.id,
            encryptedContent: btoa(gifUrl),
            encryptedKey: btoa('placeholder-key'),
            messageType: 'text'
        })
        setShowGifPicker(false)
    }

    const handleInputChange = (e) => {
        setInput(e.target.value)
        if (socket) {
            socket.emit('typing:start', { recipientId: friend.user.id })
            clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('typing:stop', { recipientId: friend.user.id })
            }, 2000)
        }
    }

    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef(null)

    const handleMediaUpload = async (e) => {
        const file = e.target.files?.[0]
        if (!file || !socket) return

        setUploading(true)
        const formData = new FormData()
        formData.append('media', file)

        try {
            const res = await authedFetch(`${BACKEND_URL}/api/v1/messages/upload`, {
                method: 'POST',
                body: formData
            })
            const json = await res.json()
            if (json.success) {
                socket.emit('message:send', {
                    recipientId: friend.user.id,
                    encryptedContent: btoa(json.data.url),
                    encryptedKey: btoa('media-key'),
                    messageType: json.data.type || 'image'
                })
            }
        } catch (err) {
            console.error('Upload failed', err)
            alert('Failed to share media.')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="fc-shell">
            {/* Header */}
            <header className="fc-header">
                <button className="fc-back" onClick={onBack} aria-label="Go back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>

                <div className="fc-header-user">
                    <div className="fc-avatar">
                        {friend.user.profilePictureUrl ? (
                            <img src={friend.user.profilePictureUrl} alt={friend.user.name} />
                        ) : (
                            <span>{friend.user.name?.[0]?.toUpperCase()}</span>
                        )}
                        <div className="fc-online-dot" />
                    </div>
                    <div className="fc-header-info">
                        <span className="fc-header-name">{friend.user.name}</span>
                        <span className="fc-header-status">
                            {partnerTyping ? 'typing...' : 'Online'}
                        </span>
                    </div>
                </div>

                <button
                    className={`fc-vanish-toggle ${vanishMode ? 'active' : ''}`}
                    onClick={() => setVanishMode(!vanishMode)}
                    title="Vanish Mode (Messages disappear in 10s)"
                >
                    <span className="fc-vanish-icon">✨</span>
                    <span className="fc-vanish-label">Vanish</span>
                </button>

                <button className="fc-call-btn" onClick={onInitiateCall} title="Video Call">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                </button>
            </header>

            {/* Messages */}
            <main className="fc-messages">
                {loading ? (
                    <div className="fc-loading">
                        <div className="fc-loading-dots"><span /><span /><span /></div>
                        <span>Loading messages...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="fc-empty">
                        <div className="fc-empty-icon">💬</div>
                        <p>No messages yet. Say hello!</p>
                    </div>
                ) : (
                    <>
                        {messages.map((m, i) => (
                            <FriendBubble
                                key={m.id || i}
                                m={m}
                                isMine={m.senderId === session?.user?.id}
                                showAvatar={m.senderId !== session?.user?.id && (i === 0 || messages[i - 1]?.senderId !== m.senderId)}
                                friend={friend}
                                decodeContent={decodeContent}
                                handleDelete={handleDelete}
                                handleEdit={handleEdit}
                                formatTime={formatTime}
                            />
                        ))}
                        {partnerTyping && <div className="fc-bubble-row theirs"><div className="fc-bubble theirs"><TypingDots /></div></div>}
                    </>
                )}

                <div ref={scrollRef} />
            </main>

            {/* GIF Picker */}
            {showGifPicker && (
                <GifPicker
                    onSelect={handleGifSelect}
                    onClose={() => setShowGifPicker(false)}
                />
            )}

            {/* Input */}
            <form className="fc-input-bar" onSubmit={handleSend}>
                <button
                    type="button"
                    className={`fc-gif-toggle ${showGifPicker ? 'active' : ''}`}
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    title="Send GIF"
                >
                    GIF
                </button>
                <button
                    type="button"
                    className="fc-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Share Photo or Video"
                >
                    {uploading ? '...' : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                    )}
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*,video/*"
                    onChange={handleMediaUpload}
                />
                <input
                    className="fc-input"
                    type="text"
                    placeholder="Type a message..."
                    value={input}
                    onChange={handleInputChange}
                    autoFocus
                />
                <button
                    className="fc-send-btn"
                    type="submit"
                    disabled={!input.trim()}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            </form>
        </div>
    )
}
