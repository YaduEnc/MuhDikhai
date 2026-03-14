import { useEffect, useRef, useState } from 'react'
import GhostProtocol from './GhostProtocol'
import './Landing.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

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
