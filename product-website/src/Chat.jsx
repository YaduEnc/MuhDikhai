import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { playIncomingDrop, playOutgoingTick } from './utils/soundEngine'
import { useWebRTC } from './hooks/useWebRTC'
import './Chat.css'

// ─── Constants ──────────────────────────────────────────────────────────────
const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC'

// ─── Typing dots animation ────────────────────────────────────────────────────
const TypingDots = memo(function TypingDots({ name }) {
    return (
        <div className="typing-indicator">
            <span className="typing-name">{name}</span>
            <span className="typing-dots">
                <span /><span /><span />
            </span>
            <span className="typing-label">is typing</span>
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
})

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
    { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
    { label: 'Gestures', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸'] },
    { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'] },
    { label: 'Nature', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🕸', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔', '🐾', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐️', '🌟', '✨', '⚡️', '☄️', '💥', '🔥', '🌪', '🌈', '☀️', '🌤', '⛅️', '🌥', '☁️', '🌦', '🌧', '⛈', '🌩', '🌨', '❄️', '☃️', '⛄️', '🌬', '💨', '💧', '💦', '☔️', '☂️', '🌊', '🌫'] },
    { label: 'Food', emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', 'トマト', '茄子', 'アボカド', 'ブロッコリー', '🥬', '胡瓜', '玉蜀黍', '人参', '大蒜', ' onion', '🍄', 'ピーナッツ', '栗', 'パン', 'クロワッサン', 'バゲット', 'プレッツェル', 'ベーグル', 'パンケーキ', 'ワッフル', 'チーズ', '肉', '骨付き肉', 'ステーキ', 'ベーコン', 'ハンバーガー', 'フライドポテト', 'ピザ', 'ホットドッグ', 'サンドイッチ', 'タコス', 'ブリトー', 'ケバブ', 'ファラフェル', '目玉焼き', '鍋', 'シチュー', '器', 'サラダ', 'ポップコーン', 'バター', '塩', '缶詰', '弁当', '煎餅', 'おにぎり', 'ご飯', 'カレー', 'ラーメン', 'パスタ', '薩摩芋', 'おでん', '寿司', '天ぷら', 'なると', '牡蠣', 'ソフトクリーム', 'かき氷', 'アイスクリーム', 'ドーナツ', 'クッキー', 'バースデーケーキ', 'ショートケーキ', 'カップケーキ', 'パイ', 'チョコレート', '飴', 'ペロペロキャンディ', 'プリン', '蜂蜜', '哺乳瓶', 'ミルク', 'コーヒー', 'お茶', 'マテ茶', 'ジュース', 'コップ', '酒', 'ビール', '乾杯', 'ワイン', 'カクテル', 'マテ茶', 'シャンパン', '氷', 'スプーン', 'フォーク', 'ナイフ', 'ボウル', 'テイクアウト', '箸', '塩'] }
]

const EmojiPicker = memo(function EmojiPicker({ onSelect, onClose }) {
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
            <div className="gif-attribution">
                Powered by GIPHY
            </div>
        </div>
    )
})

// ─── Reaction Picker ─────────────────────────────────────────────────────────
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉']

const ReactionPicker = memo(function ReactionPicker({ onSelect, onClose }) {
    return (
        <div className="reaction-picker">
            {REACTION_EMOJIS.map((emoji) => (
                <button
                    key={emoji}
                    className="reaction-option"
                    type="button"
                    onClick={() => { onSelect(emoji); onClose(); }}
                >
                    {emoji}
                </button>
            ))}
        </div>
    )
})

// ─── Single message bubble ────────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ msg, isSelf, session, onProfilePeek, onReply, onReact }) {
    const isGif = msg.content?.startsWith('__GIF__') || msg.type === 'image'
    const isSelfSent = msg.fromUserId === session?.user?.id
    const gifUrl = msg.content?.startsWith('__GIF__') ? msg.content.replace('__GIF__', '') : (msg.type === 'image' ? msg.content : null)
    const [showReactions, setShowReactions] = useState(false)

    const time = new Date(msg.sentAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    })

    // Group reactions by emoji
    const reactionCounts = (msg.reactions || []).reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1
        return acc
    }, {})

    return (
        <li className={`msg-row${isSelf ? ' msg-row--self' : ''}`}>
            {!isSelf && (
                <div
                    className="msg-avatar clickable"
                    onClick={() => onProfilePeek(msg.fromUserId)}
                    title="View profile"
                >
                    {msg.fromProfilePictureUrl ? (
                        <img src={msg.fromProfilePictureUrl} alt={msg.fromName} />
                    ) : (
                        (msg.fromName || 'S')[0].toUpperCase()
                    )}
                </div>
            )}
            <div className="msg-content">
                {!isSelf && <span className="msg-sender">{msg.fromName || 'Stranger'}</span>}


                <div
                    className={`msg-bubble${isSelf ? ' msg-bubble--self' : ''}${msg.type === 'image' ? ' msg-bubble--image' : ''}`}
                    onContextMenu={(e) => { e.preventDefault(); setShowReactions(!showReactions); }}
                >
                    {/* Quoted Reply */}
                    {msg.replyTo && (
                        <div className="msg-quote">
                            <span className="quote-sender">{msg.replyTo.fromName === session?.user?.name ? 'You' : msg.replyTo.fromName}</span>
                            <p className="quote-text">{msg.replyTo.content.startsWith('__GIF__') ? '📷 Media' : msg.replyTo.content}</p>
                        </div>
                    )}

                    {isGif ? (
                        <img className="msg-gif" src={gifUrl} alt="Shared media" />
                    ) : (
                        <span>{msg.content}</span>
                    )}


                    {/* Reaction Overlay */}
                    {showReactions && (
                        <ReactionPicker
                            onSelect={(emoji) => onReact(msg.id, emoji)}
                            onClose={() => setShowReactions(false)}
                        />
                    )}

                    {/* Quick Actions (Reply) */}
                    <button
                        className="msg-action-btn reply"
                        onClick={() => onReply(msg)}
                        title="Reply"
                    >
                        ↩
                    </button>
                    <button
                        className="msg-action-btn react"
                        onClick={() => setShowReactions(!showReactions)}
                        title="React"
                    >
                        ☺
                    </button>
                </div>

                {/* Rendered Reactions */}
                {Object.keys(reactionCounts).length > 0 && (
                    <div className={`msg-reactions-list${isSelf ? ' self' : ''}`}>
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                            <span key={emoji} className="msg-reaction-pill">
                                {emoji} {count > 1 && <span className="react-count">{count}</span>}
                            </span>
                        ))}
                    </div>
                )}

                <div className={`msg-meta${isSelf ? ' msg-meta--self' : ''}`}>
                    <span className="msg-time">{time}</span>
                    {isSelfSent && msg.read && <span className="msg-seen">Seen</span>}
                </div>
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
})

