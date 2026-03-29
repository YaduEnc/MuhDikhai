import { useEffect, useState } from 'react'
import GhostProtocol from './GhostProtocol'

const TRUST_POINTS = [
    { eyebrow: 'Access', title: 'Google sign-in, then a short profile setup', copy: 'The hosted app asks you to sign in and finish a small onboarding flow before you enter the app.' },
    { eyebrow: 'Privacy', title: 'Random rooms are built to disappear', copy: 'There is no endless feed of past stranger chats. The experience is meant to feel immediate, then gone.' },
    { eyebrow: 'Friends', title: 'Keep the good conversations', copy: 'If you want continuity, move the connection into friend chat and continue there with stronger identity and privacy controls.' },
]

const FLOW_STEPS = [
    { step: '01', title: 'Sign in fast', copy: 'Use Google to get inside without typing a long form or creating a bloated profile.' },
    { step: '02', title: 'Shape your presence', copy: 'Pick a name, avatar, and short bio so the room feels human from the first message.' },
    { step: '03', title: 'Match instantly', copy: 'Jump into a stranger room, react, doodle, vanish messages, or leave without residue.' },
    { step: '04', title: 'Keep only the good part', copy: 'If the vibe is real, add them as a friend and continue in the more persistent friend chat layer.' },
]

const FEATURE_PILLS = [
    'Ephemeral stranger rooms',
    'Friend chat with stronger privacy',
    'Doodles, GIFs, reactions, calls',
]

const PREMIUM_PROFILE_FEATURES = [
    'Verified badge on your profile and chat header',
    'Priority visibility in friend requests and Haveli cards',
    'Premium profile theme with cleaner identity card',
]

const FOOTER_COLUMNS = [
    {
        title: 'Experience',
        links: [
            { label: 'Open the room', href: '#top' },
            { label: 'Random chat flow', href: '#how-it-works' },
            { label: 'Friend layer', href: '#why-it-feels-different' },
        ],
    },
    {
        title: 'Trust',
        links: [
            { label: 'Privacy', href: '/privacy' },
            { label: 'Safety', href: '/safety' },
            { label: 'Terms', href: '/terms' },
        ],
    },
    {
        title: 'Community',
        links: [
            { label: 'WhatsApp community', href: 'https://chat.whatsapp.com/IhbRhUPtxC5FlHJyUlPEDB', external: true },
            { label: 'Hosted login flow', href: '#hosted-flow' },
            { label: 'Live room vibe', href: '#footer-vibe' },
        ],
    },
]

function CinematicDivider({ label, title, copy, align = 'left', drift = 0 }) {
    return (
        <div className={`cinematic-divider reveal-on-scroll ${align === 'right' ? 'is-right' : ''}`}>
            <div className="cinematic-divider-line" style={{ transform: `translateX(${drift}px)` }}>
                <span className="cinematic-divider-node cinematic-divider-node--start" />
                <span className="cinematic-divider-track" />
                <span className="cinematic-divider-node cinematic-divider-node--mid" />
                <span className="cinematic-divider-track cinematic-divider-track--short" />
                <span className="cinematic-divider-node cinematic-divider-node--end" />
            </div>
            <div className="cinematic-divider-copy">
                <span className="cinematic-divider-label">{label}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
            </div>
        </div>
    )
}

