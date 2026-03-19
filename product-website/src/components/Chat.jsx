import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { playIncomingDrop, playOutgoingTick } from '../utils/soundEngine'
import { calculateAuraLevel } from '../utils/aura'
import DoodleBoard from './DoodleBoard'
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
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

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

const MessageMenu = memo(function MessageMenu({ msg, isSelf, onReact, onEdit, onDelete, onClose }) {
    const isOwner = isSelf
    return (
        <div className="msg-menu">
            <div className="reaction-picker-row">
                {REACTION_EMOJIS.map((emoji) => (
                    <button
                        key={emoji}
                        className="reaction-option"
                        type="button"
                        onClick={() => { onReact(msg.id, emoji); onClose(); }}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
            {isOwner && (
                <div className="msg-actions-row">
                    {!msg.content?.startsWith('__GIF__') && !msg.type?.includes('image') && !msg.type?.includes('video') && (
                        <button className="msg-action-item" onClick={() => { onEdit(msg); onClose(); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                        </button>
                    )}
                    <button className="msg-action-item delete" onClick={() => { onDelete(msg.id); onClose(); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Delete
                    </button>
                </div>
            )}
        </div>
    )
})

// ─── Message Content Renderer (Random Chat) ───────────────────────────────────
const RandomMessageContent = memo(function RandomMessageContent({ msg, isSelf, isEditing, editValue, setEditValue, onEditSubmit, onTimeUp }) {
    const [revealed, setRevealed] = useState(isSelf)
    const [timeLeft, setTimeLeft] = useState(msg.isVanish ? 10 : null)

    useEffect(() => {
        if (msg.isVanish && revealed && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000)
            return () => clearInterval(timer)
        }
        if (timeLeft === 0) onTimeUp(msg.id)
    }, [msg.isVanish, revealed, timeLeft, msg.id, onTimeUp])

    // Detect media type
    const isGif = msg.content?.startsWith('__GIF__')
    const isImage = msg.type === 'image' || isGif || /^https?:\/\/.+\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(msg.content) || msg.content?.includes('giphy.com')
    const isVideo = msg.type === 'video' || msg.content?.match(/\.(mp4|webm|mov)(\?.*)?$/i)

    const mediaUrl = isGif ? msg.content.replace('__GIF__', '') : msg.content

    if (!isImage && !isVideo) {
        if (isEditing) {
            return (
                <textarea
                    className="edit-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            onEditSubmit(msg.id, editValue)
                        }
                        if (e.key === 'Escape') onEditSubmit(null)
                    }}
                    autoFocus
                />
            )
        }
        return (
            <span className="msg-text-span">
                {msg.content}
                {msg.isEdited && <span className="msg-edited-tag">(edited)</span>}
                {timeLeft !== null && <div className="fc-vanish-timer random-vanish">{timeLeft}</div>}
            </span>
        )
    }

    return (
        <div className={`media-privacy-wrap ${revealed ? 'revealed' : ''}`} onClick={(e) => {
            if (!revealed) {
                e.stopPropagation()
                setRevealed(true)
            }
        }}>
            {isVideo ? (
                <video className="msg-gif blur-media" src={mediaUrl} controls={revealed} autoPlay={revealed} loop muted playsInline />
            ) : (
                <img className="msg-gif blur-media" src={mediaUrl} alt="Shared media" />
            )}

            {!revealed && (
                <div className="blur-overlay">
                    <span className="blur-icon">{isVideo ? '🎬' : '📷'}</span>
                    <span className="blur-text">Click to reveal</span>
                </div>
            )}
            {timeLeft !== null && revealed && <div className="fc-vanish-timer random-vanish">{timeLeft}</div>}
        </div>
    )
})

// ─── Single message bubble ────────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ msg, isSelf, session, onProfilePeek, onReply, onReact, onEditMessage, onDeleteMessage, inputRef }) {
    const isSelfSent = msg.fromUserId === session?.user?.id
    const [showMenu, setShowMenu] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(msg.content)

    const isImage = msg.type === 'image' || msg.content?.startsWith('__GIF__') || /^https?:\/\/.+\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(msg.content) || msg.content?.includes('giphy.com')
    const isVideo = msg.type === 'video' || msg.content?.match(/\.(mp4|webm|mov)(\?.*)?$/i)

    const time = msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'

    const reactionCounts = (msg.reactions || []).reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1
        return acc
    }, {})

    return (
        <li className={`msg-row${isSelf ? ' msg-row--self' : ''}`}>
            {!isSelf && (
                <div className="msg-avatar clickable" onClick={() => onProfilePeek(msg.fromUserId)}>
                    {msg.fromProfilePictureUrl ? <img src={msg.fromProfilePictureUrl} alt="" /> : (msg.fromName || 'S')[0].toUpperCase()}
                </div>
            )}
            <div className="msg-content">
                {!isSelf && <span className="msg-sender">{msg.fromName || 'Stranger'}</span>}

                <div
                    className={`msg-bubble${isSelf ? ' msg-bubble--self' : ''}${isImage || isVideo ? ' msg-bubble--image' : ''} ${msg.isVanish ? 'vanish' : ''}`}
                    onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
                >
                    {msg.replyTo && (
                        <div className="msg-quote">
                            <span className="quote-sender">{msg.replyTo.fromName === session?.user?.name ? 'You' : msg.replyTo.fromName}</span>
                            <p className="quote-text">{msg.replyTo.content.startsWith('__GIF__') ? '📷 Media' : msg.replyTo.content}</p>
                        </div>
                    )}

                    <RandomMessageContent
                        msg={msg}
                        isSelf={isSelf}
                        isEditing={isEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        onEditSubmit={(id, val) => {
                            if (id) onEditMessage(id, val);
                            setIsEditing(false);
                            setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        onTimeUp={onDeleteMessage}
                    />

                    {showMenu && (
                        <MessageMenu
                            msg={msg}
                            isSelf={isSelf}
                            onReact={onReact}
                            onEdit={() => setIsEditing(true)}
                            onDelete={onDeleteMessage}
                            onClose={() => setShowMenu(false)}
                        />
                    )}

                    <button className="msg-action-btn reply" onClick={() => onReply(msg)}>↩</button>
                    <button className="msg-action-btn react" onClick={() => setShowMenu(!showMenu)}>☺</button>
                </div>

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
                <button className="profile-modal-close" onClick={onClose}>✕</button>
                {loading ? (
                    <div className="profile-loading">Loading...</div>
                ) : profile ? (
                    <div className="profile-modal-content">
                        <div className="profile-modal-avatar">
                            {profile.profilePictureUrl ? (
                                <img src={profile.profilePictureUrl} alt={profile.name} />
                            ) : (
                                (profile.name || '?')[0].toUpperCase()
                            )}
                        </div>
                        <h3 className="profile-modal-name">{profile.name}</h3>
                        {profile.username && <p className="profile-modal-username">@{profile.username}</p>}

                        <div className="profile-modal-details">
                            <div className="pm-detail">
                                <span className="pm-label">Gender</span>
                                <span className="pm-value" style={{ textTransform: 'capitalize' }}>
                                    {profile.gender?.replace(/_/g, ' ') || 'Unknown'}
                                </span>
                            </div>
                            <div className="pm-detail">
                                <span className="pm-label">Aura</span>
                                <div className="pm-aura-badge" style={{ borderColor: calculateAuraLevel(profile.auraPoints || 0).color }}>
                                    <span className="pm-aura-pts">{profile.auraPoints || 0}</span>
                                    <span className="pm-aura-txt" style={{ color: calculateAuraLevel(profile.auraPoints || 0).color }}>
                                        {calculateAuraLevel(profile.auraPoints || 0).name}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {profile.bio && (
                            <div className="profile-modal-bio">
                                <h4>About</h4>
                                <p>{profile.bio}</p>
                            </div>
                        )}

                    </div>
                ) : (
                    <div className="profile-error">Failed to load profile</div>
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
    onEditMessage,
    onDeleteMessage,
    onTyping,
    onLeave,
    onSearchAgain,
    onInitiateCall,
    callOverlayStatus,
    matchingStats,
    onAddFriend,
    authedFetch,
}) {
    const [input, setInput] = useState('')
    const [showEmoji, setShowEmoji] = useState(false)
    const [showGif, setShowGif] = useState(false)
    const [showProfile, setShowProfile] = useState(null) // null or userId
    const [uploading, setUploading] = useState(false)
    const [replyingTo, setReplyingTo] = useState(null)
    const [vanishMode, setVanishMode] = useState(false)
    const [friendRequested, setFriendRequested] = useState(false)
    const [showDoodle, setShowDoodle] = useState(false)

    useEffect(() => {
        setFriendRequested(false)
    }, [room?.partner?.id])

    const fileInputRef = useRef(null)
    const messagesAreaRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const lastReadSentRef = useRef(null)

    const isMatched = socketState.phase === 'matched'
    const isMatching = socketState.phase === 'matching'
    const hasLeft = socketState.phase === 'partner-left'

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

    // Reset read-receipt dedupe marker when room changes
    useEffect(() => {
        lastReadSentRef.current = null
    }, [room?.roomId, room?.id])

    // Emit read receipt
    useEffect(() => {
        const lastMsg = chatMessages[chatMessages.length - 1]
        const targetRoomId = room?.roomId || room?.id

        if (!lastMsg || !targetRoomId || !socketState.socket) return
        if (lastMsg.fromUserId === session?.user?.id) return
        if (lastReadSentRef.current === lastMsg.id) return

        socketState.socket.emit('random:read', {
            roomId: targetRoomId,
            messageId: lastMsg.id
        })
        lastReadSentRef.current = lastMsg.id
    }, [chatMessages, room?.roomId, room?.id, session?.user?.id, socketState.socket])

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

        onSendMessage(trimmed, replyingTo?.id, vanishMode)
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
        if (!file || !(room?.roomId || room?.id)) return

        setUploading(true)
        const formData = new FormData()
        formData.append('media', file)
        formData.append('roomId', room.roomId || room.id) // Ensure roomId is passed for tracking

        try {
            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
            const res = await authedFetch(`${BACKEND_URL}/api/v1/messages/upload`, {
                method: 'POST',
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
        <div className={`chat-shell-v2 phase-${socketState.phase} ${vanishMode ? 'vanish-active' : ''}`}>
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
                            {isMatching ? 'SYNCING IDENTITY...' : (room?.partner?.name || 'Stranger')}
                            {isMatched && room?.partner?.auraPoints !== undefined && (
                                <span
                                    className="partner-aura-badge"
                                    title={`Aura: ${calculateAuraLevel(room.partner.auraPoints).name}`}
                                    style={{ color: calculateAuraLevel(room.partner.auraPoints).color }}
                                >
                                    ✧
                                </span>
                            )}
                        </span>
                        <span className={`chat-partner-status${isMatched ? ' live' : ''}`}>
                            {isMatching
                                ? 'Protocols established...'
                                : isMatched
                                    ? 'Quantum Link Active'
                                    : 'Circuit broken'}
                        </span>
                        {isMatched && room?.topic && (
                            <span className="chat-shared-topic">
                                Shared interest: {room.topic}
                            </span>
                        )}

                    </div>
                </div>
                <div className="chat-header-right">
                    {isMatched && (
                        <button
                            className={`fc-vanish-toggle ${vanishMode ? 'active' : ''}`}
                            onClick={() => setVanishMode(!vanishMode)}
                            title="Vanish Mode (Messages disappear in 10s)"
                        >
                            <span className="fc-vanish-icon">✨</span>
                            <span className="fc-vanish-label">Vanish</span>
                        </button>
                    )}
                    {isMatched && callOverlayStatus === 'idle' && (
                        <button className="video-request-btn" onClick={onInitiateCall}>
                            🎥 Switch to Video
                        </button>
                    )}
                    {isMatched && callOverlayStatus === 'requesting' && (
                        <span className="video-request-status">Calling...</span>
                    )}

                    {(isMatched || hasLeft) && (
                        <button className="chat-next-btn" onClick={() => { setFriendRequested(false); onSearchAgain(); }}>
                            Next partner ⏭
                        </button>
                    )}

                    {isMatched && (
                        <button
                            className={`chat-add-friend-btn ${friendRequested ? 'requested' : ''}`}
                            onClick={async () => {
                                if (friendRequested || !room?.partner?.id) return;
                                try {
                                    await onAddFriend(room.partner.id);
                                    setFriendRequested(true);
                                } catch (err) {
                                    alert(err.message);
                                }
                            }}
                            disabled={friendRequested}
                        >
                            {friendRequested ? '✓ Request Sent' : '✚ Add Friend'}
                        </button>
                    )}

                    <div className={`chat-conn-dot${isMatched ? ' live' : ''}`} />
                    <button className="chat-leave-btn" type="button" onClick={onLeave}>
                        Leave room ⎋
                    </button>
                </div>
            </div>

            {/* Messages area */}

            {/* Video Portals (Active Call) - REMOVED, now globally in CallOverlay */}

            {/* Messages area */}
            <div className="chat-messages-area" ref={messagesAreaRef}>
                {isMatching && (
                    <div className="chat-waiting">
                        <div className="radar-container">
                            <div className="radar-circle circle-1" />
                            <div className="radar-circle circle-2" />
                            <div className="radar-circle circle-3" />
                            <div className="radar-avatar">
                                {session?.user?.profilePictureUrl ? (
                                    <img src={session.user.profilePictureUrl} alt="You" />
                                ) : (
                                    <span>{session?.user?.name?.[0]?.toUpperCase() || 'Y'}</span>
                                )}
                            </div>
                        </div>

                        <div className="matching-insight">
                            <h3 className="matching-insight-title">Searching the mist...</h3>
                            <p className="chat-waiting-text">
                                We&apos;re looking for a partner who matches your vibe.
                            </p>

                            <div className="matching-stats-grid">
                                <div className="stat-card">
                                    <span className="stat-value">{matchingStats?.online || 0}</span>
                                    <span className="stat-label">Present</span>
                                </div>
                                <div className="stat-card highlight">
                                    <span className="stat-value">{matchingStats?.inQueue || 0}</span>
                                    <span className="stat-label">In Queue</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-value">{matchingStats?.matched || 0}</span>
                                    <span className="stat-label">Busy</span>
                                </div>
                            </div>

                        </div>
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
                                onEditMessage={onEditMessage}
                                onDeleteMessage={onDeleteMessage}
                                inputRef={inputRef}
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
            {
                showEmoji && (
                    <div className="picker-overlay">
                        <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
                    </div>
                )
            }
            {
                showGif && (
                    <div className="picker-overlay">
                        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />
                    </div>
                )
            }

            {/* Profile Modal */}
            {
                showProfile && (
                    <ProfileModal
                        partnerId={showProfile}
                        session={session}
                        onClose={() => setShowProfile(null)}
                    />
                )
            }

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
                            title="Emoji Picker"
                            onClick={() => { setShowEmoji((v) => !v); setShowGif(false) }}
                            disabled={!isMatched}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                        </button>
                        <button
                            className={`input-action-btn${showGif ? ' active' : ''}`}
                            type="button"
                            title="Send GIF"
                            onClick={() => { setShowGif((v) => !v); setShowEmoji(false) }}
                            disabled={!isMatched}
                        >
                            <span style={{ fontSize: '0.7rem', fontWeight: 900 }}>GIF</span>
                        </button>
                        <button
                            className="input-action-btn"
                            type="button"
                            title="Share Media"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!isMatched || uploading}
                        >
                            {uploading ? (
                                <span className="upload-spinner" />
                            ) : (
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
                            onChange={handleImageUpload}
                        />
                        <button
                            className={`input-action-btn${showDoodle ? ' active' : ''}`}
                            type="button"
                            title="Open Scratch Pad"
                            onClick={() => setShowDoodle(!showDoodle)}
                            disabled={!isMatched}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
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

            {/* Doodle Board Overlay */}
            {showDoodle && isMatched && (
                <DoodleBoard
                    socket={socketState.socket}
                    roomId={room?.roomId || room?.id}
                    onClose={() => setShowDoodle(false)}
                />
            )}
        </div >
    )
}
