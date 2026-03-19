import { useEffect, useRef, useState } from 'react'

export default function GhostProtocol() {
    const [isActive, setIsActive] = useState(false)
    const [phase, setPhase] = useState('idle') // idle, encrypting, shredding, final
    const sectionRef = useRef(null)
    const particlesRef = useRef([])
    const canvasRef = useRef(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !isActive) {
                    setIsActive(true)
                    startAnimation()
                }
            },
            { threshold: 0.5 }
        )

        if (sectionRef.current) {
            observer.observe(sectionRef.current)
        }

        return () => observer.disconnect()
    }, [isActive])

    const startAnimation = () => {
        // Step 1: Encrypting
        setTimeout(() => setPhase('encrypting'), 1000)
        // Step 2: Shredding
        setTimeout(() => setPhase('shredding'), 3000)
        // Step 3: Final message
        setTimeout(() => setPhase('final'), 5500)
    }

    // Canvas Particle System for the "Ash" effect
    useEffect(() => {
        if (phase !== 'shredding') return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const width = canvas.width = canvas.offsetWidth
        const height = canvas.height = canvas.offsetHeight

        const particles = []
        const particleCount = 150

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: width / 2 + (Math.random() - 0.5) * 300,
                y: height / 2 + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 4 - 1,
                size: Math.random() * 3 + 1,
                alpha: 1,
                color: Math.random() > 0.5 ? '#ff0055' : '#00ffcc'
            })
        }

        let animationFrame
        const render = () => {
            ctx.clearRect(0, 0, width, height)

            particles.forEach((p, i) => {
                p.x += p.vx
                p.y += p.vy
                p.alpha -= 0.005
                p.size *= 0.99

                ctx.globalAlpha = p.alpha
                ctx.fillStyle = p.color
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
                ctx.fill()

                if (p.alpha <= 0) {
                    particles.splice(i, 1)
                }
            })

            if (particles.length > 0) {
                animationFrame = requestAnimationFrame(render)
            }
        }

        render()
        return () => cancelAnimationFrame(animationFrame)
    }, [phase])

    return (
        <section className={`ghost-protocol ${isActive ? 'is-active' : ''}`} ref={sectionRef}>
            <div className="gp-background">
                <div className="gp-grid"></div>
                <div className="gp-vignette"></div>
            </div>

            <div className="gp-container">
                <div className="gp-header">
                    <span className="gp-tag">🔒 GHOST PROTOCOL</span>
                    <h2 className="gp-title">The Art of Disappearing</h2>
                </div>

                <div className="gp-visualizer">
                    <div className={`gp-card ${phase}`}>
                        <div className="gp-card-inner">
                            <div className="gp-message-track">
                                <div className="gp-message-content">
                                    {phase === 'idle' && (
                                        <div className="gp-text-raw anim-fade-in">
                                            "I'll see you tomorrow at 9."
                                        </div>
                                    )}
                                    {phase === 'encrypting' && (
                                        <div className="gp-text-scrambled">
                                            {Array.from({ length: 25 }).map((_, i) => (
                                                <span key={i} className="scramble-char">
                                                    {['X', '0', '1', '!', '@', '#', '$', '%', '&', '*', '?'][Math.floor(Math.random() * 11)]}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {phase === 'shredding' && (
                                        <div className="gp-shredding-mask">
                                            <canvas ref={canvasRef} className="gp-ash-canvas" />
                                        </div>
                                    )}
                                    {phase === 'final' && (
                                        <div className="gp-final-text">
                                            <span className="shredded-glitch">00:00:00</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="gp-scanner"></div>
                    </div>

                    <div className="gp-status-bar">
                        <div className="gp-status-item">
                            <span className="label">Status:</span>
                            <span className={`value ${phase}`}>
                                {phase === 'idle' && 'Plaintext Detected'}
                                {phase === 'encrypting' && 'Applying AES-256...'}
                                {phase === 'shredding' && 'Shredding Room Data...'}
                                {phase === 'final' && 'Forgotten.'}
                            </span>
                        </div>
                        <div className="gp-loading-line">
                            <div className={`gp-progress ${phase}`}></div>
                        </div>
                    </div>
                </div>

                <div className="gp-content">
                    <p className={`gp-copy-lead ${phase === 'final' ? 'reveal' : ''}`}>
                        "We don't know who you are, and once you leave, we forget we ever met."
                    </p>
                    <p className="gp-copy-sub">
                        Muhdikhai operates on a Zero-Log policy. Random chats are held in temporary server memory only.
                        No databases, no archives, no traces. Just raw, unfiltered moments.
                    </p>
                </div>
            </div>
        </section>
    )
}