export default function Landing({ onStartMatch, onUpgradeToPlus, authLoading, premiumLoading, authError, onlineCount }) {
    const [scrolled, setScrolled] = useState(0)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({
                x: (e.clientX / window.innerWidth - 0.5) * 40,
                y: (e.clientY / window.innerHeight - 0.5) * 40,
            })
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible')
                }
            })
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px',
        })

        const revealElements = document.querySelectorAll('.reveal-on-scroll')
        revealElements.forEach((element) => observer.observe(element))

        return () => observer.disconnect()
    }, [])

    return (
        <div className="landing-wrapper" id="top">
            <div className="aura-container">
                <div
                    className="aura-orb aura-orb--1"
                    style={{
                        transform: `translate3d(${mousePos.x * 2.5}px, ${scrolled * 0.3 + mousePos.y * 2.5}px, 0)`,
                    }}
                />
                <div
                    className="aura-orb aura-orb--2"
                    style={{
                        transform: `translate3d(${mousePos.x * -1}px, ${scrolled * -0.1 + mousePos.y * -1}px, 0)`,
                    }}
                />
                <div
                    className="aura-orb aura-orb--3"
                    style={{
                        transform: `translate3d(${mousePos.x * 0.8}px, ${scrolled * 0.15 + mousePos.y * 0.8}px, 0)`,
                    }}
                />
            </div>

            <section className="landing-hero">
                <div className="landing-hero-shell">
                    <div className="landing-content">
                        <div className="quiet-pulse">
                            <span className="pulse-dot" />
                            <span className="pulse-text">{onlineCount || 0} लोग अभी online हैं. Kisse miloge?</span>
                        </div>

                        <div className="hero-eyebrow reveal-inline">
                            Private strangers. Better first impressions.
                        </div>

                        <h1 className="hero-heading">
                            <span className="heading-bold">Muhdikhai.</span>
                            <span className="heading-tender">A random chat experience with actual atmosphere.</span>
                        </h1>

                        <p className="hero-subtext">
                            Sign in with Google, set up a tiny profile, and get dropped into beautifully chaotic rooms built for late-night conversations, fast chemistry, and clean exits.
                        </p>

                        <div className="landing-beta-banner" role="note" aria-live="polite">
                            <div className="landing-beta-banner-head">
                                <span className="landing-beta-badge">BETA</span>
                                <strong>You are one of our first users.</strong>
                            </div>
                            <p>
                                Please read and follow the community rules, be respectful with everyone, and report issues quickly so we can improve before public rollout.
                            </p>
                            <div className="landing-beta-links">
                                <a href="/terms">Terms</a>
                                <a href="/safety">Safety</a>
                                <a href="/privacy">Privacy</a>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (typeof window !== 'undefined' && typeof window.openBugReporter === 'function') {
                                            window.openBugReporter()
                                        }
                                    }}
                                >
                                    Feedback / Bug Report
                                </button>
                            </div>
                        </div>

                        <div className="hero-proof-row">
                            <div className="hero-proof-card">
                                <span className="hero-proof-label">Hosted flow</span>
                                <strong>Google sign-in + short onboarding</strong>
                            </div>
                            <div className="hero-proof-card">
                                <span className="hero-proof-label">Room behavior</span>
                                <strong>Stranger chats are designed to disappear</strong>
                            </div>
                            <div className="hero-proof-card">
                                <span className="hero-proof-label">When it clicks</span>
                                <strong>Move the conversation into friend chat</strong>
                            </div>
                        </div>

                        {authError && <p className="auth-error">{authError}</p>}

                        <div className="hero-actions">
                            <button
                                className="btn-primary landing-btn"
                                onClick={onStartMatch}
                                disabled={authLoading}
                            >
                                <span className="btn-primary-dot" />
                                {authLoading ? 'Getting you in...' : 'Start the Magic'}
                            </button>

                            <a
                                href="https://chat.whatsapp.com/IhbRhUPtxC5FlHJyUlPEDB"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="landing-secondary-link landing-secondary-link--loud"
                            >
                                <svg className="wa-icon-small" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.55 4.197 1.592 6.02L0 24l6.149-1.613a11.758 11.758 0 005.9 1.594h.005c6.634 0 12.05-5.414 12.05-12.05 0-3.217-1.252-6.242-3.525-8.514z" />
                                </svg>
                                <span>Join WhatsApp Community</span>
                            </a>
                        </div>

                        <div className="feature-pill-row">
                            {FEATURE_PILLS.map((pill) => (
                                <span key={pill} className="feature-pill">{pill}</span>
                            ))}
                        </div>

                        <div className="hero-scroll-hint">
                            <span className="hint-arrow" />
                            <span className="hint-text">Scroll for the room vibe</span>
                        </div>
                    </div>

                    <div className="hero-preview reveal-inline">
                        <div className="hero-preview-window">
                            <div className="hero-preview-topbar">
                                <span className="hero-preview-led" />
                                <span className="hero-preview-led hero-preview-led--soft" />
                                <span className="hero-preview-led hero-preview-led--dim" />
                                <div className="hero-preview-status">
                                    <span className="hero-preview-status-label">Live strangers</span>
                                    <strong>{onlineCount || 0}</strong>
                                </div>
                            </div>

                            <div className="hero-preview-stage">
                                <div className="preview-floating-card preview-floating-card--match">
                                    <span className="preview-badge">Queue</span>
                                    <strong>Matching...</strong>
                                    <p>Your room is warming up.</p>
                                </div>

                                <div className="preview-chat-card">
                                    <div className="preview-chat-header">
                                        <div>
                                            <span className="preview-chat-label">Matched room</span>
                                            <h3>Anonymous until it matters</h3>
                                        </div>
                                        <span className="preview-chat-timer">vanish ready</span>
                                    </div>

                                    <div className="preview-chat-thread">
                                        <div className="preview-message preview-message--theirs">
                                            Tum yahan rant karne aaye ho ya dost banane?
                                        </div>
                                        <div className="preview-message preview-message--mine">
                                            Depends. Room achha nikla toh dono.
                                        </div>
                                        <div className="preview-message preview-message--typing">
                                            <span />
                                            <span />
                                            <span />
                                        </div>
                                    </div>

                                    <div className="preview-utility-row">
                                        <span className="preview-utility-chip">GIFs</span>
                                        <span className="preview-utility-chip">Doodle</span>
                                        <span className="preview-utility-chip">Vanish</span>
                                        <span className="preview-utility-chip">Call</span>
                                    </div>
                                </div>

                                <div className="preview-floating-card preview-floating-card--trust">
                                    <span className="preview-badge">Trust</span>
                                    <strong>Short profile, cleaner rooms</strong>
                                    <p>Enough identity to feel human, not enough to feel heavy.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="premium-profile reveal-on-scroll" id="premium-verified">
                <div className="premium-profile-shell">
                    <div className="premium-profile-copy">
                        <span className="premium-profile-eyebrow">Paid Feature • Muhdikhai Plus</span>
                        <h2>Advanced Profile with Verified Badge</h2>
                        <p>
                            Give serious users a stronger presence. The verified badge builds trust faster in first conversations and helps authentic profiles stand out.
                        </p>

                        <ul className="premium-profile-list">
                            {PREMIUM_PROFILE_FEATURES.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>

                        <div className="premium-profile-note">
                            Planned launch: Plus tier with monthly billing.
                        </div>
                        <button
                            type="button"
                            className="premium-profile-cta"
                            onClick={onUpgradeToPlus || onStartMatch}
                            disabled={authLoading || premiumLoading}
                        >
                            {authLoading || premiumLoading ? 'Opening checkout...' : 'Get Plus & Verified Badge'}
                        </button>
                    </div>

                    <div className="premium-profile-preview">
                        <div className="premium-profile-card">
                            <span className="premium-profile-chip">Profile Preview</span>
                            <div className="premium-profile-head">
                                <div className="premium-profile-avatar">YS</div>
                                <div className="premium-profile-meta">
                                    <div className="premium-profile-name-row">
                                        <strong>Yaduraj Singh</strong>
                                        <span className="premium-verified-badge" aria-label="Verified profile">✔ Verified</span>
                                    </div>
                                    <span>@yadurajsingham</span>
                                </div>
                            </div>
                            <p className="premium-profile-bio">
                                Calm energy, clear intent, and no timepass chats.
                            </p>
                            <div className="premium-profile-signals">
                                <span>Trust Boost</span>
                                <span>Premium Identity</span>
                                <span>Higher Response Rate</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="trust-strip reveal-on-scroll">
                {TRUST_POINTS.map((item) => (
                    <article key={item.title} className="trust-card">
                        <span className="trust-eyebrow">{item.eyebrow}</span>
                        <h3 className="trust-title">{item.title}</h3>
                        <p className="trust-copy">{item.copy}</p>
                    </article>
                ))}
            </section>

            <CinematicDivider
                label="Scene Shift"
                title="From trust to entry sequence"
                copy="The next stretch should feel like a room slowly calibrating itself around the user."
                drift={Math.sin(scrolled / 320) * 18}
            />

            <section className="flow-section reveal-on-scroll" id="how-it-works">
                <div className="pillars-header">
                    <h2 className="pillars-title">How the hosted experience actually works</h2>
                    <p className="pillars-sub">
                        No ambiguous promise, no fake frictionless claim. The flow is simple, intentional, and aligned with the product you ship today.
                    </p>
                </div>

                <div className="flow-grid">
                    {FLOW_STEPS.map((item) => (
                        <article key={item.step} className="flow-card">
                            <span className="flow-step">{item.step}</span>
                            <h3 className="flow-title">{item.title}</h3>
                            <p className="flow-copy">{item.copy}</p>
                        </article>
                    ))}
                </div>
            </section>

            <CinematicDivider
                label="Room Tone"
                title="From mechanics to mood"
                copy="Once the flow is understood, the product has to prove why the room feels more charged than a generic chat app."
                align="right"
                drift={Math.cos(scrolled / 360) * -16}
            />

            <section className="pillars reveal-on-scroll" id="why-it-feels-different">
                <div className="pillars-header">
                    <h2 className="pillars-title">What makes the room feel different</h2>
                    <p className="pillars-sub">
                        The point is not just meeting strangers. The point is making the first few seconds feel charged, lightweight, and worth staying for.
                    </p>
                </div>

                <div className="pillar-grid">
                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">✦</div>
                        <h3 className="pillar-heading">Elegant chaos</h3>
                        <p className="pillar-copy">
                            A loud mood with a cleaner frame: richer motion, softer glass, sharper hierarchy, and less visual clutter.
                        </p>
                        <ul className="pillar-list">
                            <li>High-contrast calls to action.</li>
                            <li>Animated proof cards above the fold.</li>
                            <li>Premium chat-preview staging.</li>
                        </ul>
                    </article>

                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">◌</div>
                        <h3 className="pillar-heading">Truth before hype</h3>
                        <p className="pillar-copy">
                            The landing now tells users exactly what happens: sign in, shape your presence, enter a room, leave cleanly or keep the connection.
                        </p>
                        <ul className="pillar-list">
                            <li>No misleading “no account needed” copy.</li>
                            <li>Clear hosted-product expectations.</li>
                            <li>Stronger trust through consistency.</li>
                        </ul>
                    </article>

                    <article className="pillar-card pillar-card-chaotic">
                        <div className="pillar-icon">∞</div>
                        <h3 className="pillar-heading">Momentum after the match</h3>
                        <p className="pillar-copy">
                            Stranger mode stays lightweight, while the friend layer gives the product a better long-tail without diluting the core magic.
                        </p>
                        <ul className="pillar-list">
                            <li>Ephemeral rooms for first contact.</li>
                            <li>Friend chat for continuation.</li>
                            <li>Calls, reactions, doodles, and vanish mode.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <GhostProtocol />

            <CinematicDivider
                label="Signal Layer"
                title="From promise to product aura"
                copy="This is where the landing should feel less like a website and more like the front edge of the actual experience."
                drift={Math.sin(scrolled / 280) * 12}
            />

            <section className="story-grid">
                <article className="story-block reveal-on-scroll border-vibrant">
                    <h2 className="story-heading text-gradient">The Anti-Algorithm Club</h2>
                    <p className="story-text">
                        Muhdikhai is strongest when it feels like a sharp detour from feeds, swipes, and stale social patterns. The new landing leans into that without confusing the user about what the product actually asks from them.
                    </p>
                    <p className="story-text">
                        You are not selling infinite browsing. You are selling an intentional room, a stranger, and a chance encounter with enough polish to feel premium.
                    </p>
                    <p className="story-note font-bold">
                        Better framed. Better trusted. Better entered.
                    </p>
                </article>

                <article className="story-block story-block--secondary reveal-on-scroll">
                    <h3 className="story-heading-sm">What changed in the feel</h3>
                    <p className="story-text">
                        The interface now gives users proof before scroll fatigue kicks in.
                    </p>
                    <ul className="story-list list-loud">
                        <li>Hero now explains the real auth + onboarding flow.</li>
                        <li>Community link accurately points to WhatsApp.</li>
                        <li>Animated preview cards make the product feel tangible immediately.</li>
                    </ul>
                </article>
            </section>

            <CinematicDivider
                label="Final Pull"
                title="From curiosity to commitment"
                copy="The close should not just repeat the CTA. It should gather the whole mood and direct it into action."
                align="right"
                drift={Math.cos(scrolled / 300) * -10}
            />

            <section className="cta-band reveal-on-scroll cta-band-neon">
                <div className="cta-copy">
                    <span className="cta-title">Enter with context, not confusion</span>
                    <span className="cta-sub">
                        Sign in, make a quick profile, and let the room do the rest.
                    </span>
                </div>
                <button
                    className="cta-link cta-link-loud"
                    type="button"
                    onClick={onStartMatch}
                    disabled={authLoading}
                >
                    <span style={{ fontSize: '1.2rem' }}>↗</span>
                    <span>{authLoading ? 'Entering...' : 'Open The Room'}</span>
                    <span>→</span>
                </button>
            </section>

            <section className="faq reveal-on-scroll">
                <div className="faq-inner">
                    <h2 className="faq-title">Questions you might ask before entering</h2>
                    <p className="faq-intro">
                        Short answers, aligned with the actual hosted product.
                    </p>
                    <div className="faq-grid">
                        <details className="faq-item">
                            <summary>Is this a dating app?</summary>
                            <p>
                                No. It is closer to a late-night room for unpredictable conversations. Some chats stay playful, some get deep, some end fast, and that is part of the appeal.
                            </p>
                        </details>
                        <details className="faq-item">
                            <summary>Do I need an account or profile?</summary>
                            <p>
                                For this hosted version, yes. You sign in with Google and complete a short onboarding flow so rooms feel safer and more intentional from the start.
                            </p>
                        </details>
                        <details className="faq-item">
                            <summary>What happens when I leave a room?</summary>
                            <p>
                                Stranger rooms are meant to feel ephemeral. You do not get an endless archive of those encounters, which keeps the experience lighter and more present.
                            </p>
                        </details>
                        <details className="faq-item">
                            <summary>What if I actually like the person?</summary>
                            <p>
                                Then you can move the connection forward instead of losing it. That is where the friend layer matters: it lets a good random encounter become something worth keeping.
                            </p>
                        </details>
                    </div>
                </div>
            </section>

            <footer className="landing-footer reveal-on-scroll" id="footer-vibe">
                <div className="landing-footer-shell">
                    <div className="landing-footer-watermark" aria-hidden="true">Muhdikhai</div>

                    <div className="landing-footer-card" id="hosted-flow">
                        <div className="footer-brand-block">
                            <div className="footer-brand-mark">
                                <span className="footer-brand-glyph">M</span>
                            </div>
                            <div className="footer-brand-copy">
                                <h3>Muhdikhai</h3>
                                <p>
                                    Built for strangers, tuned for atmosphere, and honest about the flow:
                                    sign in, set your presence, enter the room, and keep only what deserves to stay.
                                </p>
                            </div>
                        </div>

                        <div className="footer-signal-row">
                            <span className="footer-signal-chip">Google sign-in</span>
                            <span className="footer-signal-chip">Short onboarding</span>
                            <span className="footer-signal-chip">Ephemeral rooms</span>
                            <span className="footer-signal-chip">{onlineCount || 0} live now</span>
                        </div>

                        <div className="footer-grid">
                            {FOOTER_COLUMNS.map((column) => (
                                <div key={column.title} className="footer-link-group">
                                    <h4>{column.title}</h4>
                                    <ul>
                                        {column.links.map((link) => (
                                            <li key={link.label}>
                                                <a
                                                    href={link.href}
                                                    target={link.external ? '_blank' : undefined}
                                                    rel={link.external ? 'noopener noreferrer' : undefined}
                                                >
                                                    {link.label}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <div className="footer-divider" />

                        <div className="footer-bottom-row">
                            <p>© {new Date().getFullYear()} Muhdikhai. Real people. Pure chaos. Total privacy. Crafted by Yaduraj.</p>
                            <div className="footer-bottom-links">
                                <a href="/privacy">Privacy Policy</a>
                                <a href="/terms">Terms of Service</a>
                                <a href="/safety">Safety</a>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
