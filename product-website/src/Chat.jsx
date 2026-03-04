import { useState, useRef, useEffect, useCallback } from 'react'
import './Chat.css'

// ─── Emoji data ──────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
    {
        label: '😊 Smileys',
        emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '🥴', '😠', '😡', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥳', '🥸', '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓'],
    },
    {
        label: '👋 Gestures',
        emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦵', '🦶', '👂', '🦻', '👃', '👀', '👁', '👄', '🫦', '👅', '🦷', '👣'],
    },
    {
        label: '❤️ Hearts',
        emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☯️', '🔥', '💥', '✨', '⭐', '🌟', '💫', '⚡', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '💎'],
    },
    {
        label: '🐶 Animals',
        emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔'],
    },
    {
        label: '🍕 Food',
        emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🧀', '🥗', '🥙', '🥪', '🌮', '🌯', '🫔', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🫖', '🍵', '🧃', '🥤', '🧋', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🫗'],
    },
    {
        label: '⚽ Sports',
        emojis: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🥊', '🎯', '🏹', '🎣', '🤿', '🎽', '🛹', '🛷', '⛸', '🥅', '⛳', '🎿', '🛷', '🏋️', '🤼', '🤸', '🏊', '🚵', '🧘', '🪂', '🏇'],
    },
]

const GIPHY_KEY = 'dc6zaTOxFJmzC' // public beta key

// ─── Typing dots animation ────────────────────────────────────────────────────
function TypingDots({ name }) {
    return (
        <div className="typing-indicator">
            <span className="typing-name">{name}</span>
            <span className="typing-dots">
                <span /><span /><span />
            </span>
            <span className="typing-label">is typing</span>
        </div>
    )
}

// ─── GIF Picker ───────────────────────────────────────────────────────────────
function GifPicker({ onSelect, onClose }) {
    const [query, setQuery] = useState('')
    const [gifs, setGifs] = useState([])
    const [loading, setLoading] = useState(false)
    const debounceRef = useRef(null)

    const fetchGifs = useCallback(async (q) => {
        setLoading(true)
        try {
            const endpoint = q
                ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=pg`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=pg`
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
        <div className="gif-picker">
            <div className="gif-picker-header">
                <input
                    className="gif-search-input"
                    placeholder="Search GIFs…"
                    value={query}
                    onChange={handleSearch}
                    autoFocus
                />
                <button className="gif-close-btn" type="button" onClick={onClose}>✕</button>
            </div>
            <div className="gif-grid">
                {loading && <div className="gif-loading">Loading…</div>}
                {!loading && gifs.length === 0 && <div className="gif-loading">No results</div>}
                {gifs.map((g) => (
                    <button
                        key={g.id}
                        className="gif-item"
                        type="button"
                        onClick={() => onSelect(g.images.fixed_height_small.url, g.title)}
                    >
                        <img src={g.images.fixed_height_small.url} alt={g.title} loading="lazy" />
                    </button>
                ))}
            </div>
            <div className="gif-powered">Powered by GIPHY</div>
        </div>
    )
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
    const [activeTab, setActiveTab] = useState(0)

    return (
        <div className="emoji-picker">
            <div className="emoji-picker-header">
                <div className="emoji-tabs">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                        <button
                            key={i}
                            className={`emoji-tab${activeTab === i ? ' active' : ''}`}
                            type="button"
                            onClick={() => setActiveTab(i)}
                            title={cat.label}
                        >
                            {cat.emojis[0]}
                        </button>
                    ))}
                </div>
                <button className="gif-close-btn" type="button" onClick={onClose}>✕</button>
            </div>
            <div className="emoji-label">{EMOJI_CATEGORIES[activeTab].label}</div>
            <div className="emoji-grid">
                {EMOJI_CATEGORIES[activeTab].emojis.map((e, i) => (
                    <button
                        key={i}
                        className="emoji-btn"
                        type="button"
                        onClick={() => onSelect(e)}
                    >
                        {e}
                    </button>
                ))}
            </div>
        </div>
    )
}

