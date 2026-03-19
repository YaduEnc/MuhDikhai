import { useEffect, useRef, useState } from 'react'
import GhostProtocol from './GhostProtocol'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

export default function Landing({ onStartMatch, authLoading, authError, onlineCount }) {
    const [scrolled, setScrolled] = useState(0)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [serverDown, setServerDown] = useState(false)
    const landingRef = useRef(null)

    // Simplified Landing - Rely on App.jsx for connectivity status

    // Parallax effect for orbs
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY)
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // Mouse tracking for orbs
    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 40,
                y: (e.clientY / window.innerHeight - 0.5) * 40
            })
        }
        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    // Scroll reveal logic
    useEffect(() => {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible')
                }
            })
        }, observerOptions)

        const revealElements = document.querySelectorAll('.reveal-on-scroll')
        revealElements.forEach(el => observer.observe(el))

        return () => observer.disconnect()
    }, [])

    return (
        <div className="landing-wrapper" ref={landingRef}>

            {/* Ambient Background Orbs */}
            <div className="aura-container">
                <div
                    className="aura-orb aura-orb--1"
                    style={{
                        transform: `translate3d(${mousePos.x * 2.5}px, ${scrolled * 0.3 + mousePos.y * 2.5}px, 0)`
                    }}
                />
                <div
                    className="aura-orb aura-orb--2"
                    style={{
                        transform: `translate3d(${mousePos.x * -1}px, ${scrolled * -0.1 + mousePos.y * -1}px, 0)`
                    }}
                />
                <div
                    className="aura-orb aura-orb--3"
                    style={{
                        transform: `translate3d(${mousePos.x * 0.8}px, ${scrolled * 0.15 + mousePos.y * 0.8}px, 0)`
                    }}
                />
            </div>

            <section className="landing-hero">
                <div className="landing-content">
                    <div className="quiet-pulse">
                        <span className="pulse-dot" />
                        <span className="pulse-text">{onlineCount || 0} log abhi online hain. Kisse miloge?</span>
                    </div>
                    <h1 className="hero-heading">
                        <span className="heading-bold">Muhdikhai.</span>
                        <span className="heading-tender">Join the Chaos.</span>
                    </h1>
                    <p className="hero-subtext">A beautifully curated random chat experience. No noise, just strangers.</p>
                    {authError && <p className="auth-error">{authError}</p>}
                    <button
                        className="btn-primary landing-btn"
                        onClick={onStartMatch}
                        disabled={authLoading}
                    >
                        <span className="btn-primary-dot" />
                        {authLoading ? 'Getting you in…' : 'Start the Magic 🔥'}
                    </button>
                    
                    <a 
                        href="https://chat.whatsapp.com/IhbRhUPtxC5FlHJyUlPEDB" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="landing-secondary-link"
                    >
                        <svg className="wa-icon-small" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.55 4.197 1.592 6.02L0 24l6.149-1.613a11.758 11.758 0 005.9 1.594h.005c6.634 0 12.05-5.414 12.05-12.05 0-3.217-1.252-6.242-3.525-8.514z"/>
                        </svg>
                        <span>Join Discord & Status Group</span>
                    </a>
                    <div className="hero-scroll-hint">
                        <span className="hint-arrow" />
                        <span className="hint-text">Neeche kya hai?</span>
                    </div>
                </div>
            </section>

            <section className="pillars reveal-on-scroll">
                <div className="pillars-header">
                    <h2 className="pillars-title">Kyu aaye ho yahan?</h2>
                    <p className="pillars-sub">
                        Because swiping is boring and algorithms are dead. We just throw you in a room with a complete stranger and see what happens.
                    </p>
                </div>

                <div className="pillar-grid">
                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">💥</div>
                        <h3 className="pillar-heading">Zero Filter</h3>
                        <p className="pillar-copy">
                            Say what you want, be who you want.
                        </p>
                        <ul className="pillar-list">
                            <li>Loud aesthetics, vibrant colors.</li>
                            <li>Your Aura points decide your reputation.</li>
                            <li>Trolls get thrown in the Troll Pool.</li>
                        </ul>
                    </article>

                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">🌪️</div>
                        <h3 className="pillar-heading">Gayi Bhains Paani Mein</h3>
                        <p className="pillar-copy">
                            Once you leave the room, everything vanishes. No logs. No history.
                        </p>
                        <ul className="pillar-list">
                            <li>Server-side shredding on exit.</li>
                            <li>Messages vanish if you want them to.</li>
                            <li>Purely anonymous chaos.</li>
                        </ul>
                    </article>

                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">👑</div>
                        <h3 className="pillar-heading">Built for India</h3>
                        <p className="pillar-copy">
                            Desi vibes, low-latency matching, and the power to judge.
                        </p>
                        <ul className="pillar-list">
                            <li>Vote people's Aura up or down.</li>
                            <li>Find your vibe with interest tags.</li>
                            <li>Built for late-night unfiltered talks.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <GhostProtocol />

            <section className="story-grid">
                <article className="story-block reveal-on-scroll border-vibrant">
                    <h2 className="story-heading text-gradient">The Anti-Algorithm Club</h2>
                    <p className="story-text">
                        Bored of reels? Tired of swiping? Muhdikhai is the ultimate wildcard. We connect you with a random stranger in milliseconds.
                        It could be a deep philosophical debate, an intense roasting session, or your next best friend.
                    </p>
                    <p className="story-text">
                        No AI matching, no premium subscriptions to see who liked you. You get a room, you get a stranger, and you make it whatever you want.
                    </p>
                    <p className="story-note font-bold">
                        Welcome to the new era of chat.
                    </p>
                </article>

                <article className="story-block story-block--secondary reveal-on-scroll">
                    <h3 className="story-heading-sm">Built for the Connection</h3>
                    <p className="story-text">
                        Don't let the chaos fool you. Underneath, this is a highly optimized, encrypted real-time beast.
                    </p>
                    <ul className="story-list list-loud">
                        <li>Sub-50ms Socket.io routing powered by Redis.</li>
                        <li>End-to-end encrypted messaging. Always.</li>
                        <li>Automated shadow-banning for toxic users.</li>
                    </ul>
                </article>
            </section>

            <section className="cta-band reveal-on-scroll cta-band-neon">
                <div className="cta-copy">
                    <span className="cta-title">Andar aana hai?</span>
                    <span className="cta-sub">
                        Warning: Highly addictive. Don't blame us if you're up till 4 AM.
                    </span>
                </div>
                <button
                    className="cta-link cta-link-loud"
                    type="button"
                    onClick={onStartMatch}
                    disabled={authLoading}
                >
                    <span style={{ fontSize: '1.2rem' }}>🚪</span>
                    <span>Enter The Madness</span>
                    <span>→</span>
                </button>
            </section>

            <section className="faq reveal-on-scroll">
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
        </div>
    )
}
