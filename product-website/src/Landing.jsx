import { useEffect, useRef, useState } from 'react'
import './Landing.css'

export default function Landing({ onStartMatch, authLoading, authError, onlineCount }) {
    const [scrolled, setScrolled] = useState(0)
    const landingRef = useRef(null)

    // Parallax effect for orbs
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY)
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
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
                    style={{ transform: `translate3d(0, ${scrolled * 0.2}px, 0)` }}
                />
                <div
                    className="aura-orb aura-orb--2"
                    style={{ transform: `translate3d(0, ${scrolled * -0.1}px, 0)` }}
                />
                <div
                    className="aura-orb aura-orb--3"
                    style={{ transform: `translate3d(0, ${scrolled * 0.15}px, 0)` }}
                />
            </div>

            <section className="landing-hero">
                <div className="landing-content">
                    <div className="quiet-pulse">
                        <span className="pulse-dot" />
                        <span className="pulse-text">{onlineCount || 0} sharing silence right now</span>
                    </div>
                    <h1>Anonymous, but unexpectedly tender.</h1>
                    {authError && <p className="auth-error">{authError}</p>}
                    <button
                        className="btn-primary landing-btn"
                        onClick={onStartMatch}
                        disabled={authLoading}
                    >
                        <span className="btn-primary-dot" />
                        {authLoading ? 'Signing in…' : 'Start a gentle match'}
                    </button>
                </div>
            </section>

            <section className="pillars reveal-on-scroll">
                <div className="pillars-header">
                    <h2 className="pillars-title">Better rooms for smaller conversations</h2>
                    <p className="pillars-sub">
                        Most apps want your attention. We just want to give you a moment
                        of genuine connection, without the noise.
                    </p>
                </div>

                <div className="pillar-grid">
                    <article className="pillar-card">
                        <div className="pillar-icon">Ⅰ</div>
                        <h3 className="pillar-heading">Gentle by design</h3>
                        <p className="pillar-copy">
                            Every interaction is tuned for softness. No jarring alerts, no
                            aggressive layout shifts&mdash;just a calm space for your words.
                        </p>
                        <ul className="pillar-list">
                            <li>Glassmorphic, low‑contrast interfaces.</li>
                            <li>Subtle micro‑animations that breathe.</li>
                            <li>A layout that respects your screen.</li>
                        </ul>
                    </article>

                    <article className="pillar-card">
                        <div className="pillar-icon">Ⅱ</div>
                        <h3 className="pillar-heading">Truly ephemeral</h3>
                        <p className="pillar-copy">
                            Once you leave, the room is gone. We don&apos;t store your
                            conversations, we don&apos;t build a profile of your interests.
                        </p>
                        <ul className="pillar-list">
                            <li>Server‑side rooms that shred on exit.</li>
                            <li>No logs, no history, no tracking.</li>
                            <li>Purely anonymous, purely present.</li>
                        </ul>
                    </article>

                    <article className="pillar-card">
                        <div className="pillar-icon">Ⅲ</div>
                        <h3 className="pillar-heading">Human, not content</h3>
                        <p className="pillar-copy">
                            You&apos;re not an avatar in a grid. You&apos;re a presence for one
                            person at a time&mdash;with room to be unsure, quiet, or silly.
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
                <article className="story-block reveal-on-scroll">
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

                <article className="story-block story-block--secondary reveal-on-scroll">
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

            <section className="cta-band reveal-on-scroll">
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
                    onClick={onStartMatch}
                    disabled={authLoading}
                >
                    <span>Get early access link</span>
                    <span>↗</span>
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