// ─── Single message bubble ────────────────────────────────────────────────────
function MessageBubble({ msg, isSelf }) {
    const isGif = msg.content?.startsWith('__GIF__')
    const gifUrl = isGif ? msg.content.replace('__GIF__', '') : null
    const time = new Date(msg.sentAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    })

    return (
        <li className={`msg-row${isSelf ? ' msg-row--self' : ''}`}>
            {!isSelf && (
                <div className="msg-avatar">
                    {msg.fromProfilePictureUrl ? (
                        <img src={msg.fromProfilePictureUrl} alt={msg.fromName} />
                    ) : (
                        (msg.fromName || 'S')[0].toUpperCase()
                    )}
                </div>
            )}
            <div className="msg-content">
                {!isSelf && <span className="msg-sender">{msg.fromName || 'Stranger'}</span>}
                <div className={`msg-bubble${isSelf ? ' msg-bubble--self' : ''}`}>
                    {isGif ? (
                        <img className="msg-gif" src={gifUrl} alt="GIF" />
                    ) : (
                        <span>{msg.content}</span>
                    )}
                </div>
                <span className={`msg-time${isSelf ? ' msg-time--self' : ''}`}>{time}</span>
            </div>
            {isSelf && (
                <div className="msg-avatar msg-avatar--self">
                    {session?.user?.profilePictureUrl ? (
                        <img src={session.user.profilePictureUrl} alt="You" />
                    ) : (
                        'You'
                    )}
                </div>
            )}
        </li>
    )
}

// ─── Profile Modal ───────────────────────────────────────────────────
function ProfileModal({ partnerId, session, onClose }) {
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
                const res = await fetch(`${BACKEND_URL}/api/v1/users/${partnerId}`, {
                    headers: { 'Authorization': `Bearer ${session.accessToken}` }
                })
                const json = await res.json()
                if (json.success) setProfile(json.data.user)
            } catch (err) {
                console.error('Failed to fetch profile', err)
            } finally {
                setLoading(false)
            }
        }
        fetchProfile()
    }, [partnerId, session.accessToken])

    return (
        <div className="profile-modal-overlay" onClick={onClose}>
            <div className="profile-modal-card" onClick={e => e.stopPropagation()}>
                <button className="profile-close-btn" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="profile-loading">Reading the vibes...</div>
                ) : profile ? (
                    <>
                        <div className="profile-large-avatar">
                            {profile.profilePictureUrl ? (
                                <img src={profile.profilePictureUrl} alt={profile.name} />
                            ) : (
                                (profile.name || '?')[0].toUpperCase()
                            )}
                        </div>
                        <h3 className="profile-name-full">{profile.name}</h3>

                        <div className="profile-badge-row">
                            {profile.gender && <span className="profile-badge">{profile.gender}</span>}
                            {profile.age && <span className="profile-badge">{profile.age} years old</span>}
                        </div>

                        <span className="profile-label">About</span>
                        <div className="profile-bio-box">
                            {profile.bio || "This stranger hasn't written a bio yet."}
                        </div>
                    </>
                ) : (
                    <div className="profile-error">Couldn't find this stranger.</div>
                )}
            </div>
        </div>
    )
}

