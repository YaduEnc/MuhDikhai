import { useEffect, useRef } from 'react'
import './ExperienceBackground.css'

export default function ExperienceBackground({ phase, isTyping }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let width = canvas.width = window.innerWidth
        let height = canvas.height = window.innerHeight

        const particles = []
        const count = phase === 'matching' ? 80 : 40

        class Particle {
            constructor() {
                this.init()
            }

            init() {
                this.x = Math.random() * width
                this.y = Math.random() * height
                this.size = Math.random() * 2 + 1
                this.speedX = (Math.random() - 0.5) * 0.8
                this.speedY = (Math.random() - 0.5) * 0.8
                
                if (phase === 'vanish') {
                    this.baseColor = '#ff3333'
                } else {
                    this.baseColor = Math.random() > 0.6 ? '#ff0055' : '#00ffcc'
                }
                this.color = `${this.baseColor}11`
            }

            update(currentPhase, typing) {
                // If matching, gravitate toward center with acceleration
                if (currentPhase === 'matching') {
                    const dx = width / 2 - this.x
                    const dy = height / 2 - this.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    const force = 0.0001 * (1000 - dist)
                    this.speedX += dx * force * 0.1
                    this.speedY += dy * force * 0.1
                    this.size = Math.min(4, this.size + 0.05)
                } else {
                    this.size = Math.max(1, this.size - 0.05)
                }

                if (typing) {
                    this.speedX += (Math.random() - 0.5) * 0.2
                    this.speedY += (Math.random() - 0.5) * 0.2
                }

                this.x += this.speedX
                this.y += this.speedY

                // Speed limit
                const speedLimit = currentPhase === 'matching' ? 8 : 2
                const currentSpeed = Math.sqrt(this.speedX ** 2 + this.speedY ** 2)
                if (currentSpeed > speedLimit) {
                    this.speedX *= 0.95
                    this.speedY *= 0.95
                }

                if (this.x > width) this.x = 0
                if (this.x < 0) this.x = width
                if (this.y > height) this.y = 0
                if (this.y < 0) this.y = height
            }

            draw() {
                ctx.fillStyle = this.color
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        for (let i = 0; i < count; i++) {
            particles.push(new Particle())
        }

        let animationFrame
        let time = 0
        const animate = () => {
            ctx.fillStyle = 'rgba(2, 1, 8, 0.15)' // Motion blur effect
            ctx.fillRect(0, 0, width, height)

            time += 0.01
            const centerX = width / 2
            const centerY = height / 2

            // Draw a subtle digital mandala in the center
            ctx.save()
            ctx.translate(centerX, centerY)
            
            const rotationSpeed = phase === 'matching' ? 1.5 : 0.2
            ctx.rotate(time * rotationSpeed)

            for (let i = 0; i < 8; i++) {
                ctx.rotate(Math.PI / 4)
                const opacity = phase === 'matching' ? '0a' : '05'
                ctx.strokeStyle = i % 2 === 0 ? `#ff0055${opacity}` : `#00ffcc${opacity}`
                ctx.lineWidth = phase === 'matching' ? 2 : 1
                ctx.beginPath()
                ctx.moveTo(phase === 'matching' ? 50 : 100, 0)
                ctx.lineTo(width * 0.8, 0)
                ctx.stroke()

                // Sacred geometry node
                ctx.beginPath()
                ctx.arc(200 + Math.sin(time + i) * 50, 0, phase === 'matching' ? 3 : 2, 0, Math.PI * 2)
                ctx.fillStyle = i % 2 === 0 ? '#ff005522' : '#00ffcc22'
                ctx.fill()
            }
            ctx.restore()

            particles.forEach(p => {
                p.update(phase, isTyping)
                p.draw()
            })

            animationFrame = requestAnimationFrame(animate)
        }

        animate()

        const handleResize = () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        }

        window.addEventListener('resize', handleResize)
        return () => {
            cancelAnimationFrame(animationFrame)
            window.removeEventListener('resize', handleResize)
        }
    }, [phase])

    return (
        <div className={`experience-bg ${phase}`}>
            <canvas ref={canvasRef} />
            <div className="bg-overlay" />
            <div className="bg-gradient-radial" />
        </div>
    )
}
