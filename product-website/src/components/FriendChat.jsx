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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FriendChat({ session, friend, onBack, socket, authedFetch, onInitiateCall }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [partnerTyping, setPartnerTyping] = useState(false)
    const [showGifPicker, setShowGifPicker] = useState(false)
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

        socket.on('message:received', handleMessage)
        socket.on('message:sent', handleMessage)
        socket.on('typing:start', handleTypingStart)
        socket.on('typing:stop', handleTypingStop)

        return () => {
            socket.off('message:received', handleMessage)
            socket.off('message:sent', handleMessage)
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
            messageType: 'text'
        })

        setInput('')
        clearTimeout(typingTimeoutRef.current)
        socket.emit('typing:stop', { recipientId: friend.user.id })
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

    const renderMessageContent = (m) => {
        const decoded = decodeContent(m.encryptedContent || m.content)
        if (!decoded) return <span className="fc-msg-hidden">Message unavailable</span>

        if (isImageUrl(decoded)) {
            return (
                <div className="fc-msg-image-wrap">
                    <img src={decoded} alt="shared" className="fc-msg-image" loading="lazy" />
                </div>
            )
        }

        return <span>{decoded}</span>
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
                    messages.map((m, i) => {
                        const isMine = m.senderId === session.user.id
                        const showAvatar = !isMine && (i === 0 || messages[i - 1]?.senderId !== m.senderId)

                        return (
                            <div key={m.id || i} className={`fc-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                                {!isMine && (
                                    <div className={`fc-bubble-avatar ${showAvatar ? '' : 'invisible'}`}>
                                        {friend.user.profilePictureUrl ? (
                                            <img src={friend.user.profilePictureUrl} alt="" />
                                        ) : (
                                            <span>{friend.user.name?.[0]}</span>
                                        )}
                                    </div>
                                )}
                                <div className={`fc-bubble ${isMine ? 'mine' : 'theirs'}`}>
                                    <div className="fc-bubble-content">
                                        {renderMessageContent(m)}
                                    </div>
                                    <div className="fc-bubble-meta">
                                        <span className="fc-bubble-time">{formatTime(m.sentAt)}</span>
                                        {isMine && (
                                            <span className="fc-bubble-status">
                                                {m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}

                {partnerTyping && <TypingDots name={friend.user.name?.split(' ')[0]} />}
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