// ─── Profile Modal ───────────────────────────────────────────────────
const ProfileModal = memo(function ProfileModal({ partnerId, session, onClose }) {
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [reporting, setReporting] = useState(false)
    const [reportReason, setReportReason] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [reportDone, setReportDone] = useState(false)

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

    const handleReportSubmit = async () => {
        if (!reportReason) return
        setIsSubmitting(true)
        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const res = await fetch(`${BACKEND_URL}/api/v1/reports`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportedId: partnerId,
                    reason: reportReason
                })
            })
            if (res.ok) {
                setReportDone(true)
            } else {
                alert('Failed to submit report. Please try again.')
            }
        } catch (err) {
            console.error('Report failed', err)
            alert('Something went wrong.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const reportReasons = [
        "Inappropriate behavior",
        "Harassment or bullying",
        "Spam or fake profile",
        "Explicit content",
        "Underage user",
        "Other"
    ]

    return (
        <div className="profile-modal-overlay" onClick={onClose}>
            <div className="profile-modal-card" onClick={e => e.stopPropagation()}>
                <button className="profile-close-btn" onClick={onClose}>✕</button>

                {loading ? (
                    <div className="profile-loading">Reading the vibes...</div>
                ) : reportDone ? (
                    <div className="report-success">
                        <span className="success-icon">🛡️</span>
                        <h3>Report Submitted</h3>
                        <p>Thank you for keeping PlasticWorld safe. Our team will review this shortly.</p>
                        <button className="btn-ghost" onClick={onClose}>Close</button>
                    </div>
                ) : reporting ? (
                    <div className="report-form">
                        <h3>Report Stranger</h3>
                        <p className="report-hint">Tell us why you're reporting this user. This is anonymous.</p>
                        <div className="report-reasons-list">
                            {reportReasons.map(r => (
                                <label key={r} className="report-reason-item">
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={r}
                                        checked={reportReason === r}
                                        onChange={() => setReportReason(r)}
                                    />
                                    <span>{r}</span>
                                </label>
                            ))}
                        </div>
                        <div className="report-actions">
                            <button className="btn-ghost" onClick={() => setReporting(false)}>Back</button>
                            <button
                                className="btn-danger"
                                disabled={!reportReason || isSubmitting}
                                onClick={handleReportSubmit}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Report'}
                            </button>
                        </div>
                    </div>
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

                        <button className="profile-report-btn" onClick={() => setReporting(true)}>
                            Report User
                        </button>
                    </>
                ) : (
                    <div className="profile-error">Couldn't find this stranger.</div>
                )}
            </div>
        </div>
    )
})


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
    onSearchAgain,
}) {
    const [input, setInput] = useState('')
    const [showEmoji, setShowEmoji] = useState(false)
    const [showGif, setShowGif] = useState(false)
    const [showProfile, setShowProfile] = useState(null) // null or userId
    const [uploading, setUploading] = useState(false)
    const [replyingTo, setReplyingTo] = useState(null)
    const fileInputRef = useRef(null)
    const messagesAreaRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)

    const isMatched = socketState.phase === 'matched'
    const isMatching = socketState.phase === 'matching'
    const hasLeft = socketState.phase === 'partner-left'

    const [callState, setCallState] = useState('idle') // idle, requesting, incoming, active

    // ─── WebRTC Hook ───
    const {
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo,
        prepareLocalMedia,
        establishConnection,
        stopLocalMedia
    } = useWebRTC(socketState.socket, room?.roomId || room?.id, session?.user?.id)

    // Call Request Flow Listeners
    useEffect(() => {
        if (!socketState.socket || !room?.id) return

        const handleCallRequest = (data) => {
            if (data.fromUserId !== session?.user?.id) {
                setCallState('incoming')
                playIncomingDrop()
            }
        }

        const handleCallResponse = (data) => {
            if (data.fromUserId !== session?.user?.id) {
                if (data.status === 'accepted') {
                    setCallState('active')
                    establishConnection(true) // Caller initiates P2P connection after acceptance
                } else {
                    setCallState('idle')
                    stopLocalMedia()
                    alert(`${room?.partner?.name || 'Partner'} declined the video request.`)
                }
            }
        }

        socketState.socket.on('webrtc:call-request', handleCallRequest)
        socketState.socket.on('webrtc:call-response', handleCallResponse)

        return () => {
            socketState.socket.off('webrtc:call-request', handleCallRequest)
            socketState.socket.off('webrtc:call-response', handleCallResponse)
        }
    }, [socketState.socket, room?.id, session?.user?.id, establishConnection, stopLocalMedia, room?.partner?.name])

    const initiateCall = async () => {
        const success = await prepareLocalMedia()
        if (!success) return

        setCallState('requesting')
        socketState.socket.emit('webrtc:call-request', { roomId: room?.roomId || room?.id })
    }

    const acceptCall = async () => {
        const success = await prepareLocalMedia()
        if (!success) {
            declineCall()
            return
        }

        setCallState('active')
        socketState.socket.emit('webrtc:call-response', { roomId: room?.roomId || room?.id, status: 'accepted' })
        // Callee waits for offer, starts media in handleSignal automatically on offer receipt
    }

    const declineCall = () => {
        setCallState('idle')
        socketState.socket.emit('webrtc:call-response', { roomId: room?.roomId || room?.id, status: 'declined' })
    }

    // Auto-scroll to latest message and play sound for incoming messages
    useEffect(() => {
        if (messagesAreaRef.current) {
            messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight
        }

        // Play incoming sound if the last message is from the stranger
        if (chatMessages.length > 0) {
            const lastMsg = chatMessages[chatMessages.length - 1]
            if (lastMsg.fromUserId !== session?.user?.id) {
                playIncomingDrop()
            }
        }
    }, [chatMessages, session?.user?.id])

    // Emit read receipt
    useEffect(() => {
        // Mark last message as read if it's from partner
        const lastMsg = chatMessages[chatMessages.length - 1]
        if (lastMsg && lastMsg.fromUserId !== session?.user?.id && socketState.socket) {
            if (socketState.phase === 'friend-chat') {
                socketState.socket.emit('message:read', { messageId: lastMsg.id })
            } else {
                socketState.socket.emit('random:read', {
                    roomId: room?.id,
                    messageId: lastMsg.id
                })
            }
        }

    }, [chatMessages, room?.id, session?.user?.id, socketState.socket])

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
        if (!trimmed || (socketState.phase !== 'matched' && socketState.phase !== 'friend-chat')) return

        onSendMessage(trimmed, replyingTo?.id)
        playOutgoingTick()
        setInput('')
        setReplyingTo(null)
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
        playOutgoingTick()
        setShowGif(false)
    }

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0]
        if (!file || !room?.id) return

        setUploading(true)
        const formData = new FormData()
        formData.append('media', file)
        formData.append('roomId', room.roomId || room.id) // Ensure roomId is passed for tracking

        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const res = await fetch(`${BACKEND_URL}/api/v1/messages/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.accessToken}` },
                body: formData
            })
            const json = await res.json()
            if (json.success) {
                onSendMessage(json.data.url) // enhanced socket will handle type detection
                playOutgoingTick()
            }
        } catch (err) {
            console.error('Upload failed', err)
            alert('Failed to share image. Keep it gentle.')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const iceBreakers = [
        "What's one thing that made you smile today?",
        "Listening to any good music lately?",
        "What's the weather like in your corner of the world?"
    ]

    return (
        <div className="chat-shell-v2">
            {/* Header */}
            <div className="chat-header-v2">
                <div className={`chat-header-left${isMatched ? ' clickable' : ''}`} onClick={() => isMatched && setShowProfile(room?.partner?.id)}>
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
                        {isMatched && room?.topic && (
                            <span className="chat-shared-topic">
                                Shared interest: {room.topic}
                            </span>
                        )}

                    </div>
                </div>
                <div className="chat-header-right">
                    {isMatched && callState === 'idle' && (
                        <button className="video-request-btn" onClick={initiateCall}>
                            🎥 Switch to Video
                        </button>
                    )}
                    {isMatched && callState === 'requesting' && (
                        <span className="video-request-status">Calling...</span>
                    )}
                    <div className={`chat-conn-dot${isMatched ? ' live' : ''}`} />
                    <button className="chat-leave-btn" type="button" onClick={onLeave}>
                        Leave room ⎋
                    </button>
                </div>
            </div>

            {/* Video Portals (The Reveal) */}
            {/* Incoming Video Request Banner */}
            {callState === 'incoming' && (
                <div className="video-incoming-banner">
                    <span className="banner-text">🎥 <strong>{room?.partner?.name}</strong> is inviting you to a video call.</span>
                    <div className="banner-actions">
                        <button className="banner-btn accept" onClick={acceptCall}>Accept</button>
                        <button className="banner-btn decline" onClick={declineCall}>Decline</button>
                    </div>
                </div>
            )}

            {/* Video Portals (Active Call) */}
            {callState === 'active' && (
                <div className="video-portals">
                    <div className="video-portal remote-portal">
                        {remoteStream ? (
                            <video
                                autoPlay
                                playsInline
                                ref={el => { if (el) el.srcObject = remoteStream }}
                            />
                        ) : (
                            <div className="video-placeholder">
                                <div className="placeholder-aura" />
                                <span>Connecting video...</span>
                            </div>
                        )}
                        <div className="video-overlay">
                            <span className="partner-name">{room?.partner?.name}</span>
                        </div>
                    </div>

                    <div className="video-portal local-portal">
                        {localStream ? (
                            <video
                                autoPlay
                                playsInline
                                muted
                                ref={el => { if (el) el.srcObject = localStream }}
                            />
                        ) : (
                            <div className="video-placeholder" />
                        )}
                        <div className="video-controls">
                            <button className={`video-ctrl ${isMuted ? 'off' : ''}`} onClick={toggleMute}>
                                {isMuted ? '🎙️' : '🎤'}
                            </button>
                            <button className={`video-ctrl ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo}>
                                {isVideoOff ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div className="chat-messages-area" ref={messagesAreaRef}>
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
                    <div className="chat-empty-container">
                        <div className="chat-empty-hint">
                            Say hello, or just sit with the silence for a moment. There&apos;s no timer.
                        </div>
                        <div className="chat-starters">
                            {iceBreakers.map((text, i) => (
                                <button
                                    key={i}
                                    className="chat-starter-btn"
                                    onClick={() => onSendMessage(text)}
                                >
                                    {text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {chatMessages.length > 0 && (
                    <ul className="chat-message-list">
                        {chatMessages.map((msg, idx) => (
                            <MessageBubble
                                key={`${msg.sentAt}-${idx}`}
                                msg={msg}
                                isSelf={msg.fromUserId === session?.user?.id}
                                session={session}
                                onProfilePeek={(uid) => setShowProfile(uid)}
                                onReply={(m) => { setReplyingTo(m); inputRef.current?.focus(); }}
                                onReact={(mid, emoji) => {
                                    const targetRoomId = room.roomId || room.id;
                                    if (targetRoomId) {
                                        socketState.socket?.emit('random:reaction', { roomId: targetRoomId, messageId: mid, emoji })
                                    }

                                }}
                                partnerName={room?.partner?.name}
                            />
                        ))}
                    </ul>
                )}

                {/* Partner Left State */}
                {hasLeft && (
                    <div className="chat-partner-left-overlay">
                        <div className="chat-partner-left-card">
                            <span className="left-icon">☁️</span>
                            <h3>Stranger has left the room</h3>
                            <p>The conversation has dissolved like mist. Would you like to reach out again?</p>
                            <div className="left-actions">
                                <button className="btn-primary" onClick={onSearchAgain}>Find someone new</button>
                                <button className="btn-ghost" onClick={onLeave}>Return home</button>
                            </div>
                        </div>
                    </div>
                )}

                {partnerTyping && room?.partner?.name && (
                    <TypingDots name={room.partner.name} />
                )}
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
            {showProfile && (
                <ProfileModal
                    partnerId={showProfile}
                    session={session}
                    onClose={() => setShowProfile(null)}
                />
            )}

            {/* Input bar */}
            <div className="chat-input-container">
                {replyingTo && (
                    <div className="reply-bar">
                        <div className="reply-info">
                            <span className="reply-label">Replying to {replyingTo.fromName === session?.user?.name ? 'yourself' : replyingTo.fromName}</span>
                            <p className="reply-text">{replyingTo.content.startsWith('__GIF__') ? '📷 Media' : replyingTo.content}</p>
                        </div>
                        <button className="reply-close" onClick={() => setReplyingTo(null)} title="Cancel reply">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>

                    </div>
                )}
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
                        <button
                            className="input-action-btn"
                            type="button"
                            title="Share image"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!isMatched || uploading}
                        >
                            {uploading ? '...' : '📸'}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
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
        </div>
    )
}