// ─── Chat shell ───────────────────────────────────────────────────────────────
export default function Chat({
    session,
    room,
    socketState,
    chatMessages,
    partnerTyping,
    onSendMessage,
    onTyping,
    onLeave,
}) {
    const [input, setInput] = useState('')
    const [showEmoji, setShowEmoji] = useState(false)
    const [showGif, setShowGif] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatMessages, partnerTyping])

    // Close pickers on Escape
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                setShowEmoji(false)
                setShowGif(false)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    const handleInput = (e) => {
        const val = e.target.value
        setInput(val)
        // Fire typing event
        if (onTyping) {
            onTyping(true)
            clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => onTyping(false), 1500)
        }
    }

    const handleSend = () => {
        const trimmed = input.trim()
        if (!trimmed || socketState.phase !== 'matched') return
        onSendMessage(trimmed)
        setInput('')
        if (onTyping) onTyping(false)
        inputRef.current?.focus()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleEmojiSelect = (emoji) => {
        setInput((prev) => prev + emoji)
        setShowEmoji(false)
        inputRef.current?.focus()
    }

    const handleGifSelect = (url) => {
        onSendMessage(`__GIF__${url}`)
        setShowGif(false)
    }

    const isMatched = socketState.phase === 'matched'
    const isMatching = socketState.phase === 'matching'

    return (
        <div className="chat-shell-v2">
            {/* Header */}
            <div className="chat-header-v2">
                <div className="chat-header-left" onClick={() => isMatched && setShowProfile(true)}>
                    <div className="chat-partner-avatar">
                        {room?.partner?.profilePictureUrl ? (
                            <img src={room.partner.profilePictureUrl} alt={room.partner.name} />
                        ) : (
                            (room?.partner?.name || '?')[0].toUpperCase()
                        )}
                    </div>
                    <div className="chat-partner-info">
                        <span className="chat-partner-name">
                            {room?.partner?.name || 'Finding someone…'}
                        </span>
                        <span className={`chat-partner-status${isMatched ? ' live' : ''}`}>
                            {isMatching
                                ? 'Looking for a quiet match…'
                                : isMatched
                                    ? 'Connected · end-to-end encrypted'
                                    : 'Ready when you are'}
                        </span>
                    </div>
                </div>
                <div className="chat-header-right">
                    <div className={`chat-conn-dot${isMatched ? ' live' : ''}`} />
                    <button className="chat-leave-btn" type="button" onClick={onLeave}>
                        Leave room ⎋
                    </button>
                </div>
            </div>

            {/* Messages area */}
            <div className="chat-messages-area">
                {isMatching && (
                    <div className="chat-waiting">
                        <div className="chat-waiting-glow" />
                        <p className="chat-waiting-text">
                            We&apos;re placing you in a slow queue, not a noisy lobby.
                            <br />You&apos;ll see someone as soon as they arrive.
                        </p>
                    </div>
                )}

                {isMatched && chatMessages.length === 0 && (
                    <div className="chat-empty-hint">
                        Say hello, or just sit with the silence for a moment. There&apos;s no timer.
                    </div>
                )}

                {chatMessages.length > 0 && (
                    <ul className="chat-message-list">
                        {chatMessages.map((msg, idx) => (
                            <MessageBubble
                                key={`${msg.sentAt}-${idx}`}
                                msg={msg}
                                isSelf={msg.fromUserId === session?.user?.id}
                            />
                        ))}
                    </ul>
                )}

                {/* Typing indicator */}
                {partnerTyping && room?.partner?.name && (
                    <TypingDots name={room.partner.name} />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Pickers (emoji / gif) */}
            {showEmoji && (
                <div className="picker-overlay">
                    <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
                </div>
            )}
            {showGif && (
                <div className="picker-overlay">
                    <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />
                </div>
            )}

            {/* Profile Modal */}
            {showProfile && room?.partner?.id && (
                <ProfileModal
                    partnerId={room.partner.id}
                    session={session}
                    onClose={() => setShowProfile(false)}
                />
            )}

            {/* Input bar */}
            <div className="chat-input-bar">
                <div className="chat-input-actions">
                    <button
                        className={`input-action-btn${showEmoji ? ' active' : ''}`}
                        type="button"
                        title="Emoji"
                        onClick={() => { setShowEmoji((v) => !v); setShowGif(false) }}
                        disabled={!isMatched}
                    >
                        😊
                    </button>
                    <button
                        className={`input-action-btn${showGif ? ' active' : ''}`}
                        type="button"
                        title="GIF"
                        onClick={() => { setShowGif((v) => !v); setShowEmoji(false) }}
                        disabled={!isMatched}
                    >
                        GIF
                    </button>
                </div>

                <textarea
                    ref={inputRef}
                    className="chat-textarea"
                    placeholder={isMatched ? 'Type something small and honest…' : 'Waiting for someone to arrive…'}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={!isMatched}
                    rows={1}
                />

                <button
                    className="chat-send-btn"
                    type="button"
                    onClick={handleSend}
                    disabled={!isMatched || !input.trim()}
                >
                    <span className="send-icon">↑</span>
                </button>
            </div>
        </div>
    )
}
