import { useEffect, useState, useRef } from 'react'
import './App.css'
import { getStoredSession, signInWithGoogle, clearSession, saveSession, refreshSession } from './authClient'
import { io } from 'socket.io-client'
import Home from './Home'
import Chat from './Chat'
import Onboarding from './Onboarding'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [socketState, setSocketState] = useState({
    status: 'disconnected',
    phase: 'idle',
  })
  const [room, setRoom] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [onlineCount, setOnlineCount] = useState(1)
  const socketRef = useRef(null)

  useEffect(() => {
    const existing = getStoredSession()
    if (existing) {
      setSession(existing)
    }
  }, [])

  useEffect(() => {
    if (!session?.accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      return
    }

    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      auth: { token: session.accessToken },
    })

    socket.on('connect', () => {
      setSocketState((prev) => ({ ...prev, status: 'connected' }))
    })

    socket.on('presence:count', (payload) => {
      setOnlineCount(payload.count)
    })

    socket.on('random:waiting', () => {
      setSocketState({ status: 'connected', phase: 'matching' })
    })

    socket.on('random:matched', (payload) => {
      setRoom({
        roomId: payload.roomId,
        partner: payload.partner,
      })
      setChatMessages([])
      setSocketState({ status: 'connected', phase: 'matched' })
    })

    socket.on('random:message', (msg) => {
      setChatMessages((prev) => [...prev, msg])
    })

    socket.on('random:read', (payload) => {
      setChatMessages((prev) =>
        prev.map(m => m.id === payload.messageId ? { ...m, read: true } : m)
      )
    })

    socket.on('random:left', () => {
      setSocketState((prev) => ({ ...prev, phase: 'partner-left' }))
      setPartnerTyping(false)
    })

    socket.on('random:error', (payload) => {
      setAuthError(payload?.error || 'Random chat error')
    })

    // Typing indicators
    socket.on('typing:start', () => setPartnerTyping(true))
    socket.on('typing:stop', () => setPartnerTyping(false))

    socket.on('disconnect', () => {
      setSocketState({ status: 'disconnected', phase: 'idle' })
      setPartnerTyping(false)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (showChat && socketRef.current) {
      setSocketState({ status: 'connected', phase: 'matching' })
      setRoom(null)
      setChatMessages([])
      socketRef.current.emit('random:join')
    }
  }, [showChat])

  const handleSendMessage = (content) => {
    if (!room?.roomId || !socketRef.current) return
    socketRef.current.emit('random:message', { roomId: room.roomId, content })
  }

  const handleTyping = (isTyping) => {
    if (!room?.roomId || !socketRef.current) return
    socketRef.current.emit(isTyping ? 'typing:start' : 'typing:stop', {
      recipientId: room?.partner?.id,
      roomId: room?.roomId // Add roomId for context if needed
    })
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
    if (socketRef.current) {
      socketRef.current.emit('random:leave')
    }
    clearSession()
    setSession(null)
    setShowChat(false)
    setRoom(null)
    setSocketState({ status: 'connected', phase: 'idle' })
  }

  const handleLeaveChat = () => {
    if (socketRef.current) {
      socketRef.current.emit('random:leave')
    }
    setShowChat(false)
    setRoom(null)
    setSocketState({ status: 'connected', phase: 'idle' })
  }

  const handleUpdateProfile = async (data) => {
    if (!session?.accessToken) return;

    try {
      let res = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (res.status === 401 && session.refreshToken) {
        try {
          const next = await refreshSession(session.refreshToken);
          setSession(next);
          res = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${next.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });
        } catch (err) {
          handleSignOut();
          return;
        }
      }

      const json = await res.json();
      if (json.success) {
        const nextSession = {
          ...session,
          user: {
            ...session.user,
            ...json.data.user,
            // Map backend profilePictureUrl to frontend photoURL for consistency
            photoURL: json.data.user.profilePictureUrl || session.user.photoURL
          }
        };
        setSession(nextSession);
        saveSession(nextSession);
      } else {
        throw new Error(json.error?.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  }

  const handleUploadAvatar = async (file) => {
    if (!session?.accessToken) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      let res = await fetch(`${BACKEND_URL}/api/v1/users/me/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
        body: formData,
      });

      if (res.status === 401 && session.refreshToken) {
        try {
          const next = await refreshSession(session.refreshToken);
          setSession(next);
          res = await fetch(`${BACKEND_URL}/api/v1/users/me/avatar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${next.accessToken}`,
            },
            body: formData,
          });
        } catch (err) {
          handleSignOut();
          throw err;
        }
      }

      const json = await res.json();
      if (json.success) {
        return json.data.url;
      } else {
        throw new Error(json.error?.message || 'Failed to upload photo');
      }
    } catch (error) {
      console.error('Photo upload failed:', error);
      throw error;
    }
  }

  const handleDeleteAccount = async () => {
    if (!session?.accessToken) return;

    try {
      let res = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      });

      if (res.status === 401 && session.refreshToken) {
        // try to refresh
        try {
          const next = await refreshSession(session.refreshToken);
          setSession(next);
          // retry
          res = await fetch(`${BACKEND_URL}/api/v1/users/me`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${next.accessToken}`,
            },
          });
        } catch (err) {
          // refresh failed - logout
          handleSignOut();
          return;
        }
      }

      const json = await res.json();
      if (json.success) {
        handleSignOut();
      } else {
        throw new Error(json.error?.message || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Account deletion failed:', error);
      throw error;
    }
  }

  const isSignedIn = Boolean(session?.user)
  const isHome = Boolean(isSignedIn && !showChat && session.user.gender)
  const isInChat = Boolean(showChat && isSignedIn && session.user.gender)
  const needsOnboarding = Boolean(isSignedIn && !session.user.gender)

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-left">
          <div className="nav-mark">
            <span className="nav-mark-dot" />
          </div>
          <div className="nav-title">
            <span className="brand-word">Muhdikhai</span>
            <span className="brand-sub">
              {isInChat
                ? 'You are in a gentle room'
                : isHome
                  ? 'Your quiet room key is ready'
                  : 'A softer way to meet strangers'}
            </span>
          </div>
        </div>

        <div className="nav-right">
          {isSignedIn && (
            <div className="nav-chip">
              <span className="nav-dot" />
              <span>
                Signed in as <strong>{session.user.name || session.user.email}</strong>
              </span>
            </div>
          )}
          <button
            className="nav-cta"
            type="button"
            onClick={
              isInChat
                ? () => setShowChat(false)
                : isHome
                  ? handleSignOut
                  : handleAuth
            }
            disabled={authLoading}
          >
            <span>
              {isInChat ? 'Leave room' : isHome ? 'Leave quietly' : 'Open playground'}
            </span>
            <span className="nav-cta-arrow">
              {isInChat ? '⌂' : isHome ? '⎋' : '↗'}
            </span>
          </button>
        </div>
      </header>

      <main>
        {/* ── Signed-in Home dashboard ─────────────────── */}
        {isHome && (
          <Home
            session={session}
            onlineCount={onlineCount}
            onStartMatch={() => setShowChat(true)}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onUploadAvatar={handleUploadAvatar}
          />
        )}

        {/* ── Onboarding flow ─────────────────── */}
        {needsOnboarding && (
          <Onboarding
            session={session}
            onComplete={(updatedUser) => {
              const nextSession = { ...session, user: updatedUser }
              setSession(nextSession)
              saveSession(nextSession)
            }}
          />
        )}

        {/* ── Landing page (signed-out) ─────────────────── */}
        {!isSignedIn && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="tagline">
                  <span className="tagline-pill">new</span>
                  <span className="tagline-text">Random chat, without the chaos</span>
                </div>

                <h1 className="hero-heading">
                  Anonymous, but
                  <br />
                  <span>unexpectedly tender.</span>
                </h1>

                <p className="hero-subtitle">
                  <strong>Muhdikhai</strong> pairs you with a single stranger at a time&mdash;no
                  feeds, no likes, no performance. Just a quiet room, one link, and a moment to
                  see and be seen.
                </p>

                <div className="hero-actions">
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={handleAuth}
                    disabled={authLoading}
                  >
                    <span className="btn-primary-dot" />
                    <span>{authLoading ? 'Connecting…' : 'Start a gentle match'}</span>
                  </button>
                  <button className="btn-secondary" type="button">
                    <span className="btn-secondary-icon">◎</span>
                    <span>Watch a 30‑second walkthrough</span>
                  </button>
                </div>

                {authError && (
                  <p className="auth-error">We couldn&apos;t sign you in: {authError}</p>
                )}

                <div className="hero-meta">
                  <div className="meta-item">
                    <span className="meta-label">No accounts</span>
                    <span className="meta-value">Just a link you can close any time.</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">No recordings</span>
                    <span className="meta-value">Encrypted in transit, forgotten on exit.</span>
                  </div>
                </div>
              </div>

              <aside className="hero-panel">
                <div className="panel-header">
                  <span className="panel-title">A room called &ldquo;muhdikhai&rdquo;</span>
                  <span className="panel-chip">demo state</span>
                </div>

                <div className="panel-grid">
                  <div className="panel-card">
                    <span className="panel-card-label">Your side</span>
                    <div className="panel-bubble">
                      <div className="panel-bubble-tagline">You</div>
                      I haven&apos;t done this before. Just here to listen and maybe laugh a
                      little.
                    </div>
                    <div className="pill-row">
                      <span className="pill strong">Camera optional</span>
                      <span className="pill">Blurred preview</span>
                      <span className="pill">Soft‑spoken mode</span>
                    </div>
                  </div>

                  <div className="panel-card">
                    <span className="panel-card-label">How a match unfolds</span>
                    <div className="panel-steps">
                      <div className="step">
                        <span className="step-index">1</span>
                        <div className="step-body">
                          You tap <strong>Start a gentle match</strong>. We place you in a
                          quiet queue, not a noisy lobby.
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-index">2</span>
                        <div className="step-body">
                          When someone compatible arrives, the room lights up. You both see a
                          muted, softly blurred preview first.
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-index">3</span>
                        <div className="step-body">
                          Either of you can step away with a single key. No history, no
                          pressure, just a fading glow in the room list.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </section>

            <section className="highlight-row">
              <div className="highlight-card">
                <h2 className="highlight-title">Designed for soft encounters, not swipes</h2>
                <p className="highlight-text">
                  We lean into small details: eased transitions, breathable spacing, and
                  typography that doesn&apos;t shout. Muhdikhai feels more like entering a
                  listening room than joining a feed.
                </p>
                <div className="highlight-metrics">
                  <div className="metric">
                    <span className="metric-value">1&nbsp;room</span>
                    <span className="metric-label">per person at a time</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">0&nbsp;profiles</span>
                    <span className="metric-label">no bios, no handles</span>
                  </div>
                </div>
              </div>

              <div className="highlight-panel">
                <div className="bubble-row">
                  <span className="tiny-bubble danger">No screenshots indicator</span>
                  <span className="tiny-bubble">One‑tap fade to audio only</span>
                  <span className="tiny-bubble">Customisable lighting for your frame</span>
                </div>
                <p className="grid-tagline">
                  Built on a <strong>secure realtime backend</strong> with end‑to‑end
                  encryption. The glow is real; the trail disappears when you leave.
                </p>
              </div>
            </section>

            <section className="pillars">
              <div className="pillars-header">
                <h2 className="pillars-title">Three small promises from Muhdikhai</h2>
                <p className="pillars-sub">
                  We&apos;re not here to gamify your loneliness. We&apos;re here to host tiny,
                  respectful rooms that feel like late‑night conversations in the kitchen.
                </p>
              </div>
              <div className="pillar-grid">
                <article className="pillar-card">
                  <div className="pillar-icon">Ⅰ</div>
                  <h3 className="pillar-heading">Soft by design</h3>
                  <p className="pillar-copy">
                    No flashing banners, no neon hearts, no dopamine traps. Every surface is
                    tuned down so you can tune in.
                  </p>
                  <ul className="pillar-list">
                    <li>No public likes or follower counts.</li>
                    <li>Gentle gradients instead of red badges.</li>
                    <li>Gestures that feel like exhaling, not chasing.</li>
                  </ul>
                </article>

                <article className="pillar-card">
                  <div className="pillar-icon">Ⅱ</div>
                  <h3 className="pillar-heading">Ephemeral on purpose</h3>
                  <p className="pillar-copy">
                    Rooms are temporary, stories are fleeting. Step out, and the trail fades
                    behind you.
                  </p>
                  <ul className="pillar-list">
                    <li>Sessions end when you close the tab.</li>
                    <li>No public history, no replay screen.</li>
                    <li>Encryption from your device to the other side.</li>
                  </ul>
                </article>

                <article className="pillar-card">
                  <div className="pillar-icon">Ⅲ</div>
                  <h3 className="pillar-heading">Human, not content</h3>
                  <p className="pillar-copy">
                    You&apos;re not an avatar in a grid. You&apos;re a presence for one person at
                    a time&mdash;with room to be unsure, quiet, or silly.
                  </p>
                  <ul className="pillar-list">
                    <li>Pairing logic favours slowness over volume.</li>
                    <li>Soft prompts, not hard onboarding flows.</li>
                    <li>Built for real evenings, not infinite scroll.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section className="story-grid">
              <article className="story-block">
                <h2 className="story-heading">A tiny manifesto for gentle strangers</h2>
                <p className="story-text">
                  There are already places to shout into the void. Muhdikhai is for the nights
                  when you want to talk to exactly one person, with the option to disappear
                  again without a trace.
                </p>
                <p className="story-text">
                  We care about the micro‑moments: the half‑second fade before someone appears,
                  the way the interface breathes when you both go quiet, the reassuring glow of
                  a single status dot.
                </p>
                <p className="story-note">
                  If the UI ever makes you feel rushed, we consider that a bug.
                </p>
              </article>

              <article className="story-block story-block--secondary">
                <h3 className="story-heading-sm">For builders, romantics, and late‑night coders</h3>
                <p className="story-text">
                  Muhdikhai runs on a production‑grade messaging stack with end‑to‑end
                  encryption, built for experiments like yours.
                </p>
                <ul className="story-list">
                  <li>Socket‑powered, low‑latency rooms for pairing strangers.</li>
                  <li>Typed APIs for messages, presence, and ephemeral sessions.</li>
                  <li>Bring your own brand, keep our gentle defaults.</li>
                </ul>
                <p className="story-text">
                  Use our hosted preview, or self‑host on the PlasticWorld backend and tune the
                  vibe to your community.
                </p>
              </article>
            </section>

            <section className="cta-band">
              <div className="cta-copy">
                <span className="cta-title">Ready to see who appears?</span>
                <span className="cta-sub">
                  Spin up a private Muhdikhai room on your own server in minutes, or join the
                  hosted preview.
                </span>
              </div>
              <button
                className="cta-link"
                type="button"
                onClick={handleAuth}
                disabled={authLoading}
              >
                <span>Get early access link</span>
                <span>↗</span>
              </button>
            </section>

            <section className="faq">
              <div className="faq-inner">
                <h2 className="faq-title">Questions you might ask at 2:13&nbsp;AM</h2>
                <p className="faq-intro">
                  A few honest answers, before you decide to step into a room with a stranger.
                </p>
                <div className="faq-grid">
                  <details className="faq-item">
                    <summary>Is this a dating app?</summary>
                    <p>
                      No. Muhdikhai is closer to a listening booth. People show up with all
                      kinds of intentions: to debrief a long day, to talk through an idea, or
                      to just share silence with someone who isn&apos;t a timeline.
                    </p>
                  </details>
                  <details className="faq-item">
                    <summary>Do I need an account or profile?</summary>
                    <p>
                      You don&apos;t. For the hosted version, you join with a single link. For
                      self‑hosting, you decide how much identity you want on top of our core
                      random‑pairing engine.
                    </p>
                  </details>
                  <details className="faq-item">
                    <summary>What happens when I leave a room?</summary>
                    <p>
                      The room winds down. There&apos;s no feed of past encounters, no archive
                      to scroll back through. That&apos;s the whole point: you were there, then
                      you weren&apos;t.
                    </p>
                  </details>
                  <details className="faq-item">
                    <summary>Can I run Muhdikhai on my own stack?</summary>
                    <p>
                      Yes. Under the hood, Muhdikhai speaks to a Node + TypeScript backend with
                      WebSockets, Redis, and PostgreSQL. You can host it yourself and plug in
                      your own auth, rules, and rituals.
                    </p>
                  </details>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ── Chat shell ─────────────────────────────────── */}
        {isInChat && (
          <Chat
            session={session}
            room={room}
            socketState={socketState}
            chatMessages={chatMessages}
            partnerTyping={partnerTyping}
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
            onLeave={handleLeaveChat}
            onSearchAgain={() => {
              setSocketState({ status: 'connected', phase: 'matching' })
              setRoom(null)
              setChatMessages([])
              socketRef.current?.emit('random:join')
            }}
          />
        )}

      </main>

      <footer className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <div className="footer-brand-row">
              <span className="footer-mark" />
              <span className="footer-name">Muhdikhai</span>
            </div>
            <p className="footer-tagline">
              A privacy‑first random chat experiment. No infinite scroll.
              Just one stranger and a softer interface.
            </p>
          </div>

          <div className="footer-groups">
            <div className="footer-group">
              <span className="footer-group-title">Experiment</span>
              <div className="footer-links-v2">
                <span className="footer-link-v2">Changelog</span>
                <span className="footer-link-v2">Principles</span>
                <span className="footer-link-v2">Status</span>
              </div>
            </div>
            <div className="footer-group">
              <span className="footer-group-title">Social</span>
              <div className="footer-links-v2">
                <span className="footer-link-v2">Twitter</span>
                <span className="footer-link-v2">GitHub</span>
                <span className="footer-link-v2">Contact</span>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-credit">
            Developed & Maintained by <span className="dev-name">Yaduraj Singh</span>
          </div>
          <div className="footer-meta-row">
            <span className="footer-pill-v2">Built on PlasticWorld</span>
            <span className="footer-pill-v2">© 2026 Muhdikhai</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
