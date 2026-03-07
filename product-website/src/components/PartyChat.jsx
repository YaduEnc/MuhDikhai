import { useState, useRef, useEffect } from 'react'
import { calculateAuraLevel } from '../utils/aura'
import { useGroupWebRTC } from '../hooks/useGroupWebRTC'
import './Chat.css'

export default function PartyChat({ session, party, messages, socket, onLeave, onKick, onRespondRequest }) {
    const [input, setInput] = useState('')
    const messagesEndRef = useRef(null)
    const isHost = party?.hostId === session?.user?.id

    const { remoteStreams, isMuted, toggleMute } = useGroupWebRTC(
        socket,
        party?.id,
        session?.user?.id,
        party?.members
    );

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSend = (e) => {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || !party) return
        socket?.emit('party:message', { partyId: party.id, content: trimmed })
        setInput('')
    }

    if (!party) return null;

    return (
        <div className="chat-container">
            <div className="chat-header" style={{ justifyContent: 'space-between', padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="chat-header-title">{party.name}</span>
                    <span className="chat-header-sub" style={{ opacity: 0.6 }}>
                        Host: {party.hostName} • {party.members.length}/{party.capacity} joined
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        className={`chat-leave-btn ${isMuted ? 'danger' : ''}`}
                        type="button"
                        onClick={toggleMute}
                        style={{ padding: '0.4rem 1rem', background: isMuted ? 'rgba(255, 69, 58, 0.1)' : 'rgba(48, 209, 88, 0.1)', color: isMuted ? '#ff453a' : '#30d158', border: `1px solid ${isMuted ? '#ff453a' : '#30d158'}` }}
                    >
                        {isMuted ? 'Mic Off 🔇' : 'Mic On 🎤'}
                    </button>
                    <button className="chat-leave-btn danger" type="button" onClick={onLeave}>
                        Leave Party
                    </button>
                </div>
            </div>

            {/* Hidden Audio Elements for Remote Streams */}
            {Object.entries(remoteStreams).map(([userId, stream]) => (
                <AudioPlayer key={userId} stream={stream} />
            ))}

            <div className="chat-body" style={{ display: 'flex', flexDirection: 'row', padding: 0, gap: 0, height: '100%' }}>
                {/* Main Chat Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflowY: 'auto' }}>
                    <div className="chat-messages" style={{ flex: 1 }}>
                        <div className="system-msg" style={{ textAlign: 'center', marginBottom: '1rem', color: '#8e8e93', fontSize: '0.9rem' }}>
                            Welcome to <strong>{party.name}</strong>. Keep the vibes gentle.
                        </div>
                        {messages.map((m) => {
                            const isMe = m.fromUserId === session?.user?.id
                            return (
                                <div key={m.id} className={`chat-msg ${isMe ? 'chat-msg-me' : 'chat-msg-them'}`} style={{ marginBottom: '1rem' }}>
                                    {!isMe && (
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                                            {m.fromProfilePictureUrl ? (
                                                <img src={m.fromProfilePictureUrl} alt="avatar" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                                            ) : (
                                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                                    {m.fromName?.[0]?.toUpperCase()}
                                                </div>
                                            )}
                                            <span style={{ fontSize: '0.8rem', color: '#8e8e93' }}>{m.fromName} {m.fromUserId === party.hostId && '👑'}</span>
                                        </div>
                                    )}
                                    <div className="chat-bubble" style={{ background: isMe ? '#30d158' : '#2c2c2e', color: isMe ? '#000' : '#fff' }}>
                                        {m.content}
                                    </div>
                                    <span className="chat-meta" style={{ textAlign: isMe ? 'right' : 'left' }}>
                                        {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="chat-input-area" onSubmit={handleSend} style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="chat-input-wrap">
                            <input
                                className="chat-input"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="Message the party..."
                                maxLength={500}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="chat-send-btn" disabled={!input.trim()}>
                            <span className="chat-send-icon">↑</span>
                        </button>
                    </form>
                </div>

                {/* Right Sidebar: Members & Requests */}
                <div style={{ width: '280px', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Party Members ({party.members.length})
                        </h4>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {party.members.map(member => (
                            <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                    {member.profilePictureUrl ? (
                                        <img src={member.profilePictureUrl} alt="av" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                    ) : (
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {member.name?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                            {member.name} {member.id === party.hostId && '👑'}
                                            {member.id === session?.user?.id && ' (You)'}
                                        </span>
                                        {member.auraPoints !== undefined && (
                                            <span style={{ fontSize: '0.75rem', color: calculateAuraLevel(member.auraPoints).color }}>
                                                ✧ {calculateAuraLevel(member.auraPoints).name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isHost && member.id !== session?.user?.id && (
                                    <button
                                        onClick={() => onKick(member.id)}
                                        style={{ background: 'transparent', border: '1px solid #ff453a', color: '#ff453a', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                    >
                                        Kick
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {isHost && party.requests && party.requests.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,159,10,0.1)' }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#ff9f0a', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    Join Requests ({party.requests.length})
                                </h4>
                            </div>
                            <div style={{ overflowY: 'auto', maxHeight: '200px' }}>
                                {party.requests.map(req => (
                                    <div key={req.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {req.name?.[0]?.toUpperCase()}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.9rem' }}>{req.name}</span>
                                                {req.auraPoints !== undefined && (
                                                    <span style={{ fontSize: '0.75rem', color: calculateAuraLevel(req.auraPoints).color }}>
                                                        ✧ {calculateAuraLevel(req.auraPoints).name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => onRespondRequest(req.id, 'accept')}
                                                style={{ flex: 1, background: '#30d158', color: '#000', border: 'none', padding: '6px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => onRespondRequest(req.id, 'decline')}
                                                style={{ flex: 1, background: 'transparent', color: '#ff453a', border: '1px solid #ff453a', padding: '6px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function AudioPlayer({ stream }) {
    const audioRef = useRef(null);

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);

    return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}
