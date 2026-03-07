import { useState, useEffect, useRef, useCallback } from 'react'
import './FriendChat.css'

export default function FriendChat({ session, friend, onBack, socket }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [partnerTyping, setPartnerTyping] = useState(false)
    const scrollRef = useRef(null)

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

    const fetchHistory = useCallback(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/v1/messages/conversation/${friend.user.id}`, {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`
                }
            })
            const json = await response.json()
            if (json.success) {
                // Reverse because backend returns newest first
                setMessages(json.data.messages.reverse())
            }
        } catch (error) {
            console.error('Failed to fetch chat history:', error)
        } finally {
            setLoading(false)
        }
    }, [BACKEND_URL, friend.user.id, session.accessToken])

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
    }, [messages])

    const handleSend = (e) => {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || !socket) return

        // Note: In a real app we'd encrypt here. For now, following current socket.ts logic:
        // It expects { recipientId, encryptedContent (base64), encryptedKey (base64), messageType }
        // We'll send it "plain" base64 as a placeholder for full E2EE implementation
        socket.emit('message:send', {
            recipientId: friend.user.id,
            encryptedContent: btoa(trimmed),
            encryptedKey: btoa('placeholder-key'),
            messageType: 'text'
        })

        setInput('')
        socket.emit('typing:stop', { recipientId: friend.user.id })
    }

    const handleInputChange = (e) => {
        setInput(e.target.value)
        if (socket) {
            socket.emit('typing:start', { recipientId: friend.user.id })
        }
    }

    return (
        <div className="friend-chat-shell">
            <header className="friend-chat-header">
                <button className="back-btn" onClick={onBack}>←</button>
                <div className="friend-chat-user">
                    <div className="friend-chat-avatar">
                        {friend.user.profilePictureUrl ? (
                            <img src={friend.user.profilePictureUrl} alt="avatar" />
                        ) : (
                            <span>{friend.user.name[0]}</span>
                        )}
                    </div>
                    <div className="friend-chat-info">
                        <span className="friend-chat-name">{friend.user.name}</span>
                        <span className="friend-chat-status">
                            {partnerTyping ? 'typing...' : 'Friend'}
                        </span>
                    </div>
                </div>
                <button className="call-btn" title="Start Video Call">📞</button>
            </header>

            <main className="friend-chat-messages">
                {loading ? (
                    <div className="chat-loading">Restoring conversation...</div>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`chat-bubble ${m.senderId === session.user.id ? 'mine' : 'theirs'}`}>
                            {/* Note: Real app would decrypt m.encryptedContent here */}
                            <div className="bubble-text">
                                {m.senderId === session.user.id ? atob(m.encryptedContent) : (m.encryptedContent ? atob(m.encryptedContent) : 'Message hidden')}
                            </div>
                            <div className="bubble-meta">
                                {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))
                )}
                <div ref={scrollRef} />
            </main>

            <form className="friend-chat-input-area" onSubmit={handleSend}>
                <input
                    type="text"
                    placeholder="Message..."
                    value={input}
                    onChange={handleInputChange}
                    autoFocus
                />
                <button type="submit" disabled={!input.trim()}>Send</button>
            </form>
        </div>
    )
}
